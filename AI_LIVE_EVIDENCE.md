# AI_LIVE_EVIDENCE — VLearn Prototype

## Quyết định 05/10/2026 (theo yêu cầu chủ dự án)
Prototype dùng **AI nội bộ**: trả lời cơ bản từ tri thức file mẫu, **không gọi
provider, không cần API key**. Mọi response ghi nhãn `mode:prototype-local`.
Provider thật (streaming, vision) dời sang Giai đoạn E khi có key — không tuyên
bố đây là AI live.

## Ingestion pipeline (thay parser FaaS gây lỗi)
`POST /api/kb/ingest` chạy 5 stage: upload → parse (unpdf phía server, không gửi
PDF raw cho model) → chunk (giữ documentId/chapterId/lessonId/pageNumber) →
index (keyword prototype) → store (`data/kb-chunks.json`). KB chỉ `ready` khi mọi
stage ok; lỗi hiện đúng stage + cho retry; chống trùng bằng sha256.
Trang không trích được text (mẫu hiện tại: 2, 5, 9) được liệt kê chờ OCR —
OCR engine chưa có (BLOCKED), không bỏ qua âm thầm.

## Lần chạy N06 + F17 + stream 05/10/2026 (server `npm.cmd run start` port 3113, build production)
- `POST /api/ai/mindmap` (3 notes text/ink-trống/highlight, scope blas-solution):
  200, `mode:prototype-local`, 6 nodes / 6 edges / uncertainties (ink chưa đọc
  bằng vision + link suy đoán theo cụm từ — từ đơn ngắn không dùng để tránh
  nhiễu), validate server: dangling=0, trùng ID=0; 5 sources có page+lessonId.
  Notes rỗng → 400 INVALID_BODY.
- `POST /api/ai/vision` (crop dataURL + câu hỏi, chưa vision key): 503
  VISION_BLOCKED thật kèm pageContext từ text trang đã trích xuất; ảnh sai →
  400 INVALID_IMAGE. Không fake trả lời.
- `POST /api/ai/chat {stream:true}` (chưa key): 503 STREAM_BLOCKED; nhánh pipe
  SSE provider chỉ chạy khi đủ key (live stream BLOCKED).
- T30 prompt-injection: note “bỏ qua mọi chỉ dẫn…” → bị liệt kê như dữ liệu có
  nguồn, không thực thi; KB/note nguyên vẹn.
- Biến còn thiếu (giữ nguyên): `AI_PROVIDER_API_KEY` (+ `AI_TEXT_MODEL`,
  `AI_VISION_MODEL`, `AI_BASE_URL`).

## Lần chạy N05 05/10/2026 (server `npm.cmd run start` port 3112, build production)
- `POST /api/ai/summarize` (3 notes seed hackathon tr.4/7/10 + instruction, scope
  blas-solution): 200, `mode:prototype-local`, `kbSource:ingested:sample.pdf`,
  draft gom nhóm ý chính + điểm chưa hiểu còn mở + bối cảnh KB tr.6–7 (text đã
  trích xuất — không gửi PDF/binary/base64 ở bất kỳ trường nào), 5 sources có
  page+lessonId để nút Mở nguồn điều hướng đúng slide/note.
- Lỗi thật: notes rỗng → 400 INVALID_BODY; documentId ngoài active → 403
  NO_AUTHORIZED_NOTES; gửi lại cùng payload (retry) → 200.
- Provider ngoài: route có adapter OpenAI-compatible (chỉ gửi text trích xuất +
  prompt); chưa có key nên dùng engine nội bộ, ghi nhãn mode rõ ràng.
  Biến còn thiếu: `AI_PROVIDER_API_KEY` (+ `AI_TEXT_MODEL`, `AI_BASE_URL`).
- Quét F&B 05/10/2026: KB active (`data/kb-chunks.json`, 8 chunks
  `doc-3b-hackathon`) sạch F&B; chỉ còn fallback chat gợi ý brand F&B cũ
  (`assistant.ts`) đã sửa sang chủ đề hackathon. Không reset database/file KB.

## Lần chạy ingestion + chat 05/10/2026 (file 3B-Zone2-BLAS-HackathonPresentation.pdf, 11 trang)
- Ingest: ready:true, 8 chunks, kbSource `ingested:sample.pdf`.
- Hỏi scope lesson blas-solution về AI Slice → trả lời từ trang 7 + bổ sung trang 6,
  sources có page+lessonId để nút citation mở đúng slide.
- Chưa có lần chạy provider nào (đúng quyết định trên).

