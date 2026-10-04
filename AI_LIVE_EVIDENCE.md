# AI_LIVE_EVIDENCE — VLearn Prototype

Trạng thái: **AI chưa chạy lần nào** (05/10/2026). `POST /api/ai/chat` hiện trả 503
`AI_NOT_CONFIGURED` kèm `requestId` thật — không fallback mẫu, không fake streaming.

Khi có key, mỗi lần chạy live ghi tại đây: thời gian, model, scope, source IDs,
latency/usage (nếu provider trả), requestId, câu hỏi/trả lời tóm tắt, link mở đúng
trang/timestamp, PASS/FAIL. Không log key hay toàn bộ note riêng tư mặc định.

Blocker hiện tại: `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, `AI_TEXT_MODEL`,
`AI_VISION_MODEL` (cho F17/N06). Chưa xác minh model nào hỗ trợ text/vision.
