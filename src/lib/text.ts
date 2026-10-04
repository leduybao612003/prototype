// Chuẩn hóa chuỗi tiếng Việt cho tìm kiếm và chấm điểm từ khóa (không dấu).

export function stripVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
