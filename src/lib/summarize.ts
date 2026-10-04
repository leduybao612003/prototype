// N05 — Tổng hợp ghi chú theo yêu cầu (server-side).
// Chạy thật trên TEXT ĐÃ TRÍCH XUẤT (nội dung note đã lưu + chunk KB),
// KHÔNG nhận PDF binary/base64 ở bất kỳ tham số nào.
// Engine mặc định: prototype-local (trích xuất + gom nhóm, ghi nhãn rõ).
// Khi có AI provider key (AI_PROVIDER_API_KEY + AI_TEXT_MODEL), route sẽ gọi
// provider với đúng các text này; prompt và text gửi đi được log kèm requestId.

import { stripVi } from "./text";

export interface SummaryNoteInput {
  id: string;
  title?: string;
  body?: string;
  quote?: string;
  kind?: string;
  lessonId?: string;
  partId?: string;
  pageNumber?: number;
  status?: string;
}

export interface SummaryKbInput {
  id: string;
  lessonId: string;
  page: number;
  title: string;
  text: string;
}

export interface SummarySource {
  kind: "note" | "kb";
  refId: string;
  title: string;
  page: number | null;
  lessonId: string;
}

export interface SummaryResult {
  mode: "prototype-local" | "provider";
  requestId: string;
  model: string;
  draft: string;
  sources: SummarySource[];
  noteCount: number;
  kbSource: string;
}

const STOP = new Set(
  "là gì cái các những một những và với của trong cho từ đến khi để có không được này kia đó đây nào sao thế nào bao nhiêu tại sao làm thế vì hãy cho tôi em anh chị bạn mình ơi ạ nhé vâng xin chào hello hi ai giảng ơi trang bài học phần ghi chú chưa hiểu giải thích tóm tắt tắt ví dụ thêm về của cho hay gom tổng hợp hợp lại giúp".split(
    " ",
  ),
);

function keywords(s: string): string[] {
  return stripVi(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

const clip = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}…` : x);

function noteCore(n: SummaryNoteInput): string {
  const raw = (n.quote ? `“${n.quote}”` : (n.body || n.title || "")).trim();
  return clip(raw, 220);
}

// Gom nhóm ý chính theo từ khóa chung (thay vì liệt kê phẳng): các note chia
// sẻ ≥1 từ khóa nội dung dài (≥4 ký tự) được gom thành một nhóm.
function groupNotes(notes: SummaryNoteInput[]): SummaryNoteInput[][] {
  const groups: SummaryNoteInput[][] = [];
  for (const n of notes) {
    const keys = new Set(keywords(`${n.title ?? ""} ${n.body ?? ""} ${n.quote ?? ""}`).filter((w) => w.length >= 4));
    let placed = false;
    for (const g of groups) {
      const gkeys = new Set(
        g.flatMap((m) =>
          keywords(`${m.title ?? ""} ${m.body ?? ""} ${m.quote ?? ""}`).filter((w) => w.length >= 4),
        ),
      );
      for (const k of keys)
        if (gkeys.has(k)) {
          g.push(n);
          placed = true;
          break;
        }
      if (placed) break;
    }
    if (!placed) groups.push([n]);
  }
  return groups;
}

function pickKbContext(
  instruction: string,
  notes: SummaryNoteInput[],
  kb: SummaryKbInput[],
  lessonId?: string,
): SummaryKbInput[] {
  const q = new Set(keywords(`${instruction} ${notes.map((n) => `${n.title ?? ""} ${n.body ?? ""} ${n.quote ?? ""}`).join(" ")}`));
  if (q.size === 0) return [];
  const pool = lessonId ? kb.filter((s) => s.lessonId === lessonId) : kb;
  const hay = (lessonId && pool.length > 0 ? pool : kb) as SummaryKbInput[];
  return hay
    .map((s) => {
      const words = new Set(keywords(`${s.title} ${s.text}`));
      let sc = 0;
      for (const w of q) if (words.has(w)) sc += w.length >= 5 ? 2 : 1;
      return { s, sc };
    })
    .filter((r) => r.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 2)
    .map((r) => r.s);
}

export function summarizeLocal(
  notes: SummaryNoteInput[],
  kb: SummaryKbInput[],
  instruction: string,
  scopeLabel: string,
  lessonId: string | undefined,
  requestId: string,
  kbSource: string,
): SummaryResult {
  const ok = notes.filter((n) => n.status !== "unresolved");
  const un = notes.filter((n) => n.status === "unresolved");
  const lines: string[] = [
    `Tổng hợp ${notes.length} ghi chú (${scopeLabel}) theo yêu cầu: “${instruction}”.`,
    "",
  ];
  if (ok.length > 0) {
    lines.push("Ý chính (gom nhóm theo chủ đề):");
    const groups = groupNotes(ok);
    groups.forEach((g, gi) => {
      if (groups.length > 1) lines.push(`Nhóm ${gi + 1} (${g.length} ghi chú):`);
      for (const n of g) {
        const core = noteCore(n);
        if (!core) continue;
        const where = n.pageNumber ? `tr.${n.pageNumber}` : "không rõ trang";
        lines.push(`- ${core} [ghi chú ${n.kind ?? "text"}, ${where}]`);
      }
    });
    lines.push("");
  }
  if (un.length > 0) {
    lines.push("Điểm chưa hiểu còn mở:");
    for (const n of un) {
      const core = noteCore(n);
      if (!core) continue;
      lines.push(`- ${core} [tr.${n.pageNumber ?? "?"} — còn mở]`);
    }
    lines.push("");
  }
  const ctx = pickKbContext(instruction, notes, kb, lessonId);
  if (ctx.length > 0) {
    lines.push("Bối cảnh từ tài liệu (text đã trích xuất):");
    for (const s of ctx)
      lines.push(`- “${s.title}” (trang ${s.page}): ${clip(s.text, 300)}`);
    lines.push("");
  }
  lines.push("[Bản tổng hợp bởi AI nội bộ trên text đã trích xuất — không gửi PDF]");

  const sources: SummarySource[] = [
    ...notes.map((n) => ({
      kind: "note" as const,
      refId: n.id,
      title: n.title || noteCore(n).slice(0, 60) || n.id,
      page: n.pageNumber ?? null,
      lessonId: n.lessonId ?? "",
    })),
    ...ctx.map((s) => ({
      kind: "kb" as const,
      refId: s.id,
      title: s.title,
      page: s.page,
      lessonId: s.lessonId,
    })),
  ];
  return {
    mode: "prototype-local",
    requestId,
    model: "prototype-local",
    draft: lines.join("\n"),
    sources,
    noteCount: notes.length,
    kbSource,
  };
}

// Prompt cho provider ngoài (nếu có key): CHỈ chứa text đã trích xuất.
export function buildProviderPrompt(
  notes: SummaryNoteInput[],
  kb: SummaryKbInput[],
  instruction: string,
  scopeLabel: string,
): string {
  const noteBlock = notes
    .map(
      (n, i) =>
        `[Ghi chú ${i + 1} | id=${n.id} | ${n.kind ?? "text"} | tr.${n.pageNumber ?? "?"}]\nTiêu đề: ${n.title ?? ""}\nNội dung: ${n.body ?? ""}\nTrích dẫn: ${n.quote ?? ""}`,
    )
    .join("\n---\n");
  const kbBlock = kb
    .slice(0, 6)
    .map((s) => `[Tài liệu: ${s.title} | trang ${s.page}]\n${clip(s.text, 600)}`)
    .join("\n---\n");
  return (
    `Bạn tổng hợp ghi chú học tập theo yêu cầu. Phạm vi: ${scopeLabel}.\n` +
    `Yêu cầu của người học: ${instruction}\n\n` +
    `GHI CHÚ ĐÃ LƯU:\n${noteBlock}\n\n` +
    `BỐI CẢNH TÀI LIỆU (text trích xuất):\n${kbBlock}\n\n` +
    `Trả về: 1) Ý chính gom nhóm theo chủ đề, mỗi ý kèm [tr.số trang]; ` +
    `2) Điểm chưa hiểu còn mở; 3) Không bịa nguồn ngoài danh sách trên.`
  );
}
