// Kho KB phía server cho prototype (file local ./data — chuyển Supabase/pgvector
// khi có key). Pipeline ingestion: upload → parse → chunk → index → store.
// Mỗi stage ghi trạng thái riêng; KB chỉ "Sẵn sàng" khi mọi stage ok.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StageStatus = "pending" | "ok" | "error" | "skipped";

export interface IngestStage {
  name: string;
  status: StageStatus;
  detail: string;
}

export interface KbChunk {
  id: string;
  documentId: string;
  chapterId: string;
  lessonId: string;
  pageNumber: number;
  title: string;
  text: string;
  charCount: number;
}

export interface KbStatus {
  ready: boolean;
  documentId: string;
  filename: string;
  sha256: string;
  totalPages: number;
  chunkCount: number;
  emptyPages: number[];
  stages: IngestStage[];
  updatedAt: string;
  error?: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STATUS_FILE = path.join(DATA_DIR, "kb-status.json");
const CHUNKS_FILE = path.join(DATA_DIR, "kb-chunks.json");

const MAX_BYTES = 20 * 1024 * 1024;
const MIN_CHARS = 50; // trang ít chữ hơn ngưỡng → liệt kê cần OCR, không bỏ qua âm thầm

// Ánh xạ trang → bài học từ file mẫu hackathon (đối chiếu lại khi reader báo số trang thật).
const PAGE_LESSONS: { from: number; to: number; chapterId: string; lessonId: string }[] = [
  { from: 1, to: 3, chapterId: "blas-c1", lessonId: "blas-cover" },
  { from: 4, to: 5, chapterId: "blas-c1", lessonId: "blas-feasibility" },
  { from: 6, to: 7, chapterId: "blas-c2", lessonId: "blas-solution" },
  { from: 8, to: 8, chapterId: "blas-c2", lessonId: "blas-ui" },
  { from: 9, to: 11, chapterId: "blas-c2", lessonId: "blas-validation" },
];

export function lessonForPage(page: number) {
  const hit = PAGE_LESSONS.find((r) => page >= r.from && page <= r.to);
  return hit ?? { chapterId: "blas-c1", lessonId: "blas-cover" };
}

const EMPTY_STATUS: KbStatus = {
  ready: false,
  documentId: "",
  filename: "",
  sha256: "",
  totalPages: 0,
  chunkCount: 0,
  emptyPages: [],
  stages: [],
  updatedAt: "",
};

export async function getKbStatus(): Promise<KbStatus> {
  try {
    const raw = await readFile(STATUS_FILE, "utf8");
    return JSON.parse(raw) as KbStatus;
  } catch {
    return { ...EMPTY_STATUS };
  }
}

export async function getKbChunks(): Promise<KbChunk[]> {
  try {
    const raw = await readFile(CHUNKS_FILE, "utf8");
    const arr = JSON.parse(raw) as KbChunk[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function ingestPdf(
  bytes: Uint8Array,
  filename: string,
  documentId: string,
): Promise<{ status: KbStatus; deduped: boolean }> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const prev = await getKbStatus();
  if (prev.ready && prev.sha256 === sha256 && prev.documentId === documentId) {
    return { status: prev, deduped: true }; // không tạo dữ liệu trùng
  }

  const stages: IngestStage[] = [];
  const fail = (name: string, detail: string): { status: KbStatus; deduped: boolean } => {
    stages.push({ name, status: "error", detail });
    const status: KbStatus = {
      ready: false,
      documentId,
      filename,
      sha256,
      totalPages: 0,
      chunkCount: 0,
      emptyPages: [],
      stages,
      updatedAt: new Date().toISOString(),
      error: `${name}: ${detail}`,
    };
    return { status, deduped: false };
  };

  // Stage 1 — upload: nhận bytes, kiểm tra kích thước, lưu bản gốc (best effort local).
  if (bytes.length === 0) return fail("upload", "File rỗng.");
  if (bytes.length > MAX_BYTES)
    return fail("upload", `File ${(bytes.length / 1048576).toFixed(1)}MB vượt giới hạn 20MB.`);
  await mkdir(path.join(DATA_DIR, "uploads"), { recursive: true });
  try {
    await writeFile(path.join(DATA_DIR, "uploads", `${sha256}.pdf`), bytes);
    stages.push({ name: "upload", status: "ok", detail: `${filename} (${(bytes.length / 1024).toFixed(0)}KB).` });
  } catch {
    stages.push({
      name: "upload",
      status: "skipped",
      detail: "Không ghi được bản gốc xuống đĩa (môi trường serverless?) — vẫn tiếp tục parse từ bộ nhớ.",
    });
  }

  // Stage 2 — parse: trích text từng trang bằng unpdf (tool PDF phía server,
  // không gửi PDF raw cho model). Không mặc định kết luận PDF hỏng.
  let pages: string[];
  let totalPages = 0;
  try {
    const { extractText } = await import("unpdf");
    const out = (await extractText(bytes, { mergePages: false })) as unknown as {
      text: string[] | string;
      totalPages: number;
    };
    totalPages = out.totalPages;
    pages = Array.isArray(out.text) ? out.text : [out.text];
    stages.push({ name: "parse", status: "ok", detail: `Trích được text ${pages.length}/${totalPages} trang bằng unpdf.` });
  } catch (e) {
    return fail("parse", e instanceof Error ? e.message : "unpdf parse thất bại.");
  }

  // Stage 3 — chunk: 1 chunk/trang, giữ metadata documentId/chapterId/lessonId/pageNumber.
  // Trang không trích được text → liệt kê cần OCR, không bỏ qua âm thầm.
  const chunks: KbChunk[] = [];
  const emptyPages: number[] = [];
  pages.forEach((raw, i) => {
    const pageNumber = i + 1;
    const text = (raw ?? "").replace(/\s+/g, " ").trim();
    if (text.length < MIN_CHARS) {
      emptyPages.push(pageNumber);
      return;
    }
    const loc = lessonForPage(pageNumber);
    chunks.push({
      id: `${documentId}-p${pageNumber}`,
      documentId,
      chapterId: loc.chapterId,
      lessonId: loc.lessonId,
      pageNumber,
      title: `Trang ${pageNumber}`,
      text,
      charCount: text.length,
    });
  });
  stages.push({
    name: "chunk",
    status: "ok",
    detail: `${chunks.length} đoạn có text; ${emptyPages.length} trang trống${emptyPages.length > 0 ? ` (${emptyPages.join(", ")}) — cần OCR, chưa có engine (BLOCKED)` : ""}.`,
  });

  // Stage 4 — index: prototype dùng keyword (chưa có embedding vector).
  stages.push({
    name: "index",
    status: "ok",
    detail: `Keyword index prototype trên ${chunks.length} đoạn (chưa embedding vector — cần AI provider).`,
  });

  // Stage 5 — store.
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CHUNKS_FILE, JSON.stringify(chunks));
  } catch (e) {
    return fail("store", e instanceof Error ? e.message : "Không ghi được kho chunks.");
  }

  const status: KbStatus = {
    ready: chunks.length > 0,
    documentId,
    filename,
    sha256,
    totalPages,
    chunkCount: chunks.length,
    emptyPages,
    stages,
    updatedAt: new Date().toISOString(),
  };
  try {
    await writeFile(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch {
    /* trạng thái đã có trong bộ nhớ; ghi đĩa thất bại không chặn ready */
  }
  return { status, deduped: false };
}
