import { z } from "zod";

const chatSchema = z.object({
  threadId: z.string().min(1),
  message: z.string().min(1).max(8000),
  scope: z.enum(["page", "lesson", "selection"]),
  scopeIds: z.object({
    lessonId: z.string().optional(),
    partId: z.string().optional(),
    pageNumber: z.number().int().positive().optional(),
    itemIds: z.array(z.string()).max(50).optional(),
  }),
});

// POST /api/ai/chat — Giai đoạn E. Chưa có provider key → 503 thật.
// Không trả lời mẫu, không setTimeout giả lập, không fake streaming.
export async function POST(req: Request) {
  const parsed = chatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_BODY", issues: parsed.error.issues },
      { status: 400 },
    );
  const requestId = `ai-${Date.now()}`;
  return Response.json(
    {
      code: "AI_NOT_CONFIGURED",
      requestId,
      message:
        "Chưa cấu hình AI provider (AI_PROVIDER_API_KEY / AI_TEXT_MODEL). " +
        "Chat AI đang BLOCKED — xem .env.example và FEATURE_PARITY.md F19.",
    },
    { status: 503 },
  );
}
