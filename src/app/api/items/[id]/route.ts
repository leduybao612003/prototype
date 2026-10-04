import { z } from "zod";
import { supabaseNotConfiguredResponse } from "@/lib/supabase";

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(20000).optional(),
  status: z.enum(["normal", "unresolved", "resolved"]).optional(),
  // Revision check chống response cũ đè nội dung mới (§4).
  revision: z.number().int().positive(),
  clientOperationId: z.string().min(1),
});

// PATCH/DELETE /api/items/{id} — cần Supabase (revision check + soft delete).
export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_BODY", issues: parsed.error.issues },
      { status: 400 },
    );
  return supabaseNotConfiguredResponse();
}

export async function DELETE() {
  return supabaseNotConfiguredResponse();
}
