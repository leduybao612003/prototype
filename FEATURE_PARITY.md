# FEATURE_PARITY — VLearn Prototype (đối chiếu brief OPENCODE_BUILD_BRIEF.md)

Ngày lập: 05/10/2026. Nguồn brief: nội dung user dán trong chat (file `E:\OPENCODE_BUILD_BRIEF.md`
không truy cập được từ máy này) + repo hiện tại. `references/*.png` (7 ảnh) và `README(2).md`
**chưa có trong project** → mọi căn cứ "Ảnh" dưới đây là yêu cầu từ brief, chưa xác minh độc lập.

Trạng thái: `planned` (chưa làm) | `implemented` (đã code) | `tested` (có evidence) |
`blocked` (kẹt credential/tài nguyên, ghi rõ). Không ghi PASS khi chưa có evidence.

## Ghi chú kiểm kê (Giai đoạn A)
- Project: Next.js 16.3.8 App Router + TypeScript (đúng §4). Đã đọc
  `node_modules/next/dist/docs` (index, layouts-and-pages, route-handlers) trước khi code.
- `references/` ban đầu vắng mặt; 05/10/2026 đã nhận 7 ảnh toolbar
  (Đọc/chọn chữ, Viết tay, Tô sáng, Khoanh vùng, Tẩy, Hoàn tác, Xóa trang) →
  toolbar reader bám đúng nhãn/tooltip trong ảnh (basis: ảnh đã xem).
- File mẫu hiện tại: `public/sample.pdf` =
  `3B-Zone2-BLAS-HackathonPresentation.pdf` (11 trang, thay file F&B).
  Seed khóa học, tri thức AI và câu hỏi gợi ý dựng lại theo file này.
- AI theo quyết định 05/10/2026: prototype nội bộ, không provider/key.
  Pipeline ingestion (`POST /api/kb/ingest`: upload→parse unpdf→chunk giữ
  metadata→index keyword→store, status từng stage, retry, chống trùng sha256)
  đã chạy thật trên file mẫu: ready, 8 chunks, trang trống [2,5,9] chờ OCR.

## F01–F30 (chức năng VLearn giữ lại)

| ID | Chức năng | Basis | Trạng thái | Evidence |
|---|---|---|---|---|
| F01 | Tài khoản (login/logout/session, hiện/ẩn pass, nhớ email, quên/đổi pass) | Quan sát/Đối chiếu | planned (blocked: Supabase Auth) | — |
| F02 | Khóa/chương/bài + mục lục đóng/mở/resize | Quan sát | implemented (UI) | xem thủ công `/`, chưa test chính thức |
| F03 | Tiến độ (ghi/đọc, quy tắc doc, xem ≠ hiểu) | Quan sát/Đối chiếu | implemented (đánh dấu đã xem thủ công + quy tắc hiển thị, kho local) | thủ công browser còn lại |
| F14 | Ghi chú text/sticky (tạo/sửa/kéo/resize, lưu, mở lại) | Quan sát/Đối chiếu | implemented (tạo/sửa/xóa draft local; kéo/resize trên slide chưa làm) | kéo/resize planned |
| F04 | PDF reader thật, text layer chọn được | Ảnh toolbar | implemented (PDF.js canvas + text layer + worker) | verify trên browser còn lại |
| F05 | Điều hướng PDF (trang, nhập số, keyboard, thumbnail, deep link) | Quan sát/brief-text | implemented (nav, nhập số, ←/→, thumbnails lazy, deep link `/learn/...` + jump đúng slide cuộn dọc) | e2e F-CONT-01/03, UI-03 |
| F06 | Chế độ xem (trang/cuộn, zoom, fullscreen) | Quan sát/Đối chiếu | implemented (Từng slide + Cuộn dọc virtualize ±2, zoom 50–300%, fullscreen, giữ annotation) | e2e F-CONT-01–03 + screenshots |
| F07 | Đọc và chọn chữ (selection đúng text, không vẽ khi đọc) | Ảnh 01 đã xem | implemented (text layer span + scaleX) | thủ công browser còn lại |
| F08 | Viết tay (pointer/touch, màu/dày, vector theo trang) | Ảnh 02 đã xem | implemented (SVG overlay, 3 màu, 2 cỡ, tọa độ chuẩn hóa) | thủ công browser còn lại |
| F09 | Highlight (quote + anchor, giữ highlight nét nếu có) | Ảnh 03 đã xem | implemented (selection → quads + quote; sửa điền sẵn body‖quote + hiện quote gốc; lịch sử 5 bản + khôi phục) | e2e FIX-01–03 PASS; thủ công browser còn lại |
| F10 | Khoanh vùng chưa hiểu (vùng + preview trong notebook) | Ảnh 04 đã xem | implemented (drag rect → region unresolved kèm crop; đích chốt lúc bắt đầu: notes/ai/support; đổi tab giữa chừng → xác nhận, không tự chuyển; session chống trùng) | e2e F-NOTES/F-SWITCH |
| F11 | Tẩy đúng object | Ảnh 05 đã xem | implemented (chế độ tẩy click object) | thủ công browser còn lại |
| F12 | Undo trang (Ctrl/Cmd+Z khi annotate, không chiếm undo editor) | Ảnh 06 đã xem | implemented (stack id theo instance reader) | undo sau chuyển phần học mất stack — ghi nhận |
| F13 | Xóa annotation trang hiện tại (confirm + undo, trang khác giữ) | Ảnh 07 đã xem | implemented (confirm + soft delete + Hoàn tác) | thủ công browser còn lại |
| F15 | Sổ note và ảnh (mở/đóng, chèn ảnh, reorder/resize) | Quan sát/Đối chiếu | implemented (mở/đóng, chèn ảnh local, reorder cơ bản) | thủ công |
| F16 | Ghi chú giảng viên (theo nguồn, không cho sửa, empty đúng) | Quan sát | implemented (seed 2 mục, read-only) | thủ công |
| F17 | Khoanh vùng hỏi AI (preview crop + context + nhập câu hỏi) | Quan sát/Đối chiếu | implemented (toolbar đích rõ Lưu/AI/Hỗ trợ; crop đúng vùng + composer preview + nguồn + Gửi tay; chưa vision key → mock ghi rõ mô phỏng; live 503) | e2e F-AI, F-SWITCH |
| F18 | Gợi ý câu hỏi theo slide (chọn → trả lời AI thật) | Quan sát | implemented (gợi ý theo slide → điền vào luồng AI thật prototype-local + KB ingested; provider live deferred) | API chat 200 đã verify |
| F19 | Trợ giảng AI (chat nhiều lượt, stream, stop/retry, nguồn, history) | Quan sát + yêu cầu mới | implemented một phần (nhiều lượt, retry, chat mới, nguồn mở đúng trang, history local; stream thật passthrough SSE khi có key + nút Dừng; thiếu key → 503 STREAM_BLOCKED) | stream live BLOCKED (no key); JSON + 503 verified live |
| F20 | Lịch sử AI (chat mới/mở lại/rename/xóa/feedback/dock/resize) | Quan sát/Đối chiếu | implemented (đa luồng local: mới/mở/đổi tên/xóa; feedback câu trả lời + dock/resize chưa làm) | thủ công browser còn lại |
| F21 | Video (play/seek/±10s/volume/tốc độ/chất lượng/fullscreen/PiP/focus/phím tắt) | Quan sát/Đối chiếu | planned (blocked: asset video) | empty state thật |
| F22 | Transcript (timestamp, click seek, active cue) | Quan sát/Đối chiếu | planned (blocked: asset transcript) | empty state thật |
| F23 | Note video (timestamp, sửa/sync, mở nguồn seek) | Quan sát + mới | implemented (tạo/sửa draft local) | thủ công; seek thật khi có video |
| F24 | Tài liệu (xem/tải asset có quyền, empty thật) | Quan sát/Đối chiếu | implemented (liệt kê + empty thật) | thủ công |
| F25 | Like/dislike, Hữu ích/Chưa hữu ích, bình luận (validate + persistence) | Quan sát/Đối chiếu | implemented một phần (Hữu ích/Chưa hữu ích theo bài, kho local; bình luận chưa làm) | bình luận planned |
| F26 | Phản hồi bối rối (Khó hiểu/Bế tắc/Đã hiểu + text, khử định danh) | Quan sát/Đối chiếu | implemented (form riêng, lưu ẩn danh không owner/email, tách khỏi báo lỗi kỹ thuật) | thủ công browser còn lại |
| F27 | Hỗ trợ labcoach (chọn lớp, gửi, đính kèm nguồn, coach xem/trả lời) | Quan sát/Đối chiếu | implemented (MỘT requestId dùng chung 2 bên theo quyền; merge union không wipe khi đổi profile/reload; idempotent retry; unread 2 chiều; polling; check mapping 400 + quyền backend 403; ngã local + banner khi server không ghi) | e2e S-ADV/S-LIVE/S-DEDUPE + F-SUP + F-PERM |
| F28 | Menu tài khoản/báo cáo (profile, báo lỗi, báo cáo tiến độ từ dữ liệu thật) | Quan sát/Đối chiếu | implemented một phần (menu tài khoản: profile prototype + chuyển vai + báo cáo tiến độ từ kho local; báo lỗi kỹ thuật chưa tách form riêng) | báo lỗi form planned |
| F29 | Lab/checkpoint (nội dung, checklist/submission/status thật) | Đối chiếu (chưa xác minh) | planned | không nhận giống lab engine gốc |
| F30 | Giao diện/ngôn ngữ (sáng/tối, VI/EN control gốc, lưu preference) | Quan sát/Đối chiếu | implemented (VI mặc định, toggle sáng/tối + preference local; mobile drawer ≤900px) | thủ công |

## N01–N06 (cải tiến bộ ghi chú + AI chủ động)

| ID | Chức năng | Trạng thái | Evidence |
|---|---|---|---|
| N01 | Bộ ghi chú chung mọi loại item, nhóm chương → bài → nguồn | implemented (cây Chương → Bài → Slide + resolver chung `lessonMap` documentId+page→lesson, grouping theo nguồn thực; sortOrder chỉ sắp trong nhóm) | e2e R-SEED/R-CREATE/R-HL/R-CONT/R-KEEP |
| N02 | Mở nguồn từ note (đúng tài liệu/trang/vùng hoặc timestamp, giữ panel) | implemented (điều hướng nội bộ + deep link `/learn/...` redirect giữ params + mở nhóm chứa note, giữ panel) | e2e UI-03 + BUG-deep-link fixed |
| N03 | Tự lưu + sync (một nguồn, idempotency, conflict, cross-tab) | implemented một phần (clientOperationId + revision check ở API stub; autosave kiểm tra ghi trước khi đổi state + rollback/err; reorder hoán vị sortOrder; cross-tab storage event) | e2e UI-01a/b; persistence server blocked |
| N04 | Tìm kiếm note (VI có/không dấu, text/quote/metadata, empty/loading/error) | implemented (tìm local, không dấu) | thủ công; OCR ảnh không tuyên bố |
| N05 | AI tổng hợp chủ động (chọn phạm vi → draft có nguồn → sửa/duyệt/bỏ, gốc giữ nguyên) | implemented (POST /api/ai/summarize trên text trích xuất + UI chọn note/phạm vi/instruction, draft có nguồn mở đúng trang, artifact riêng, reload bền, lỗi + retry thật) | live 05/10/2026: summarize 200, 3 notes → 5 sources (tr.4/6/7/10), kbSource ingested:sample.pdf; lỗi 400/403 + retry verified |
| N06 | Chuẩn hóa mindmap (vision thật, sửa nodes/edges, duyệt/bỏ, bản riêng) | implemented một phần (POST /api/ai/mindmap: proposal nodes/edges/uncertainties + validate server, UI SVG sửa label/xóa/thêm link, uncertainties bắt buộc xác nhận mới duyệt, artifact riêng, gốc giữ nguyên; ảnh/nét vẽ gắn uncertain vì chưa vision key, đọc thật khi có AI_VISION_MODEL) | live 05/10/2026: 200, 6 nodes/6 edges/3→2 uncertainties, dangling=0; duyệt browser còn lại |

## Quy tắc parity
- Deterministic grouping chương → bài → nguồn; AI không tham gia sắp xếp (N01).
- Một nguồn dữ liệu cho slide + panel (cùng `itemId`); chưa có server thì cùng cache client,
  server bật sau qua TanStack Query key tương thích.
- Mọi nút đã render đều có hành vi thật (lưu/gửi/mở nguồn) hoặc báo blocker rõ; không nút giả.
