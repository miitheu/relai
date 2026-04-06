import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AICallConfig {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature?: number;
  userId?: string;
  functionName: string;
  response_format?: { type: string };
}

export interface AIResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Map legacy model names to Claude equivalents */
function resolveModel(model: string): string {
  const mapping: Record<string, string> = {
    "gemini-2.0-flash": "claude-sonnet-4-20250514",
    "gemini-1.5-flash": "claude-sonnet-4-20250514",
    "gemini-1.5-pro": "claude-sonnet-4-20250514",
    "google/gemini-3-flash-preview": "claude-sonnet-4-20250514",
    "google/gemini-2.5-flash": "claude-sonnet-4-20250514",
  };
  return mapping[model] || model;
}

/**
 * Convert OpenAI-style messages to Anthropic format.
 * Extracts system message and converts to Claude's messages API format.
 */
function toAnthropicFormat(messages: Array<{ role: string; content: string }>): {
  system: string | undefined;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  let system: string | undefined;
  const anthropicMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = system ? `${system}\n\n${msg.content}` : msg.content;
    } else if (msg.role === "user" || msg.role === "assistant") {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  // Anthropic requires at least one user message
  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: system || "Hello" });
    system = undefined;
  }

  return { system, messages: anthropicMessages };
}

/**
 * Call the Anthropic Messages API and log usage.
 * Maintains OpenAI-compatible response format for backward compatibility.
 */
export async function callAI(
  sb: ReturnType<typeof createClient>,
  config: AICallConfig,
): Promise<AIResponse> {
  const startTime = Date.now();
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const claudeModel = resolveModel(config.model);
  const { system, messages } = toAnthropicFormat(config.messages);

  const body: Record<string, unknown> = {
    model: claudeModel,
    messages,
    max_tokens: config.max_tokens,
    temperature: config.temperature ?? 0.4,
  };
  if (system) {
    body.system = system;
  }

  let response: Response | null = null;
  let data: any = null;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 529 || response.status === 503 || response.status === 429) {
      const waitMs = Math.min(2000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }

  data = await response!.json();

  if (!response!.ok && response!.status !== 529) {
    throw new Error(`Anthropic API error (${response!.status}): ${data?.error?.message || JSON.stringify(data)}`);
  }
  const durationMs = Date.now() - startTime;

  // Map Anthropic response to OpenAI-compatible format
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;
  const content = data.content?.map((c: { text: string }) => c.text).join("") || "";

  const aiResponse: AIResponse = {
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };

  // Log usage (fire-and-forget)
  sb.from("ai_usage_log")
    .insert({
      user_id: config.userId || null,
      function_name: config.functionName,
      model: claudeModel,
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      cost_usd: estimateCost(claudeModel, inputTokens, outputTokens),
      duration_ms: durationMs,
      status: response.ok ? "success" : "error",
      error_message: response.ok ? null : `HTTP ${response.status}: ${data.error?.message || ""}`,
    })
    .then(() => {});

  if (!response.ok) {
    if (response.status === 429) throw new RateLimitError("Rate limited");
    if (response.status === 529) throw new RateLimitError("API overloaded");
    throw new Error(`Anthropic API error: HTTP ${response.status} - ${data.error?.message || ""}`);
  }

  return aiResponse;
}

/**
 * Call AI with exponential backoff retry on rate limits.
 */
export async function callAIWithRetry(
  sb: ReturnType<typeof createClient>,
  config: AICallConfig,
  maxRetries = 3,
): Promise<AIResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callAI(sb, config);
    } catch (error: unknown) {
      if (error instanceof RateLimitError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Call AI with SSE streaming. Returns a ReadableStream for the client.
 * Converts Anthropic's SSE format to OpenAI-compatible SSE.
 */
export async function callAIStreaming(
  config: Omit<AICallConfig, "functionName" | "userId">,
): Promise<Response> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const claudeModel = resolveModel(config.model);
  const { system, messages } = toAnthropicFormat(config.messages);

  const body: Record<string, unknown> = {
    model: claudeModel,
    messages,
    max_tokens: config.max_tokens,
    temperature: config.temperature ?? 0.4,
    stream: true,
  };
  if (system) {
    body.system = system;
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AI streaming error: HTTP ${response.status}`);
  }

  return response;
}

/**
 * Generate embeddings using Voyage AI (Anthropic's recommended embedding provider).
 * Falls back to a simple hash-based approach if no API key.
 */
export async function generateEmbedding(
  text: string,
  model = "voyage-3-lite",
): Promise<number[]> {
  const apiKey = Deno.env.get("VOYAGE_API_KEY");
  if (!apiKey) throw new Error("VOYAGE_API_KEY not configured — needed for embeddings");

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [text.slice(0, 8000)],
      input_type: "document",
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage AI error: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding;
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Approximate costs per 1M tokens for Claude models
  const rates: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-opus-4-6": { input: 15.0, output: 75.0 },
    "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
    "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
    "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
    "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
    "claude-3-5-haiku-20241022": { input: 0.80, output: 4.0 },
    "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  };
  const rate = rates[model] || { input: 3.0, output: 15.0 };
  return (
    (promptTokens / 1_000_000) * rate.input +
    (completionTokens / 1_000_000) * rate.output
  );
}
