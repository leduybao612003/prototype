// AI provider interface dùng chung cho chat / summarize / vision / mindmap.
// Chế độ AI_MODE=mock (mặc định): chạy engine mô phỏng nội bộ, KHÔNG cần
// key/model/base URL. AI_MODE=live: gọi provider OpenAI-compatible thật;
// thiếu credential → lỗi 503/502 rõ ràng, không fallback giả.
// Giữ interface này ổn định để giai đoạn sau chỉ đổi provider, không sửa routes.

export type AiMode = "mock" | "live";

export function aiMode(): AiMode {
  return process.env.AI_MODE === "live" ? "live" : "mock";
}

export function liveConfig(): { key: string; model: string; base: string } | null {
  const key = process.env.AI_PROVIDER_API_KEY;
  const model = process.env.AI_TEXT_MODEL;
  const base = process.env.AI_BASE_URL;
  if (!key || !model || !base) return null;
  return { key, model, base };
}

export function liveVisionModel(): string | null {
  return process.env.AI_VISION_MODEL ?? process.env.AI_TEXT_MODEL ?? null;
}

export type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ProviderChatMsg {
  role: "system" | "user" | "assistant";
  content: string | ChatContent[];
}

// Gọi /chat/completions OpenAI-compatible (non-stream). Chỉ dùng ở live mode.
export async function callChatCompletions(
  model: string,
  messages: ProviderChatMsg[],
  opts: { json?: boolean; timeoutMs?: number } = {},
): Promise<{ text: string; model: string } | { error: string }> {
  const cfg = liveConfig();
  if (!cfg) return { error: "missing-key" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
    const res = await fetch(`${cfg.base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: opts.json ? model : model,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages,
        temperature: 0.3,
      }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { error: `provider-http-${res.status}` };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { error: "provider-empty" };
    return { text, model };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "provider-failed" };
  }
}

// Thiếu credential ở live mode → response 503 dùng chung (giữ câu hỏi phía client).
export function missingCredentialResponse(requestId: string) {
  return Response.json(
    {
      code: "AI_NOT_CONFIGURED",
      message:
        "AI_MODE=live nhưng thiếu credential (AI_PROVIDER_API_KEY / AI_TEXT_MODEL / AI_BASE_URL). " +
        "Cấu hình xong bấm Thử lại, hoặc chạy AI_MODE=mock để demo mô phỏng.",
      requestId,
    },
    { status: 503 },
  );
}
