# COMPLETION_STATUS — VLearn Prototype (phạm vi AI MOCK demo)

Ngày: 05/10/2026. Phạm vi hiện tại (thay thế yêu cầu AI live trong các brief
trước): **AI_MODE=mock** — tương tác demo đầy đủ, không cần API key.
Interface provider giữ nguyên trong `src/lib/provider.ts` để giai đoạn sau chỉ
đổi provider, không sửa routes. Không tuyên bố đã kiểm chứng provider/thật.

- `PASS — MOCK`: luồng mô phỏng chạy được, có evidence.
- `NOT_RUN`: chưa chạy (ghi rõ lý do).
- Live AI (provider thật): toàn bộ NOT_RUN cho đến khi có credential.

## Trạng thái AI theo yêu cầu mock

| Hạng mục | Trạng thái | Evidence |
|---|---|---|
| AI_MODE=mock, không cần key/model/base URL | PASS — MOCK | `GET /api/health` → `aiMode:"mock"`; badge “AI demo mô phỏng” trên header |
| Chat: hỏi theo trang/note, streaming mô phỏng, follow-up, Stop, Retry, lịch sử | PASS — MOCK | M-E2E-03a–d (Chrome thật): 2 citation mở nguồn, follow-up cùng luồng, dừng stream mô phỏng, retry |
| Citation chỉ từ nguồn thực demo | PASS — MOCK | sources có page+lessonId từ chunks ingested; hết nguồn → trả lời “chưa tìm thấy”, không bịa (M-E2E-03a) |
| Tổng hợp (N05): note đã chọn → nháp → sửa/duyệt/bỏ, gốc giữ nguyên | PASS — MOCK | M-E2E-01a/b: draft 8 nút nguồn, duyệt, reload còn artifact + note |
| Khoanh vùng: crop thật + phản hồi ghi rõ mô phỏng | PASS — MOCK | M-E2E-04: crop hiển thị thật, answer có `[MÔ PHỎNG vision — chưa đọc chữ trong ảnh]` |
| Mindmap (N06): dữ liệu mẫu nhãn mock, sửa nodes/edges, đối chiếu gốc, duyệt/bỏ | PASS — MOCK | M-E2E-02a/b: tạo → xác nhận uncertainties → duyệt → reload còn; nút Mở nguồn từng node |
| Loading/error/empty + retry các luồng | PASS — MOCK | 400/403/503 có mã lỗi + nút Thử lại; empty states thật |

## T22–T29 (evidence mock, live NOT_RUN)

| Test | Mock evidence | Live |
|---|---|---|
| T22 hỏi theo slide + nguồn | M-E2E-03a, API 200 `mode:mock` | NOT_RUN (thiếu key) |
| T23 follow-up + mở lại sau reload | M-E2E-03b, threads localStorage | NOT_RUN |
| T24 đổi scope + snapshot | scope page/lesson/selection + snapshot theo message (code), 03a dùng lesson | NOT_RUN |
| T25 khoanh 2 vùng → crop đúng mỗi vùng | M-E2E-04 (1 vùng); crop từ canvas theo rect, ≤640px JPEG | NOT_RUN (vision thật) |
| T26 hỏi thiếu nguồn → báo thiếu | fallback “chưa tìm thấy + mở rộng phạm vi” (code + API) | NOT_RUN |
| T27 lỗi provider/stop/retry | 503 STREAM_BLOCKED/VISION_BLOCKED + Stop/Retry (M-E2E-03c/d, F17-01) | NOT_RUN (401/429/timeout thật) |
| T28 tổng hợp → duyệt/bỏ, gốc giữ nguyên | M-E2E-01a/b | NOT_RUN |
| T29 mindmap uncertainty + approve riêng | M-E2E-02a/b, N06-01 | NOT_RUN (vision đọc ảnh) |

## Credential AI → giai đoạn tích hợp sau

`AI_PROVIDER_API_KEY`, `AI_TEXT_MODEL` (+ `AI_VISION_MODEL`), `AI_BASE_URL`.
Khi có: đặt `AI_MODE=live`, deploy lại, chạy lại T22–T29 live. Code live đã có
(chat text+stream, summarize, mindmap JSON, vision image_url) nhưng CHƯA live-test.

## Việc còn lại ngoài AI

- F01 Auth + persistence server (T01/T13–T15): BLOCKED — cần Supabase URL/key
  (migration + RLS đã viết sẵn trong `supabase/migrations/0001_init.sql`).
  Riêng luồng hỗ trợ đã có backend file dùng chung 2 phiên (e2e F-SUP),
  nhưng Vercel ephemeral → production vẫn cần Supabase.
- Video/transcript asset thật (F21–F23, T16–T17): BLOCKED — cần asset được phép dùng.
- Deploy Vercel: ĐÃ DEPLOY (`https://prototype-wine-one.vercel.app/`, T34 PASS).
  Đợt này push tiếp: reader Cuộn dọc + routing khoanh + support server.
- Nợ code còn lại: tách `page.tsx`, 3 unused vars, React Bits component.
- Fix nguồn note 05/10/2026 (bug ảnh: note tr.6 rơi vào nhóm tr.4–5):
  `src/lib/lessonMap.ts` resolver chung + chốt nguồn lúc tạo + tự sửa note sai
  khi nạp + backend check mapping — e2e hồi quy R-SEED/R-CREATE/R-HL/R-CONT/
  R-KEEP 6/6 PASS. Không xóa/tạo lại note, không đoán tài liệu khác.
