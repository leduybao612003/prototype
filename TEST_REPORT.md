# TEST_REPORT — VLearn Prototype

Ngày: 05/10/2026. Mỗi test: `testId`, commit, env, bước, expected/actual, kết quả,
evidence. Phân biệt test tự động/mock với test live.

## Kết quả hiện tại (Giai đoạn A)

| Test | Kịch bản | Kết quả | Evidence |
|---|---|---|---|
| BUILD-01 | `npm.cmd run lint` trên source GĐ A | PASS | exit 0 (05/10/2026) |
| BUILD-02 | `npm.cmd run build` (Next 16.3.8 Turbopack) | PASS | exit 0; routes `/`, `/api/health`, `/api/items`, `/api/items/[id]`, `/api/items/[id]/restore`, `/api/lessons/[id]`, `/api/ai/chat` |
| API-01 | `GET /api/health` trên `npm run start` port 3111 | PASS | `{ok:true, supabaseConfigured:false, aiConfigured:false, storage:"seed-local"}` |
| API-02 | `GET /api/items?lessonId=k04-l34-p2-t1` | PASS | trả 5 seed items đúng lesson |
| API-03 | `POST /api/ai/chat` (scope lesson, KB đã nạp) | PASS | `mode:prototype-local`, `kbSource:ingested:sample.pdf`, sources có page+lessonId (tr.7+6 bài blas-solution), requestId thật |
| KB-01 | `POST /api/kb/ingest {sample:true}` file thật 1,8MB | PASS | ready:true, 11 trang → 8 chunks, stages upload/parse/chunk/index/store ok; trang trống [2,5,9] liệt kê chờ OCR, không bỏ qua âm thầm |
| KB-02 | Nạp lại cùng file | PASS | `deduped:true`, chunkCount giữ 8 — không tạo trùng |
| KB-03 | Hỏi AI → citation mở đúng slide | PASS (API) | sources có page+lessonId, UI có nút mở nguồn theo source; verify click trên browser còn lại |
| DOC-01 | `react-doctor --no-score` sau fix | PASS (exit 0) | 14 files, 0 error, 3 warnings: giant-component + high-complexity (nợ, tách component ở GĐ C/D), numeric-parse là false-positive (đã guard `Number.isFinite`, fallback 0) |
| DOC-02 | `react-doctor --no-score` sau đợt chat đa luồng + support + feedback | PASS (exit 0) | 20 files, 0 error, 16 warnings (complexity/giant-component: nợ tách component; text-layer DOM + find tuần tự + overlay pointer: theo thiết kế annotation; numeric-parse: false-positive đã guard; còn lại đã fix: updater side-effect, erase keyboard, static IO cache, fetch status) |
| T02-thủ-công | Mở `/`, đóng/mở mục lục, resize side/panel, chuyển tab notes/ai/docs | PASS (thủ công) | chưa screenshot chính thức |
| T20-thủ-công | Chat đa luồng: tạo/mở/đổi tên/xóa, reload giữ nguyên | implemented, chờ thử browser | kho local prototype |
| T27-thủ-công | Learner gửi Hỗ trợ/Điểm cộng → Coach trả lời đổi trạng thái → learner thấy | implemented, chờ thử browser | kho local prototype, không gửi VLearn thật |
| F03/F25/F26-thủ-công | Đánh dấu đã xem, Hữu ích/Chưa hữu ích, bối rối ẩn danh, báo cáo tiến độ | implemented, chờ thử browser | quy tắc xem ≠ hiểu hiển thị rõ |
| T10-thủ-công | Tạo/sửa note từ toolbar và panel dùng cùng ID | PASS (thủ công) | persistence server BLOCKED |
| N05-01 | `POST /api/ai/summarize` 3 notes hackathon + instruction (live port 3112) | PASS | 200 `mode:prototype-local`, `kbSource:ingested:sample.pdf`, draft 1235 ký tự (ý chính gom nhóm + điểm mở + bối cảnh KB tr.6–7), 5 sources (3 note + 2 kb) có page+lessonId |
| N05-02 | summarize notes rỗng / documentId ngoài active | PASS | 400 INVALID_BODY; 403 NO_AUTHORIZED_NOTES |
| N05-03 | Retry cùng payload + chat regression (F&B fallback đã sửa) | PASS | retry 200 đủ sources; chat 200 `ingested:sample.pdf`, answer không còn brand F&B |
| N05-UI | Panel Tổng hợp: chọn note/phạm vi/instruction → draft có nguồn mở đúng trang → sửa/duyệt/bỏ; artifact riêng + note gốc giữ nguyên; reload còn bản duyệt | implemented, chờ thử browser | artifact + note duyệt persist localStorage; build PASS, route `/api/ai/summarize` có mặt |
| T12-thủ-công | Tìm “dinh nghia” (không dấu) ra note “Định nghĩa cần nhớ” | PASS (thủ công) | — |

## T01–T36 (bắt buộc theo brief §9)
- T01, T03–T09, T11, T13–T36: BLOCKED hoặc planned — cần Supabase Auth/DB/Storage,
  assets PDF/video thật, AI provider key. Không ghi PASS khi thiếu evidence.
- Mock chỉ dùng trong automated tests, tách khỏi deployment nghiệm thu (§1.5).
- AI live (T22–T29): chưa chạy lần nào — xem `AI_LIVE_EVIDENCE.md`.

## Cần từ chủ dự án để mở block
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `AI_PROVIDER` + `AI_PROVIDER_API_KEY` + `AI_TEXT_MODEL` (+ `AI_VISION_MODEL`),
PDF/video/lab được phép dùng, Vercel project quyền deploy, tài khoản thử.
