# FEATURE_PARITY — VLearn Prototype (đối chiếu brief OPENCODE_BUILD_BRIEF.md)

Ngày lập: 05/10/2026. Nguồn brief: nội dung user dán trong chat (file `E:\OPENCODE_BUILD_BRIEF.md`
không truy cập được từ máy này) + repo hiện tại. `references/*.png` (7 ảnh) và `README(2).md`
**chưa có trong project** → mọi căn cứ "Ảnh" dưới đây là yêu cầu từ brief, chưa xác minh độc lập.

Trạng thái: `planned` (chưa làm) | `implemented` (đã code) | `tested` (có evidence) |
`blocked` (kẹt credential/tài nguyên, ghi rõ). Không ghi PASS khi chưa có evidence.

## Ghi chú kiểm kê (Giai đoạn A)
- Project: Next.js 16.3.8 App Router + TypeScript (đúng §4). Đã đọc
  `node_modules/next/dist/docs` (index, layouts-and-pages, route-handlers) trước khi code.
- `references/` vắng mặt → F07–F13 chỉ triển khai theo mô tả chữ trong brief, gắn `basis: brief-text`.
- Backend/Supabase/AI keys chưa có → mọi mutation bền vững và AI live đang `blocked`
  (API trả 503 + mã lỗi rõ, không fake success). Xem `.env.example`.
- Assets thật (PDF selectable nhiều trang, PDF scan, video + transcript, lab) chưa có
  → reader hiển thị empty state thật; seed hiện tại là dữ liệu chữ JSON trong code.

## F01–F30 (chức năng VLearn giữ lại)

| ID | Chức năng | Basis | Trạng thái | Evidence |
|---|---|---|---|---|
| F01 | Tài khoản (login/logout/session, hiện/ẩn pass, nhớ email, quên/đổi pass) | Quan sát/Đối chiếu | planned (blocked: Supabase Auth) | — |
| F02 | Khóa/chương/bài + mục lục đóng/mở/resize | Quan sát | implemented (UI) | xem thủ công `/`, chưa test chính thức |
| F03 | Tiến độ (ghi/đọc, quy tắc doc, xem ≠ hiểu) | Quan sát/Đối chiếu | planned (blocked: DB) | — |
| F04 | PDF reader thật, text layer chọn được | Ảnh/brief-text | planned (blocked: asset PDF + viewer) | empty state thật |
| F05 | Điều hướng PDF (trang, nhập số, keyboard, thumbnail, deep link) | Quan sát/brief-text | planned | deep link route `/learn/...` đã định nghĩa, chưa code |
| F06 | Chế độ xem (trang/cuộn, zoom, fullscreen) | Quan sát/Đối chiếu | planned | — |
| F07 | Đọc và chọn chữ (selection đúng text, không vẽ khi đọc) | brief-text (ảnh 164849 chưa xem) | planned | — |
| F08 | Viết tay (pointer/touch, màu/dày, vector theo trang) | brief-text (ảnh 164858 chưa xem) | planned | — |
| F09 | Highlight (quote + anchor, giữ highlight nét nếu có) | brief-text | planned | — |
| F10 | Khoanh chưa hiểu (vùng + preview trong notebook) | brief-text | planned | — |
| F11 | Tẩy đúng object | brief-text | planned | — |
| F12 | Undo trang (Ctrl/Cmd+Z khi annotate, không chiếm undo editor) | brief-text | planned | — |
| F13 | Xóa annotation trang hiện tại (confirm + undo, trang khác giữ) | brief-text | planned | — |
| F14 | Ghi chú text/sticky (tạo/sửa/kéo/resize, lưu, mở lại) | Quan sát/Đối chiếu | implemented (tạo/sửa/xóa draft local) | thủ công; persistence server blocked |
| F15 | Sổ note và ảnh (mở/đóng, chèn ảnh, reorder/resize) | Quan sát/Đối chiếu | implemented (mở/đóng, chèn ảnh local, reorder cơ bản) | thủ công |
| F16 | Ghi chú giảng viên (theo nguồn, không cho sửa, empty đúng) | Quan sát | implemented (seed 2 mục, read-only) | thủ công |
| F17 | Khoanh vùng hỏi AI (preview crop + context + nhập câu hỏi) | Quan sát/Đối chiếu | planned (blocked: AI vision) | — |
| F18 | Gợi ý câu hỏi theo slide (chọn → trả lời AI thật) | Quan sát | planned (blocked: AI) | — |
| F19 | Trợ giảng AI (chat nhiều lượt, stream, stop/retry, nguồn, history) | Quan sát + yêu cầu mới | planned (blocked: AI provider) | API `/api/ai/chat` trả 503 thật |
| F20 | Lịch sử AI (chat mới/mở lại/rename/xóa/feedback/dock/resize) | Quan sát/Đối chiếu | planned (blocked: DB+AI) | — |
| F21 | Video (play/seek/±10s/volume/tốc độ/chất lượng/fullscreen/PiP/focus/phím tắt) | Quan sát/Đối chiếu | planned (blocked: asset video) | empty state thật |
| F22 | Transcript (timestamp, click seek, active cue) | Quan sát/Đối chiếu | planned (blocked: asset transcript) | empty state thật |
| F23 | Note video (timestamp, sửa/sync, mở nguồn seek) | Quan sát + mới | implemented (tạo/sửa draft local) | thủ công; seek thật khi có video |
| F24 | Tài liệu (xem/tải asset có quyền, empty thật) | Quan sát/Đối chiếu | implemented (liệt kê + empty thật) | thủ công |
| F25 | Like/dislike, Hữu ích/Chưa hữu ích, bình luận (validate + persistence) | Quan sát/Đối chiếu | planned (blocked: DB) | — |
| F26 | Phản hồi bối rối (Khó hiểu/Bế tắc/Đã hiểu + text, khử định danh) | Quan sát/Đối chiếu | planned (blocked: DB) | tách luồng với báo lỗi kỹ thuật theo brief |
| F27 | Hỗ trợ labcoach (chọn lớp, gửi, đính kèm nguồn, coach xem/trả lời) | Quan sát/Đối chiếu | planned (blocked: DB) | prototype nội bộ, không gửi VLearn thật |
| F28 | Menu tài khoản/báo cáo (profile, báo lỗi, báo cáo tiến độ từ dữ liệu thật) | Quan sát/Đối chiếu | planned (blocked: DB) | — |
| F29 | Lab/checkpoint (nội dung, checklist/submission/status thật) | Đối chiếu (chưa xác minh) | planned | không nhận giống lab engine gốc |
| F30 | Giao diện/ngôn ngữ (sáng/tối, VI/EN control gốc, lưu preference) | Quan sát/Đối chiếu | implemented (VI mặc định, toggle sáng/tối + preference local) | thủ công |

## N01–N06 (cải tiến bộ ghi chú + AI chủ động)

| ID | Chức năng | Trạng thái | Evidence |
|---|---|---|---|
| N01 | Bộ ghi chú chung mọi loại item, nhóm chương → bài → nguồn | implemented (local draft + grouping) | thủ công; sync server blocked |
| N02 | Mở nguồn từ note (đúng tài liệu/trang/vùng hoặc timestamp, giữ panel) | implemented (điều hướng nội bộ + deep link `?part=&page=&item=`) | thủ công |
| N03 | Tự lưu + sync (một nguồn, idempotency, conflict, cross-tab) | implemented một phần (clientOperationId + revision check ở API stub; autosave debounce + trạng thái Đang lưu/Đã lưu/Lưu thất bại) | persistence server blocked → T13/T14 blocked |
| N04 | Tìm kiếm note (VI có/không dấu, text/quote/metadata, empty/loading/error) | implemented (tìm local, không dấu) | thủ công; OCR ảnh không tuyên bố |
| N05 | AI tổng hợp chủ động (chọn phạm vi → draft có nguồn → sửa/duyệt/bỏ, gốc giữ nguyên) | planned (blocked: AI + DB) | — |
| N06 | Chuẩn hóa mindmap (vision thật, sửa nodes/edges, duyệt/bỏ, bản riêng) | planned, làm sau parity + sync (blocked: AI vision) | — |

## Quy tắc parity
- Deterministic grouping chương → bài → nguồn; AI không tham gia sắp xếp (N01).
- Một nguồn dữ liệu cho slide + panel (cùng `itemId`); chưa có server thì cùng cache client,
  server bật sau qua TanStack Query key tương thích.
- Mọi nút đã render đều có hành vi thật (lưu/gửi/mở nguồn) hoặc báo blocker rõ; không nút giả.
