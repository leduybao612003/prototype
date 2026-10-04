import type { Course, LearningItem } from "./types";

// Seed tối thiểu theo brief §7: 1 khóa, 2 chương, 3 bài; note đủ loại ở nhiều bài;
// 2 learner + 1 coach. Nội dung tự biên soạn, không lấy từ VLearn production.
// PDF/video/lab thật (asset + transcript) đang BLOCKED — xem FEATURE_PARITY.md.

export const DEMO_LEARNERS = [
  { id: "learner-1", email: "hocvien1@prototype.local", label: "Học viên 1" },
  { id: "learner-2", email: "hocvien2@prototype.local", label: "Học viên 2" },
];
export const DEMO_COACH = {
  id: "coach-1",
  email: "coach1@prototype.local",
  label: "Coach 1",
};
export const CURRENT_USER_ID = "learner-1";

export const SEED_COURSE: Course = {
  id: "k04",
  title: "Khóa học mẫu K04 (dữ liệu seed prototype)",
  chapters: [
    {
      id: "k04-c1",
      title: "Chương 1 — Phương pháp học",
      lessons: [
        {
          id: "k04-l34-p2-t1",
          title: "Bài 1 — Đọc slide và ghi chú",
          parts: [
            {
              id: "slide-5",
              kind: "pdf",
              title: "Slide 5 — Tổng quan (PDF seed, chờ asset thật)",
              documentId: "doc-slide-5",
              pageCount: 12,
              instructorNotes: [
                {
                  id: "ins-1",
                  title: "Dặn dò của giảng viên",
                  body: "Đọc kỹ định nghĩa ở trang 2 trước khi làm bài tập trang 5.",
                },
              ],
            },
            {
              id: "video-1",
              kind: "video",
              title: "Video 1 — Cách highlight hiệu quả (chờ asset thật)",
              videoId: "vid-1",
              durationMs: 8 * 60 * 1000,
              transcriptCues: [
                { ms: 0, text: "[Seed] Mở đầu: vì sao cần ghi chú theo nguồn." },
                { ms: 45000, text: "[Seed] Ví dụ highlight một định nghĩa." },
              ],
            },
          ],
        },
        {
          id: "k04-l35-lab",
          title: "Bài 2 — Lab thực hành ghi chú",
          parts: [
            {
              id: "lab-1",
              kind: "lab",
              title: "Lab 1 — Checklist ghi chú (mẫu prototype)",
            },
          ],
        },
      ],
    },
    {
      id: "k04-c2",
      title: "Chương 2 — Ôn tập",
      lessons: [
        {
          id: "k04-l36-review",
          title: "Bài 3 — Ôn tập và hỏi AI",
          parts: [
            {
              id: "slide-9",
              kind: "pdf",
              title: "Slide 9 — Ôn tập (PDF seed, chờ asset thật)",
              documentId: "doc-slide-9",
              pageCount: 6,
            },
            {
              id: "doc-attach",
              kind: "doc",
              title: "Tài liệu đính kèm mẫu",
              attachments: [],
            },
          ],
        },
      ],
    },
  ],
};

const now = new Date().toISOString();

export const SEED_ITEMS: LearningItem[] = [
  {
    id: "item-text-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c1",
    lessonId: "k04-l34-p2-t1",
    partId: "slide-5",
    kind: "text",
    source: { documentId: "doc-slide-5", pageNumber: 2 },
    title: "Định nghĩa cần nhớ",
    body: "Ghi chú text mẫu: tóm tắt định nghĩa ở trang 2 bằng lời của mình.",
    status: "normal",
    sortOrder: 1,
    revision: 1,
    clientOperationId: "seed-text-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-hl-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c1",
    lessonId: "k04-l34-p2-t1",
    partId: "slide-5",
    kind: "highlight",
    source: { documentId: "doc-slide-5", pageNumber: 2, textAnchor: { start: 0, end: 42 } },
    quote: "Đoạn trích mẫu được highlight ở trang 2",
    body: "",
    status: "normal",
    sortOrder: 2,
    revision: 1,
    clientOperationId: "seed-hl-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-ink-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c1",
    lessonId: "k04-l34-p2-t1",
    partId: "slide-5",
    kind: "ink",
    source: { documentId: "doc-slide-5", pageNumber: 3 },
    title: "Nét viết tay trang 3",
    vectorData: { strokes: [] },
    status: "normal",
    sortOrder: 3,
    revision: 1,
    clientOperationId: "seed-ink-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-region-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c1",
    lessonId: "k04-l34-p2-t1",
    partId: "slide-5",
    kind: "region",
    source: { documentId: "doc-slide-5", pageNumber: 5 },
    title: "Vùng chưa hiểu trang 5",
    body: "Chưa hiểu công thức ở vùng đã khoanh.",
    status: "unresolved",
    sortOrder: 4,
    revision: 1,
    clientOperationId: "seed-region-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-video-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c1",
    lessonId: "k04-l34-p2-t1",
    partId: "video-1",
    kind: "video_note",
    source: { videoId: "vid-1", timestampMs: 45000 },
    title: "Note video 00:45",
    body: "Ý chính ở phút 00:45.",
    status: "normal",
    sortOrder: 5,
    revision: 1,
    clientOperationId: "seed-video-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "item-image-1",
    ownerId: "learner-1",
    courseId: "k04",
    chapterId: "k04-c2",
    lessonId: "k04-l36-review",
    partId: "slide-9",
    kind: "image",
    source: { documentId: "doc-slide-9", pageNumber: 1 },
    title: "Ảnh sơ đồ chụp từ slide",
    status: "normal",
    sortOrder: 1,
    revision: 1,
    clientOperationId: "seed-image-1",
    createdAt: now,
    updatedAt: now,
  },
];

export const SUGGESTED_QUESTIONS: { partId: string; questions: string[] }[] = [
  {
    partId: "slide-5",
    questions: [
      "Trang 2 định nghĩa khái niệm gì?",
      "Vì sao cần ghi chú theo đúng trang nguồn?",
    ],
  },
];
