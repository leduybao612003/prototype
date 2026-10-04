import { isSupabaseConfigured } from "@/lib/supabase";
import { aiMode } from "@/lib/provider";

export async function GET() {
  return Response.json({
    ok: true,
    app: "vlearn-prototype",
    supabaseConfigured: isSupabaseConfigured(),
    aiMode: aiMode(),
    aiConfigured: Boolean(
      process.env.AI_PROVIDER_API_KEY && process.env.AI_TEXT_MODEL,
    ),
    storage: "seed-local (Supabase BLOCKED cho ghi bền vững)",
  });
}
