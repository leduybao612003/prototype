import { redirect } from "next/navigation";

// Deep link do "Mở nguồn" ghi: /learn/{courseId}/{lessonId}?part=&page=&item=.
// Workspace sống ở `/` và đã đọc part/page từ query sau mount, nên route này
// chuyển tiếp giữ nguyên params (không 404 khi reload hoặc mở link trực tiếp).
export default async function LearnDeepLink({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["part", "page", "item"]) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  const suffix = q.toString();
  redirect(suffix ? `/?${suffix}` : "/");
}
