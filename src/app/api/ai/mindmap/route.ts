import { z } from "zod";
import { SAMPLE_DOC_ID } from "@/lib/seed";
import { getKbChunks, getKbStatus } from "@/lib/kbStore";
import { KB_SECTIONS, type KbSection } from "@/lib/kb";
import {
  buildLocalProposal,
  validateProposal,
  type MindmapNoteInput,
  type MindmapProposal,
} from "@/lib/mindmap";
import { aiMode, missingCredentialResponse } from "@/lib/provider";

// N06 — POST /api/ai/mindmap: nhận ghi chú đã lưu + phạm vi có quyền,
// trả structured proposal nodes/edges/uncertainties. Server validate chặt:
// dangling edges / trùng ID / schema sai → 502 (provider) hoặc không bao giờ
// lọt từ engine nội bộ. Bản gốc và bản duyệt tồn tại độc lập (client lưu
// artifact riêng, chỉ khi user duyệt).

const noteSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(500).optional(),
  body: z.string().max(8000).optional(),
  quote: z.string().max(2000).optional(),
  kind: z.string().max(30).optional(),
  lessonId: z.string().max(100).optional(),
  partId: z.string().max(100).optional(),
  pageNumber: z.number().int().positive().max(5000).optional(),
  documentId: z.string().max(100).optional(),
});

const bodySchema = z.object({
  scope: z.object({
    lessonId: z.string().max(100).optional(),
    partId: z.string().max(100).optional(),
    title: z.string().max(200).optional(),
  }),
  notes: z.array(noteSchema).min(1).max(50),
});

async function callProviderVision(
  prompt: string,
): Promise<{ proposal: MindmapProposal; model: string } | { error: string }> {
  const key = process.env.AI_PROVIDER_API_KEY;
  const model = process.env.AI_TEXT_MODEL;
  const base = process.env.AI_BASE_URL;
  if (!key || !model || !base) return { error: "missing-key" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Bạn trích xuất sơ đồ tư duy từ ghi chú học tập. Chỉ trả JSON {nodes:[{id,label,sourceItemId,uncertain}],edges:[{id,source,target,label?,uncertain}],uncertainties:[{nodeId?,edgeId?,reason}]}. Mọi liên kết suy đoán phải uncertain:true và có uncertainties. Không bịa confidence.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { error: `provider-http-${res.status}` };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return { error: "provider-empty" };
    const proposal = JSON.parse(raw) as MindmapProposal;
    const errs = validateProposal(proposal);
    if (errs.length > 0) return { error: `provider-invalid: ${errs[0]}` };
    return { proposal, model };
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
  const requestId = `mm-${Date.now()}`;
  const { scope, notes } = parsed.data;

  const allowed = notes.filter((n) => !n.documentId || n.documentId === SAMPLE_DOC_ID);
  const dropped = notes.length - allowed.length;
  if (allowed.length === 0)
    return Response.json(
      {
        code: "NO_AUTHORIZED_NOTES",
        message: `Không có ghi chú nào thuộc tài liệu đang active (${dropped} bị loại).`,
      },
      { status: 403 },
    );
  const clean: MindmapNoteInput[] = allowed.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    quote: n.quote,
    kind: n.kind,
    lessonId: n.lessonId,
    pageNumber: n.pageNumber,
  }));

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
  const kbPool = (scope.lessonId
    ? sections.filter((s) => s.lessonId === scope.lessonId)
    : sections
  ).slice(0, 6);
  const scopeTitle = scope.title ?? scope.lessonId ?? "Sơ đồ ghi chú";
  const sources = [
    ...clean.map((n) => ({
      kind: "note" as const,
      refId: n.id,
      title: n.title || (n.body ?? n.quote ?? n.id).slice(0, 60),
      page: n.pageNumber ?? null,
      lessonId: n.lessonId ?? "",
    })),
    ...kbPool.map((s) => ({
      kind: "kb" as const,
      refId: s.id,
      title: s.title,
      page: s.page,
      lessonId: s.lessonId,
    })),
  ];

  if (aiMode() === "live") {
    const prompt =
      `Phạm vi: ${scopeTitle}.\n` +
      clean
        .map(
          (n, i) =>
            `[${i + 1} | id=${n.id} | ${n.kind ?? "text"} | tr.${n.pageNumber ?? "?"}] ${n.title ?? ""} — ${n.body ?? ""} — ${n.quote ?? ""}`,
        )
        .join("\n");
    const prov = await callProviderVision(prompt);
    if ("proposal" in prov)
      return Response.json({
        mode: "provider",
        model: prov.model,
        requestId,
        proposal: prov.proposal,
        sources,
        noteCount: clean.length,
        kbSource,
        dropped,
      });
    if (prov.error === "missing-key") return missingCredentialResponse(requestId);
    return Response.json(
      { code: "PROVIDER_FAILED", message: `AI ngoài lỗi (${prov.error}) — bấm Thử lại.`, requestId },
      { status: 502 },
    );
  }

  // AI_MODE=mock: proposal mô phỏng từ dữ liệu mẫu, ghi nhãn rõ.
  const proposal = buildLocalProposal(
    clean,
    scopeTitle,
    kbPool.map((s) => ({ id: s.id, title: s.title, page: s.page })),
  );
  return Response.json({
    mode: "mock",
    model: "mock",
    requestId,
    proposal,
    sources,
    noteCount: clean.length,
    kbSource,
    dropped,
  });
}
