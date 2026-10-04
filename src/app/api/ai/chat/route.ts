import { z } from "zod";
import { answerLocal } from "@/lib/assistant";
import { KB_SECTIONS, type KbSection } from "@/lib/kb";
import { getKbChunks, getKbStatus } from "@/lib/kbStore";

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
  return Response.json({ ...result, kbSource });
}
