// Resolver nguồn phân cấp dùng chung (client + server đều import được —
// KHÔNG phụ thuộc node:, không dùng state đang mở, không fallback câm).
// documentId + documentVersion + pageNumber → chapterId + lessonId + partId.
// Grouping note theo nguồn thực; sortOrder chỉ sắp trong nhóm.

import type { LearningItem } from "./types";

export interface PageMapping {
  documentId: string;
  from: number;
  to: number;
  chapterId: string;
  lessonId: string;
  partId: string;
}

// Mapping tài liệu mẫu hackathon (khớp PAGE_LESSONS cũ + LESSON_START_PAGE).
// Tài liệu khác: thêm dòng tương ứng, KHÔNG đoán theo "trang 6".
export const SAMPLE_DOC_ID = "doc-3b-hackathon";

export const PAGE_MAPPINGS: PageMapping[] = [
  { documentId: SAMPLE_DOC_ID, from: 1, to: 3, chapterId: "blas-c1", lessonId: "blas-cover", partId: "blas-cover-pdf" },
  { documentId: SAMPLE_DOC_ID, from: 4, to: 5, chapterId: "blas-c1", lessonId: "blas-feasibility", partId: "blas-feasibility-pdf" },
  { documentId: SAMPLE_DOC_ID, from: 6, to: 7, chapterId: "blas-c2", lessonId: "blas-solution", partId: "blas-solution-pdf" },
  { documentId: SAMPLE_DOC_ID, from: 8, to: 8, chapterId: "blas-c2", lessonId: "blas-ui", partId: "blas-ui-pdf" },
  { documentId: SAMPLE_DOC_ID, from: 9, to: 11, chapterId: "blas-c2", lessonId: "blas-validation", partId: "blas-validation-pdf" },
];

export interface ResolvedSource {
  chapterId: string;
  lessonId: string;
  partId: string;
}

// Trả null khi không có mapping (tài liệu lạ / trang ngoài khoảng) — phía gọi
// giữ nguồn đang chọn và hiển thị rõ, KHÔNG tự gán về chương trước.
export function resolveSource(
  documentId: string | undefined,
  pageNumber: number | undefined,
): ResolvedSource | null {
  if (!documentId || !pageNumber || !Number.isFinite(pageNumber)) return null;
  const hit = PAGE_MAPPINGS.find(
    (m) => m.documentId === documentId && pageNumber >= m.from && pageNumber <= m.to,
  );
  if (!hit) return null;
  return { chapterId: hit.chapterId, lessonId: hit.lessonId, partId: hit.partId };
}

// Sửa metadata bị gán sai theo nguồn đã xác minh. Phạm vi: đúng documentId +
// có pageNumber + resolver tìm được mapping khác metadata hiện tại.
// Giữ nguyên noteId, nội dung, annotation, trạng thái, lịch sử, sortOrder.
export function repairItemSources(items: LearningItem[]): { items: LearningItem[]; fixed: number } {
  let fixed = 0;
  const next = items.map((it) => {
    if (it.deletedAt) return it;
    const docId = it.source.documentId;
    const pg = it.source.pageNumber;
    if (docId !== SAMPLE_DOC_ID || !pg) return it;
    const r = resolveSource(docId, pg);
    if (!r) return it;
    if (r.chapterId === it.chapterId && r.lessonId === it.lessonId && r.partId === it.partId) return it;
    fixed += 1;
    return { ...it, chapterId: r.chapterId, lessonId: r.lessonId, partId: r.partId };
  });
  return { items: next, fixed };
}
