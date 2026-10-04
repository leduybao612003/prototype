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

## Lần chạy 05/10/2026 (file 3B-Zone2-BLAS-HackathonPresentation.pdf, 11 trang)
- Ingest: ready:true, 8 chunks, kbSource `ingested:sample.pdf`.
- Hỏi scope lesson blas-solution về AI Slice → trả lời từ trang 7 + bổ sung trang 6,
  sources có page+lessonId để nút citation mở đúng slide.
- Chưa có lần chạy provider nào (đúng quyết định trên).

