# DEPENDENCIES — phiên bản đã khóa (05/10/2026)

Đọc docs trước khi cài: Next.js (thư mục `node_modules/next/dist/docs/`),
còn lại dùng README/package docs công khai + `package-lock.json` làm nguồn khóa.

| Package | Version | Dùng ở | Nguồn/License |
|---|---|---|---|
| next | 16.3.8 | App Router + Route Handlers | MIT (Vercel) |
| react / react-dom | 19.2.8 | UI | MIT |
| pdfjs-dist | 6.4.299 | PDF reader (GĐ C; worker tương thích version) | Apache-2.0 (Mozilla) |
| @tanstack/react-query | 5.104.1 | server state items/threads (key dùng chung slide + panel) | MIT |
| zod | 4.6.5 | validate API + mindmap proposal | MIT |
| lenis | 1.3.26 | smooth scroll continuous reader (GĐ F; 1 scroll owner, native nested scroll) | MIT (darkroomengineering) |
| gsap | 3.15.0 | transition ngắn 150–250ms panel/tab/item (GĐ F; cleanup context) | License riêng Greensock (không phải MIT) — kiểm tra quyền dùng |
| @supabase/supabase-js | 2.117.2 | persistence/Auth/Storage (GĐ B) | Apache-2.0 |
| @supabase/ssr | 0.12.7 | session server/client (GĐ B) | Apache-2.0 |
| ai | 7.0.127 | Vercel AI SDK streaming (GĐ E; provider adapter thêm khi có key) | Apache-2.0 |
| unpdf | 1.8.1 | trích text PDF từng trang phía server cho ingestion (không gửi raw cho model) | MIT |
| tailwindcss / @tailwindcss/postcss | 4.x | design tokens §2 | MIT |

React Bits: chưa chọn component (GĐ F mới đọc repo `DavidHDev/react-bits`, ghi MIT +
Commons Clause, chỉ copy đúng nguồn, không clone showcase, không WebGL sau PDF).
MotionSites: chỉ tham khảo nhịp/motion công khai, dùng prompt riêng trong brief §2.

## Bổ sung 05/10/2026 (N06/F17/F19 — không thêm dependency)
- Mindmap render bằng SVG tay trong `src/app/page.tsx` (`MindmapEditor`, layout
  lưới tự tính, không layout lib) — quyết định không thêm React Flow để giữ
  bundle và tránh dep chưa audit.
- Streaming AI dùng pipe SSE trực tiếp qua `fetch` (server) + đọc `data:` ở
  client — không thêm `@ai-sdk/openai` hay provider package nào (chưa có key để
  live-test, tránh code chết phụ thuộc adapter).
- Engine dùng chung: `src/lib/mindmap.ts` (proposal + validate), `src/lib/summarize.ts`.
