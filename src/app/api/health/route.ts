import { isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  return Response.json({
    ok: true,
    app: "vlearn-prototype",
    supabaseConfigured: isSupabaseConfigured(),
    aiConfigured: Boolean(
      process.env.AI_PROVIDER_API_KEY && process.env.AI_TEXT_MODEL,
    ),
    storage: "seed-local (Supabase BLOCKED cho ghi bền vững)",
  });
}
