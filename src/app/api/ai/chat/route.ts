import { z } from "zod";
import { answerLocal } from "@/lib/assistant";
import { KB_SECTIONS, type KbSection } from "@/lib/kb";
import { getKbChunks, getKbStatus } from "@/lib/kbStore";
import {
  aiMode,
  callChatCompletions,
  liveConfig,
  missingCredentialResponse,
} from "@/lib/provider";

const chatSchema = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1).max(8000),
  scope: z.enum(["page", "lesson", "selection"]),
  scopeIds: z.object({
    lessonId: z.string().optional(),
    partId: z.string().optional(),
    pageNumber: z.number().int().positive().optional(),
    itemIds: z.array(z.string()).max(50).optional(),
    quotes: z.array(z.string()).max(50).optional(),
  }),
  // stream:true → server pipe SSE thật từ provider (không mô phỏng);
  // thiếu key thì 503 STREAM_BLOCKED rõ ràng.
  stream: z.boolean().optional(),
});

// POST /api/ai/chat — AI prototype nội bộ (theo yêu cầu 05/10/2026: tương tác và
// trả lời cơ bản, chưa cần API key). Nguồn trả lời: chunks từ pipeline ingestion
// (GET /api/kb/status ready) — mỗi chunk giữ documentId/lessonId/pageNumber nên
// citation mở đúng trang; chưa nạp thì dùng tri thức mẫu trong code.
export async function POST(req: Request) {
  const parsed = chatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_BODY", issues: parsed.error.issues },
      { status: 400 },
    );
  const requestId = `ai-${Date.now()}`;

  // Nhánh stream thật: pipe byte SSE từ provider OpenAI-compatible về client.
  // Server không dựng token giả; ngắt kết nối client cũng ngắt upstream.
  if (parsed.data.stream) {
    const key = process.env.AI_PROVIDER_API_KEY;
    const model = process.env.AI_TEXT_MODEL;
    const base = process.env.AI_BASE_URL;
    if (!key || !model || !base)
      return Response.json(
        {
          code: "STREAM_BLOCKED",
          message:
            "Chưa cấu hình AI provider (thiếu AI_PROVIDER_API_KEY / AI_TEXT_MODEL) — streaming thật chưa gọi được. Tắt Stream để dùng bản trả lời chuẩn, hoặc cấu hình xong bấm Thử lại.",
          requestId,
        },
        { status: 503 },
      );
    try {
      const ctrl = new AbortController();
      req.signal.addEventListener("abort", () => ctrl.abort());
      const quoteCtx = (parsed.data.scopeIds.quotes ?? []).slice(0, 5).join("\n");
      const upstream = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "Bạn là trợ giảng tiếng Việt. Dùng tài liệu được cung cấp trong phạm vi người học đã chọn. Nêu đúng nguồn hỗ trợ kết luận; thiếu nguồn thì nói rõ.",
            },
            {
              role: "user",
              content: `Phạm vi: ${parsed.data.scope}${parsed.data.scopeIds.lessonId ? `, bài ${parsed.data.scopeIds.lessonId}` : ""}${parsed.data.scopeIds.pageNumber ? `, trang ${parsed.data.scopeIds.pageNumber}` : ""}.\n${quoteCtx ? `Ghi chú đã chọn:\n${quoteCtx}\n` : ""}Câu hỏi: ${parsed.data.message}`,
            },
          ],
          temperature: 0.4,
        }),
        signal: ctrl.signal,
      });
      if (!upstream.ok || !upstream.body)
        return Response.json(
          { code: "PROVIDER_FAILED", message: `Provider stream lỗi (HTTP_${upstream.status}).`, requestId },
          { status: 502 },
        );
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Request-Id": requestId,
        },
      });
    } catch (e) {
      return Response.json(
        { code: "PROVIDER_FAILED", message: e instanceof Error ? e.message : "Stream thất bại.", requestId },
        { status: 502 },
      );
    }
  }

  let sections: KbSection[] = KB_SECTIONS;
  let kbSource = "static-seed";
  try {
    const status = await getKbStatus();
    if (status.ready) {
      const chunks = await getKbChunks();
      if (chunks.length > 0) {
        sections = chunks.map((c) => ({
          id: c.id,
          lessonId: c.lessonId,
          page: c.pageNumber,
          title: c.title,
          text: c.text,
        }));
        kbSource = `ingested:${status.filename}`;
      }
    }
  } catch {
    /* ngã về tri thức mẫu khi kho đọc lỗi */
  }

  const result = answerLocal(
    parsed.data.message,
    {
      lessonId: parsed.data.scopeIds.lessonId,
      partId: parsed.data.scopeIds.partId,
      pageNumber: parsed.data.scopeIds.pageNumber,
      itemIds: parsed.data.scopeIds.itemIds,
      quotes: parsed.data.scopeIds.quotes,
    },
    parsed.data.scope,
    requestId,
    sections,
  );

  // AI_MODE=mock (mặc định demo): engine mô phỏng nội bộ, citations từ nguồn thực.
  if (aiMode() === "mock") return Response.json({ ...result, mode: "mock", kbSource });

  // AI_MODE=live: provider thật với context text đã trích xuất; sources vẫn từ
  // retrieval có validate (không để model tự bịa URL).
  const cfg = liveConfig();
  if (!cfg) return missingCredentialResponse(requestId);
  const pool =
    parsed.data.scopeIds.lessonId != null
      ? sections.filter((s) => s.lessonId === parsed.data.scopeIds.lessonId)
      : sections;
  const ctx = (pool.length > 0 ? pool : sections)
    .slice(0, 6)
    .map((s) => `[${s.title} | tr.${s.page}] ${s.text.slice(0, 600)}`)
    .join("\n---\n");
  const quoteCtx = (parsed.data.scopeIds.quotes ?? []).slice(0, 5).join("\n");
  const prov = await callChatCompletions(cfg.model, [
    {
      role: "system",
      content:
        "Bạn là trợ giảng tiếng Việt. Dùng tài liệu được cung cấp trong phạm vi người học đã chọn. Nêu đúng nguồn hỗ trợ kết luận; thiếu nguồn thì nói rõ.",
    },
    {
      role: "user",
      content: `Phạm vi: ${parsed.data.scope}.\nTài liệu:\n${ctx}\n${quoteCtx ? `Ghi chú đã chọn:\n${quoteCtx}\n` : ""}Câu hỏi: ${parsed.data.message}`,
    },
  ]);
  if ("error" in prov)
    return Response.json(
      { code: "PROVIDER_FAILED", message: `AI live lỗi (${prov.error}) — bấm Thử lại.`, requestId },
      { status: 502 },
    );
  return Response.json({ ...result, answer: prov.text, mode: "provider", model: prov.model, kbSource });
}
