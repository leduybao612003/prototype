import type { Course, LearningItem } from "./types";

// Seed theo file PDF mẫu "3B-Zone2-BLAS-HackathonPresentation.pdf"
// (slide hackathon AI20k LAB Workflow Guide Agent, 11 trang).
// Mọi bài dùng chung documentId; pageNumber trỏ đúng trang trong file.

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

export const SAMPLE_PDF_URL = "/sample.pdf";
export const SAMPLE_DOC_ID = "doc-3b-hackathon";

const pdf = (
  id: string,
  title: string,
  instructorNotes?: { id: string; title: string; body: string }[],
) => ({
  id,
  kind: "pdf" as const,
  title,
  documentId: SAMPLE_DOC_ID,
  assetUrl: SAMPLE_PDF_URL,
  instructorNotes,
});

export const SEED_COURSE: Course = {
  id: "blas",
  title: "AI20k LAB Workflow Guide Agent — Slide Hackathon (file mẫu)",
  chapters: [
    {
      id: "blas-c1",
      title: "Phần 1 — Vấn đề & Tính khả thi",
      lessons: [
        {
          id: "blas-cover",
          title: "Bài 1 — Cover + Problem + Survey",
          parts: [
            pdf("blas-cover-pdf", "Cover, Problem, Internal Survey (trang 1–3)", [
              {
                id: "ins-0",
                title: "Dặn dò của giảng viên",
                body: "Nắm problem statement trang 4 trước khi xem giải pháp ở trang 6–7.",
              },
            ]),
          ],
        },
        {
          id: "blas-feasibility",
          title: "Bài 2 — Product Feasibility",
          parts: [pdf("blas-feasibility-pdf", "Problem statement + Solution (trang 4–5)")],
        },
      ],
    },
    {
      id: "blas-c2",
      title: "Phần 2 — Giải pháp & Kiểm chứng",
      lessons: [
        {
          id: "blas-solution",
          title: "Bài 3 — Competitors + AI Slice",
          parts: [pdf("blas-solution-pdf", "Đối thủ + AI Slice + ranh giới (trang 6–7)")],
        },
        {
          id: "blas-ui",
          title: "Bài 4 — UI Overview",
          parts: [pdf("blas-ui-pdf", "4 bước sử dụng (trang 8)")],
        },
        {
          id: "blas-validation",
          title: "Bài 5 — Validation & User Testing",
          parts: [pdf("blas-validation-pdf", "Metrics + user testing (trang 9–10)")],
        },
      ],
    },
  ],
};

// Trang bắt đầu đọc mặc định của từng bài.
export const LESSON_START_PAGE: Record<string, number> = {
  "blas-cover": 1,
  "blas-feasibility": 4,
  "blas-solution": 6,
  "blas-ui": 8,
  "blas-validation": 9,
};

const now = new Date().toISOString();

function seedItem(
  id: string,
  lessonId: string,
  partId: string,
  kind: LearningItem["kind"],
  chapterId: string,
  extra: Partial<LearningItem>,
): LearningItem {
  return {
    id,
    ownerId: "learner-1",
    courseId: "blas",
    chapterId,
    lessonId,
    partId,
    kind,
    source: { documentId: SAMPLE_DOC_ID, pageNumber: 1 },
    status: "normal",
    sortOrder: 1,
    revision: 1,
    clientOperationId: `seed-${id}`,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

export const SEED_ITEMS: LearningItem[] = [
  seedItem("item-text-1", "blas-feasibility", "blas-feasibility-pdf", "text", "blas-c1", {
    source: { documentId: SAMPLE_DOC_ID, pageNumber: 4 },
    title: "Problem statement",
    body: "Học viên non-tech khó đọc hiểu file markdown: đâu bắt buộc, đâu gợi ý, quy trình nào, tiêu chí nào.",
    sortOrder: 1,
  }),
  seedItem("item-hl-1", "blas-solution", "blas-solution-pdf", "highlight", "blas-c2", {
    source: {
      documentId: SAMPLE_DOC_ID,
      pageNumber: 7,
      textAnchor: { start: 0, end: 42 },
    },
    quote: "chỉ đưa ra hướng dẫn khi truy xuất được nguồn tương ứng",
    body: "",
    sortOrder: 2,
  }),
  seedItem("item-region-1", "blas-validation", "blas-validation-pdf", "region", "blas-c2", {
    source: { documentId: SAMPLE_DOC_ID, pageNumber: 10 },
    title: "Vùng chưa hiểu trang 10",
    body: "Vì sao hallucination 12,5% mà answer accuracy vẫn 91,7%?",
    status: "unresolved",
    sortOrder: 3,
  }),
];

export const SUGGESTED_QUESTIONS: { partId: string; questions: string[] }[] = [
  {
    partId: "blas-feasibility-pdf",
    questions: [
      "Problem statement của nhóm là gì?",
      "Bao nhiêu % học viên sẵn sàng dùng sản phẩm?",
    ],
  },
  {
    partId: "blas-solution-pdf",
    questions: ["AI Slice gồm những gì?", "Must not của Agent là gì?"],
  },
  {
    partId: "blas-ui-pdf",
    questions: ["4 bước sử dụng là gì?", "Current Step khác Viewing Step thế nào?"],
  },
  {
    partId: "blas-validation-pdf",
    questions: ["Metric nào chưa đạt?", "Vì sao hallucination 12,5%?"],
  },
];
