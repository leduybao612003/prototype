// Mô hình dữ liệu tối thiểu theo brief §4. Server là nguồn chân lý khi có Supabase;
// client dùng cùng shape để slide và panel chia sẻ một nguồn.

export type ItemKind =
  | "text"
  | "highlight"
  | "ink"
  | "region"
  | "image"
  | "video_note";

export type ItemStatus = "normal" | "unresolved" | "resolved";

export interface LearningItem {
  id: string;
  ownerId: string;
  courseId: string;
  chapterId: string;
  lessonId: string;
  partId: string;
  kind: ItemKind;
  source: {
    documentId?: string;
    pageNumber?: number;
    videoId?: string;
    timestampMs?: number;
    geometry?: unknown;
    textAnchor?: unknown;
  };
  title?: string;
  body?: string;
  quote?: string;
  // Lịch sử các bản trước khi sửa (mới nhất trước, tối đa 5) — để người học
  // xem lại bản cũ sau khi chỉnh sửa. Bản hiện tại luôn là title/body gốc.
  history?: { title?: string; body?: string; updatedAt: string; revision: number }[];  assetId?: string;
  assetUrl?: string;
  vectorData?: unknown;
  status: ItemStatus;
  sortOrder: number;
  revision: number;
  clientOperationId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Course {
  id: string;
  title: string;
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Lesson {
  id: string;
  title: string;
  parts: LessonPart[];
}

export type PartKind = "pdf" | "video" | "lab" | "doc";

export interface LessonPart {
  id: string;
  kind: PartKind;
  title: string;
  documentId?: string;
  pageCount?: number;
  videoId?: string;
  durationMs?: number;
  assetUrl?: string;
  transcriptCues?: { ms: number; text: string }[];
  attachments?: { id: string; name: string; url: string }[];
  instructorNotes?: { id: string; title: string; body: string }[];
}

export type SaveState = "saved" | "saving" | "local-draft" | "error";

export const newClientOperationId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
