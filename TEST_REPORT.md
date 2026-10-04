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
| API-03 | `POST /api/ai/chat` (scope page) khi chưa có key | PASS | 503 `AI_NOT_CONFIGURED` + requestId thật, không fallback mẫu |
| DOC-01 | `react-doctor --no-score` sau fix | PASS (exit 0) | 14 files, 0 error, 3 warnings: giant-component + high-complexity (nợ, tách component ở GĐ C/D), numeric-parse là false-positive (đã guard `Number.isFinite`, fallback 0) |
| T02-thủ-công | Mở `/`, đóng/mở mục lục, resize side/panel, chuyển tab notes/ai/docs | PASS (thủ công) | chưa screenshot chính thức |
| T10-thủ-công | Tạo/sửa note từ toolbar và panel dùng cùng ID | PASS (thủ công) | persistence server BLOCKED |
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
