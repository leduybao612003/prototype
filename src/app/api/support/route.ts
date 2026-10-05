import { z } from "zod";
import {
  canRead,
  canSetStatus,
  loadSupport,
  saveSupport,
  type Actor,
  type SupportRequest,
} from "@/lib/supportStore";
import { newClientOperationId } from "@/lib/types";
import { resolveSource, SAMPLE_DOC_ID } from "@/lib/lessonMap";

const actorSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(["learner", "coach"]),
  classId: z.string().max(100).optional(),
});

const createSchema = z.object({
  actor: actorSchema,
  classId: z.string().min(1).max(100),
  kind: z.enum(["HoTro", "DiemCong"]),
  lessonId: z.string().min(1).max(100),
  partId: z.string().min(1).max(100),
  page: z.number().int().positive().max(5000).optional(),
  text: z.string().min(1).max(2000),
  crop: z.string().max(1_000_000).optional(),
  noteId: z.string().max(200).optional(),
  docVersion: z.string().max(100).optional(),
  documentId: z.string().max(100).optional(),
});

function forbidden(message: string) {
  return Response.json({ code: "FORBIDDEN", message }, { status: 403 });
}

function unavailable() {
  return Response.json(
    {
      code: "STORE_UNAVAILABLE",
      message:
        "Kho server không ghi/đọc được (Vercel Functions dùng filesystem ephemeral — xem DEPLOYMENT.md). " +
        "Client giữ bản local; coach ở trình duyệt khác chưa thấy. Cần Supabase cho chia sẻ production.",
    },
    { status: 503 },
  );
}

// GET /api/support?actorId=&role=&classId= — danh sách theo quyền.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = actorSchema.extend({}).safeParse({
    id: searchParams.get("actorId"),
    role: searchParams.get("role"),
    classId: searchParams.get("classId") ?? undefined,
  });
  if (!parsed.success)
    return Response.json({ code: "INVALID_QUERY", issues: parsed.error.issues }, { status: 400 });
  const actor = parsed.data as Actor;
  let all: SupportRequest[];
  try {
    all = await loadSupport();
  } catch {
    return unavailable();
  }
  return Response.json({ mode: "server", requests: all.filter((r) => canRead(r, actor)) });
}

// POST /api/support — learner tạo yêu cầu (coach không tạo).
export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "INVALID_BODY", issues: parsed.error.issues }, { status: 400 });
  const { actor, ...rest } = parsed.data;
  if (actor.role !== "learner")
    return forbidden("Chỉ học viên tạo yêu cầu hỗ trợ (coach dùng trả lời/đổi trạng thái).");
  // Kiểm tra mapping nguồn trước khi lưu: document + trang đã biết phải khớp
  // Chương/Bài/Part khai báo (chống note gán sai nguồn như bug trang 6).
  if (rest.documentId === SAMPLE_DOC_ID && rest.page) {
    const r = resolveSource(rest.documentId, rest.page);
    if (r && (r.lessonId !== rest.lessonId || r.partId !== rest.partId))
      return Response.json(
        {
          code: "MAPPING_MISMATCH",
          message: `Nguồn khai báo (${rest.lessonId}/${rest.partId}) không khớp mapping trang ${rest.page} (${r.lessonId}/${r.partId}).`,
        },
        { status: 400 },
      );
  }
  const now = new Date().toISOString();
  const r: SupportRequest = {
    id: newClientOperationId(),
    learnerId: actor.id,
    status: "moi",
    replies: [],
    createdAt: now,
    ...rest,
  };
  if (r.crop && !r.crop.startsWith("data:image/"))
    return Response.json({ code: "INVALID_IMAGE", message: "Crop phải là dataURL ảnh." }, { status: 400 });
  let all: SupportRequest[];
  try {
    all = await loadSupport();
    all.unshift(r);
    await saveSupport(all);
  } catch {
    return unavailable();
  }
  return Response.json({ mode: "server", request: r });
}

// PATCH /api/support — đổi trạng thái (chỉ coach đúng lớp).
export async function PATCH(req: Request) {
  const parsed = z
    .object({
      actor: actorSchema,
      id: z.string().min(1),
      status: z.enum(["moi", "dang_xu_ly", "da_tra_loi"]),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "INVALID_BODY", issues: parsed.error.issues }, { status: 400 });
  const { actor, id, status } = parsed.data;
  let all: SupportRequest[];
  try {
    all = await loadSupport();
  } catch {
    return unavailable();
  }
  const r = all.find((x) => x.id === id);
  if (!r) return Response.json({ code: "NOT_FOUND", message: "Không thấy yêu cầu." }, { status: 404 });
  if (!canSetStatus(r, actor as Actor))
    return forbidden("Chỉ coach đúng lớp được đổi trạng thái (đã kiểm tra ở backend).");
  r.status = status;
  try {
    await saveSupport(all);
  } catch {
    return unavailable();
  }
  return Response.json({ mode: "server", request: r });
}
