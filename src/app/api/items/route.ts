import { z } from "zod";
import { SEED_ITEMS } from "@/lib/seed";
import { supabaseNotConfiguredResponse } from "@/lib/supabase";

const sourceSchema = z.object({
  documentId: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  videoId: z.string().optional(),
  timestampMs: z.number().int().nonnegative().optional(),
  geometry: z.unknown().optional(),
  textAnchor: z.unknown().optional(),
});

const createSchema = z.object({
  courseId: z.string().min(1),
  chapterId: z.string().min(1),
  lessonId: z.string().min(1),
  partId: z.string().min(1),
  kind: z.enum(["text", "highlight", "ink", "region", "image", "video_note"]),
  source: sourceSchema,
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  quote: z.string().max(5000).optional(),
  status: z.enum(["normal", "unresolved", "resolved"]).default("normal"),
  clientOperationId: z.string().min(1),
});

// GET /api/items — đọc seed (kèm filter lessonId/partId/search đơn giản).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  const partId = searchParams.get("partId");
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const items = SEED_ITEMS.filter((it) => {
    if (lessonId && it.lessonId !== lessonId) return false;
    if (partId && it.partId !== partId) return false;
    if (q) {
      const hay = `${it.title ?? ""} ${it.body ?? ""} ${it.quote ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return Response.json({ storage: "seed-local", items });
}

// POST /api/items — cần Supabase. Chưa có env → 503 thật, client giữ draft local.
export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_BODY", issues: parsed.error.issues },
      { status: 400 },
    );
  return supabaseNotConfiguredResponse();
}
