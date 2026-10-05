// Kho hỗ trợ learner↔coach phía server (file local ./data — chuyển Supabase khi
// có key). Dùng chung cho mọi phiên/trình duyệt cùng origin nên coach ở phiên
// khác THỰC SỰ đọc được yêu cầu (không chỉ localStorage một trình duyệt).
// LƯU Ý Vercel: filesystem của Function là ephemeral — ghi có thể thất bại/mất
// khi scale; khi đó API trả 503 và client ngã về kho local (ghi rõ trong UI).
// Quyền ở đây là kiểm tra vai trò khai báo (chưa Auth thật — cần Supabase Auth
// + RLS cho production; xem supabase/migrations/0001_init.sql).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SupportReply {
  id: string;
  from: "learner" | "coach";
  text: string;
  at: string;
}

export interface SupportRequest {
  id: string;
  learnerId: string;
  classId: string;
  kind: "HoTro" | "DiemCong";
  lessonId: string;
  partId: string;
  page?: number;
  text: string;
  status: "moi" | "dang_xu_ly" | "da_tra_loi";
  replies: SupportReply[];
  createdAt: string;
  crop?: string;
  quote?: string;
  noteId?: string;
  docVersion?: string;
  // rev tăng mỗi lần trả lời/đổi trạng thái — client merge lấy bản rev cao hơn.
  rev: number;
  coachUnread: boolean;
  learnerUnread: boolean;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "support.json");

// Kho file chỉ dùng được khi filesystem ghi thật. Trên Vercel (biến VERCEL=1,
// filesystem ephemeral/read-only) kho này KHÔNG dùng được → routes trả 503
// để client ngã local trung thực (không bao giờ ghi đè local bằng [] rỗng).
export async function storeAvailable(): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function loadSupport(): Promise<SupportRequest[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const arr = JSON.parse(raw) as SupportRequest[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveSupport(all: SupportRequest[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(all));
}

export type Actor = { id: string; role: "learner" | "coach"; classId?: string };

// Quyền đọc: learner chỉ yêu cầu của mình; coach chỉ lớp mình phụ trách.
export function canRead(r: SupportRequest, actor: Actor): boolean {
  if (actor.role === "learner") return r.learnerId === actor.id;
  return !!actor.classId && r.classId === actor.classId;
}

// Quyền trả lời: chủ yêu cầu, hoặc coach đúng lớp.
export function canReply(r: SupportRequest, actor: Actor): boolean {
  if (actor.role === "learner") return r.learnerId === actor.id;
  return !!actor.classId && r.classId === actor.classId;
}

// Quyền đổi trạng thái: chỉ coach đúng lớp.
export function canSetStatus(r: SupportRequest, actor: Actor): boolean {
  return actor.role === "coach" && !!actor.classId && r.classId === actor.classId;
}
