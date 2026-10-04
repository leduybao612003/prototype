# DEPLOYMENT — VLearn Prototype

Trạng thái: **chưa deploy** (Giai đoạn G). Quy trình khi được cấp quyền (§8-G):

1. Commit source/migrations/lockfile, quét secret (`git status`, không commit `.env.local`).
2. Chủ dự án cung cấp Vercel project, Supabase, tài khoản thử, API credential, assets.
3. Deploy preview (`vercel deploy`), cấu hình env Preview + Auth redirect + Storage/CORS.
4. Test trên preview URL thật (không chỉ localhost), chạy smoke T34.
5. Deploy Production (`vercel deploy --prod`) sau khi test đạt; env Production riêng.
6. Smoke production: login → tạo note → tìm/mở nguồn → reload → AI chat → khoanh vùng
   vision → approve artifact → logout/login; desktop + mobile viewport.
7. Bàn giao URL + commit + TEST_REPORT có evidence. Preview URL ≠ production xong.

Lưu ý runtime: upload lớn qua signed URL trực tiếp Storage (payload limit 4.5 MB
Functions); streaming chịu maxDuration theo plan; không lưu dữ liệu vào
memory/filesystem của Function; không dùng localStorage làm database nghiệm thu.
