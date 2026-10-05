import { z } from "zod";
import { canReply, loadSupport, saveSupport, storeAvailable, type Actor } from "@/lib/supportStore";

// POST /api/support/[id]/reply — chủ yêu cầu hoặc coach đúng lớp được trả lời.
// Kiểm tra quyền ở backend (không chỉ ẩn nút trên UI). Reply idempotent theo
// clientId để retry không tạo trùng.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z
    .object({
      actor: z.object({
        id: z.string().min(1).max(100),
        role: z.enum(["learner", "coach"]),
        classId: z.string().max(100).optional(),
      }),
      text: z.string().min(1).max(2000),
      clientId: z.string().min(1).max(200).optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "INVALID_BODY", issues: parsed.error.issues }, { status: 400 });
  const { actor, text, clientId } = parsed.data;
  if (!(await storeAvailable()))
    return Response.json({ code: "STORE_UNAVAILABLE", message: "Kho server không dùng được." }, { status: 503 });
  let all;
  try {
    all = await loadSupport();
  } catch {
    return Response.json({ code: "STORE_UNAVAILABLE", message: "Kho server không đọc được." }, { status: 503 });
  }
  const r = all.find((x) => x.id === id);
  if (!r) return Response.json({ code: "NOT_FOUND", message: "Không thấy yêu cầu." }, { status: 404 });
  if (!canReply(r, actor as Actor))
    return Response.json(
      { code: "FORBIDDEN", message: "Bạn không có quyền trả lời yêu cầu này (đã kiểm tra ở backend)." },
      { status: 403 },
    );
  const now = new Date().toISOString();
  if (clientId && r.replies.some((m) => m.id === clientId))
    return Response.json({ mode: "server", request: r, deduped: true });
  r.replies.push({
    id: clientId ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    from: actor.role,
    text,
    at: now,
  });
  r.rev += 1;
  if (actor.role === "coach") {
    if (r.status === "moi") r.status = "da_tra_loi";
    r.coachUnread = false;
    r.learnerUnread = true;
  } else {
    r.coachUnread = true;
    r.learnerUnread = false;
  }
  try {
    await saveSupport(all);
  } catch {
    return Response.json({ code: "STORE_UNAVAILABLE", message: "Kho server không ghi được." }, { status: 503 });
  }
  return Response.json({ mode: "server", request: r });
}
