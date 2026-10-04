import { supabaseNotConfiguredResponse } from "@/lib/supabase";

// POST /api/items/{id}/restore — phục hồi soft delete. Cần Supabase.
export async function POST() {
  return supabaseNotConfiguredResponse();
}
