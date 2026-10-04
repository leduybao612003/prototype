import { SEED_COURSE } from "@/lib/seed";

// GET /api/lessons/{id} — đọc seed nội dung được phép (read-only, chưa cần auth DB).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  for (const ch of SEED_COURSE.chapters) {
    const lesson = ch.lessons.find((l) => l.id === id);
    if (lesson)
      return Response.json({
        storage: "seed-local",
        courseId: SEED_COURSE.id,
        chapterId: ch.id,
        lesson,
      });
  }
  return Response.json({ code: "LESSON_NOT_FOUND" }, { status: 404 });
}
