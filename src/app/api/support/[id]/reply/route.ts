import { z } from "zod";
import { canReply, loadSupport, saveSupport, type Actor } from "@/lib/supportStore";
import { newClientOperationId } from "@/lib/types";

// POST /api/support/[id]/reply — chủ yêu cầu hoặc coach đúng lớp được trả lời.
// Kiểm tra quyền ở backend (không chỉ ẩn nút trên UI).
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
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "INVALID_BODY", issues: parsed.error.issues }, { status: 400 });
  const { actor, text } = parsed.data;
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
  r.replies.push({ id: newClientOperationId(), from: actor.role, text, at: now });
  if (actor.role === "coach" && r.status === "moi") r.status = "da_tra_loi";
  try {
    await saveSupport(all);
  } catch {
    return Response.json({ code: "STORE_UNAVAILABLE", message: "Kho server không ghi được." }, { status: 503 });
  }
  return Response.json({ mode: "server", request: r });
}
