// Supabase server helper. Trả null khi thiếu env → route handlers trả 503
// BLOCKED rõ ràng thay vì fake success. Không tin ownerId từ client.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}

export function getSupabaseServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = (process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) as string;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function supabaseNotConfiguredResponse() {
  return Response.json(
    {
      code: "SUPABASE_NOT_CONFIGURED",
      message:
        "Chưa cấu hình Supabase (NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SECRET_KEY). " +
        "Dữ liệu bền vững đang BLOCKED — xem .env.example và FEATURE_PARITY.md Giai đoạn B.",
    },
    { status: 503 },
  );
}
