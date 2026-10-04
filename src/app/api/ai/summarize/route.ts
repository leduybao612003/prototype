import { z } from "zod";
import { SAMPLE_DOC_ID } from "@/lib/seed";
import { getKbChunks, getKbStatus } from "@/lib/kbStore";
import { KB_SECTIONS, type KbSection } from "@/lib/kb";
import { aiMode, missingCredentialResponse } from "@/lib/provider";
import {
  buildProviderPrompt,
  summarizeLocal,
  type SummaryKbInput,
  type SummaryNoteInput,
} from "@/lib/summarize";

// N05 — POST /api/ai/summarize: người học chọn note/phạm vi rồi yêu cầu AI
// tổng hợp. Backend lấy nội dung đã lưu (notes do client gửi — kho server thật
// khi có Supabase) + nguồn có quyền (chỉ documentId active; KHÔNG nhận PDF
// binary/base64 ở bất kỳ trường nào), gọi AI bằng TEXT ĐÃ TRÍCH XUẤT.

const noteSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(500).optional(),
  body: z.string().max(8000).optional(),
  quote: z.string().max(2000).optional(),
  kind: z.string().max(30).optional(),
  lessonId: z.string().max(100).optional(),
  partId: z.string().max(100).optional(),
  pageNumber: z.number().int().positive().max(5000).optional(),
  status: z.string().max(30).optional(),
  documentId: z.string().max(100).optional(),
});

const bodySchema = z.object({
  instruction: z.string().min(1).max(2000),
  scope: z.object({
    lessonId: z.string().max(100).optional(),
    partId: z.string().max(100).optional(),
  }),
  notes: z.array(noteSchema).min(1).max(50),
});

async function callProvider(
  prompt: string,
): Promise<{ text: string; model: string } | { error: string }> {
  const key = process.env.AI_PROVIDER_API_KEY;
  const model = process.env.AI_TEXT_MODEL;
  const base = process.env.AI_BASE_URL;
  if (!key || !model || !base)
    return { error: "missing-key" }; // chưa cấu hình provider ngoài
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Bạn là trợ lý tổng hợp ghi chú học tập. Chỉ dùng nguồn được cấp, không bịa trang/số liệu.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { error: `provider-http-${res.status}` };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { error: "provider-empty" };
    return { text, model };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "provider-failed" };
  }
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_BODY", issues: parsed.error.issues },
      { status: 400 },
    );
  const requestId = `sum-${Date.now()}`;

  // Nguồn có quyền: chỉ giữ note thuộc documentId đang active (hackathon).
  // Note lạ documentId → loại, báo rõ số lượng để client biết.
  const { instruction, scope, notes } = parsed.data;
  const allowed = notes.filter(
    (n) => !n.documentId || n.documentId === SAMPLE_DOC_ID,
  );
  const dropped = notes.length - allowed.length;
  if (allowed.length === 0)
    return Response.json(
      {
        code: "NO_AUTHORIZED_NOTES",
        message: `Không có ghi chú nào thuộc tài liệu đang active (${dropped} bị loại vì ngoài phạm vi).`,
      },
      { status: 403 },
    );

  const clean: SummaryNoteInput[] = allowed.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    quote: n.quote,
    kind: n.kind,
    lessonId: n.lessonId,
    partId: n.partId,
    pageNumber: n.pageNumber,
    status: n.status,
  }));

  // KB từ text đã trích xuất (ingested chunks; ngã về seed tĩnh khi chưa nạp).
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
    /* ngã về tri thức mẫu */
  }
  const kbPool: SummaryKbInput[] = (
    scope.lessonId ? sections.filter((s) => s.lessonId === scope.lessonId) : sections
  ).slice(0, 6);
  const scopeLabel = scope.lessonId ?? "toàn bộ tài liệu mẫu";

  // Provider thật (nếu có key): chỉ gửi TEXT trích xuất + prompt, không PDF.
  const prompt = buildProviderPrompt(clean, kbPool, instruction, scopeLabel);
  if (aiMode() === "live") {
    const prov = await callProvider(prompt);
    if ("text" in prov) {
      const local = summarizeLocal(clean, kbPool, instruction, scopeLabel, scope.lessonId, requestId, kbSource);
      return Response.json({
        ...local,
        mode: "provider",
        model: prov.model,
        draft: `${prov.text}\n\n[Nguồn: ${local.sources.length} mục — mở từng nguồn để kiểm chứng]`,
        dropped,
      });
    }
    if (prov.error === "missing-key") return missingCredentialResponse(requestId);
    // Có key nhưng provider lỗi thật → 502 để UI báo lỗi + cho retry, không fake.
    return Response.json(
      {
        code: "PROVIDER_FAILED",
        message: `AI ngoài lỗi (${prov.error}) — bấm Thử lại.`,
        requestId,
      },
      { status: 502 },
    );
  }

  // AI_MODE=mock: engine mô phỏng nội bộ chạy thật trên text trích xuất.
  const result = summarizeLocal(
    clean,
    kbPool,
    instruction,
    scopeLabel,
    scope.lessonId,
    requestId,
    kbSource,
  );
  return Response.json({ ...result, mode: "mock", model: "mock", kbSource, dropped });
}
