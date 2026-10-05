// Design tokens dùng thống nhất (yêu cầu UI 05/10/2026).
// Tương phản đã kiểm tra tay (WCAG AA cho chữ thường ≥ 4.5, chữ lớn/đậm ≥ 3.0):
// - Primary #187CFA + chữ trắng: ~4.0 → CHỈ dùng cho nút semibold ≥13px,
//   không dùng chữ trắng thường trên nền primary.
// - Accent #7DF3FF luôn đi với chữ đậm #0B1B2B (tương phản cao).
// - Unresolved #F5822B KHÔNG dùng nền đặc + chữ trắng (chỉ ~2.9):
//   card dùng nền nhạt + viền đậm + icon/nhãn chữ (không chỉ dựa vào màu).
// - Dark mode giữ chữ sáng trên nền tối hiện có, viền cam giữ nguyên.

import type { CSSProperties } from "react";

export const TOK = {
  primary: "#187CFA",
  primarySoft: "#E3F0FE",
  primarySoftDark: "#1f3a52",
  accent: "#7DF3FF",
  accentInk: "#0B1B2B",
  accentSoft: "#DFFBFF",
  bg: "#F2F8FF",
  bgDark: "#0f1720",
  surface: "#FFFFFF",
  surfaceDark: "#16212c",
  ink: "#203246",
  inkDark: "#e6edf3",
  border: "#DCE5ED",
  borderDark: "#2a3644",
  unresolved: "#F5822B",
  unresolvedSoft: "#FDEAD7",
  unresolvedSoftDark: "rgba(245,130,43,.14)",
  unresolvedInk: "#3A1F05",
  danger: "#b42318",
  ok: "#1a7f37",
} as const;

export type TokDark = boolean;

// Card ghi chú ở trạng thái Chưa hiểu: viền cam 2px + nền nhạt + badge icon/nhãn.
// Hover/selected/dragging không được che badge (badge là phần tử riêng).
export function unresolvedCard(dark: TokDark): CSSProperties {
  return {
    border: `2px solid ${TOK.unresolved}`,
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    background: dark ? TOK.unresolvedSoftDark : TOK.unresolvedSoft,
  };
}

export function normalCard(dark: TokDark): CSSProperties {
  return {
    border: `1px solid ${dark ? TOK.borderDark : TOK.border}`,
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    background: dark ? TOK.surfaceDark : TOK.surface,
  };
}
