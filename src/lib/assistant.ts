// AI prototype nội bộ: trả lời cơ bản từ tri thức PDF mẫu, không gọi provider,
// không cần API key. Ghi nhãn mode rõ ràng ở mọi response để không nhầm với AI live.
// Khi có provider key (Giai đoạn E), thay engine này bằng adapter provider thật.

import { KB_SECTIONS, type KbSection } from "./kb";
import { stripVi } from "./text";

export interface AssistantScope {
  lessonId?: string;
  partId?: string;
  pageNumber?: number;
  itemIds?: string[];
  quotes?: string[];
}

export interface AssistantResult {
  mode: "prototype-local";
  requestId: string;
  answer: string;
  sources: { sectionId: string; title: string; page: number; lessonId: string }[];
  scopeUsed: string;
}

const STOP = new Set(
  "là gì cái các những một những và với của trong cho từ đến khi để có không được này kia đó đây nào sao thế nào bao nhiêu tại sao làm thế vì hãy cho tôi em anh chị bạn mình ơi ạ nhé vâng xin chào hello hi ai giảng ơi trang bài học phần ghi chú chưa hiểu giải thích tóm tắt tắt ví dụ thêm về của cho".split(" "),
);

function keywords(s: string): string[] {
  return stripVi(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

function score(q: string[], sec: KbSection): number {
  const hay = new Set(keywords(`${sec.title} ${sec.text}`));
  let hit = 0;
  for (const w of q) if (hay.has(w)) hit += 1;
  // Ưu tiên từ khóa dài (tên thương hiệu, khái niệm).
  for (const w of q) if (w.length >= 5 && hay.has(w)) hit += 1;
  return hit;
}

export function answerLocal(
  message: string,
  scope: AssistantScope,
  scopeKind: "page" | "lesson" | "selection",
  requestId: string,
  sections: KbSection[] = KB_SECTIONS,
): AssistantResult {
  const q = keywords(message);
  let pool = sections;
  const inPool = (lessonId: string) => pool.filter((s) => s.lessonId === lessonId);
  let scopeUsed = "Toàn bộ tài liệu mẫu";

  if (scopeKind === "lesson" && scope.lessonId) {
    const inLesson = inPool(scope.lessonId);
    if (inLesson.length > 0) {
      pool = inLesson;
      scopeUsed = `Bài ${scope.lessonId}`;
    }
  } else if (scopeKind === "page" && scope.lessonId) {
    // Trang đang xem: ưu tiên section cùng bài chứa trang gần nhất.
    const inLesson = inPool(scope.lessonId);
    if (inLesson.length > 0) {
      pool = inLesson;
      scopeUsed = `Trang ${scope.pageNumber ?? "?"} (bài ${scope.lessonId})`;
    }
  }

  const ranked = pool
    .map((s) => ({ s, sc: score(q, s) }))
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 2);

  const contextHint =
    scope.quotes && scope.quotes.length > 0
      ? `\n\nLiên quan ghi chú đã chọn: “${scope.quotes[0].slice(0, 160)}”.`
      : "";

  if (ranked.length === 0 || ranked[0].sc === 0) {
    return {
      mode: "prototype-local",
      requestId,
      scopeUsed,
      sources: [],
      answer:
        `Mình chưa tìm thấy nội dung phù hợp trong tài liệu mẫu cho câu hỏi này (phạm vi: ${scopeUsed}). ` +
        `Bạn thử hỏi về problem statement, AI Slice, Must/Must not của Agent, ` +
        `4 bước sử dụng, hoặc metrics validation (grounded conclusion, hallucination), ` +
        `hoặc mở rộng phạm vi sang toàn bộ tài liệu.${contextHint}\n\n[Bản prototype nội bộ — không gọi provider]`,
    };
  }

  const [best, second] = ranked;
  const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}…` : x);
  const extra =
    second && second.sc > 0 && second.s.id !== best.s.id
      ? `\n\nBổ sung từ “${second.s.title}” (trang ${second.s.page}): ${clip(second.s.text, 280)}.`
      : "";
  return {
    mode: "prototype-local",
    requestId,
    scopeUsed,
    sources: ranked
      .filter((r) => r.sc > 0)
      .map((r) => ({
        sectionId: r.s.id,
        title: r.s.title,
        page: r.s.page,
        lessonId: r.s.lessonId,
      })),
    answer:
      `Theo “${best.s.title}” (trang ${best.s.page}): ${clip(best.s.text, 1200)}${extra}${contextHint}\n\n[Bản prototype nội bộ — không gọi provider]`,
  };
}
