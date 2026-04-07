// Multi-provider AI abstraction — supports Anthropic, OpenAI, Google, Ollama, and OpenAI-compatible APIs.
// Uses raw fetch() with no SDK dependencies.

export type AIProviderId = "anthropic" | "openai" | "google" | "ollama" | "custom";

export interface AIProviderConfig {
  id: AIProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export function getDefaultModel(providerId: AIProviderId): string {
  switch (providerId) {
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4o";
    case "google":
      return "gemini-2.0-flash";
    case "ollama":
      return "llama3.1";
    case "custom":
      return "gpt-4o";
  }
}

export async function callAI(
  config: AIProviderConfig,
  options: {
    system?: string;
    messages: AIMessage[];
    maxTokens?: number;
    temperature?: number;
  }
): Promise<AIResponse> {
  const model = config.model || getDefaultModel(config.id);
  const maxTokens = options.maxTokens ?? 2000;
  const temperature = options.temperature ?? 0.7;

  switch (config.id) {
    case "anthropic":
      return callAnthropic(config, model, options, maxTokens, temperature);
    case "openai":
      return callOpenAI(config, model, options, maxTokens, temperature, "https://api.openai.com/v1");
    case "google":
      return callGoogle(config, model, options, maxTokens, temperature);
    case "ollama":
      return callOllama(config, model, options);
    case "custom":
      return callOpenAI(config, model, options, maxTokens, temperature, config.baseUrl || "https://api.openai.com/v1");
    default:
      throw new Error(`Unsupported AI provider: ${config.id}`);
  }
}

// ── Anthropic ───────────────────────────────────────────────────────

async function callAnthropic(
  config: AIProviderConfig,
  model: string,
  options: { system?: string; messages: AIMessage[]; },
  maxTokens: number,
  temperature: number
): Promise<AIResponse> {
  if (!config.apiKey) throw new Error("Anthropic API key is required");

  // Separate system from messages (Anthropic uses a top-level system param)
  const systemText = options.system || options.messages.find(m => m.role === "system")?.content;
  const userMessages = options.messages.filter(m => m.role !== "system").map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: userMessages,
    temperature,
  };
  if (systemText) body.system = systemText;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: data.content?.[0]?.text || "",
    model: data.model || model,
    usage: data.usage
      ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens }
      : undefined,
  };
}

// ── OpenAI / OpenAI-compatible ──────────────────────────────────────

async function callOpenAI(
  config: AIProviderConfig,
  model: string,
  options: { system?: string; messages: AIMessage[] },
  maxTokens: number,
  temperature: number,
  baseUrl: string
): Promise<AIResponse> {
  // Build messages array with system message first
  const msgs: { role: string; content: string }[] = [];
  const systemText = options.system || options.messages.find(m => m.role === "system")?.content;
  if (systemText) msgs.push({ role: "system", content: systemText });
  for (const m of options.messages) {
    if (m.role !== "system") msgs.push({ role: m.role, content: m.content });
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: msgs, temperature }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    model: data.model || model,
    usage: data.usage
      ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens }
      : undefined,
  };
}

// ── Google Gemini ───────────────────────────────────────────────────

async function callGoogle(
  config: AIProviderConfig,
  model: string,
  options: { system?: string; messages: AIMessage[] },
  maxTokens: number,
  temperature: number
): Promise<AIResponse> {
  if (!config.apiKey) throw new Error("Google API key is required");

  const systemText = options.system || options.messages.find(m => m.role === "system")?.content;

  // Map messages to Gemini format (role: "user" | "model")
  const contents = options.messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    model,
    usage: data.usageMetadata
      ? {
          input_tokens: data.usageMetadata.promptTokenCount || 0,
          output_tokens: data.usageMetadata.candidatesTokenCount || 0,
        }
      : undefined,
  };
}

// ── Ollama ──────────────────────────────────────────────────────────

async function callOllama(
  config: AIProviderConfig,
  model: string,
  options: { system?: string; messages: AIMessage[] }
): Promise<AIResponse> {
  const baseUrl = config.baseUrl || "http://localhost:11434";

  // Ollama uses the same message format as OpenAI
  const msgs: { role: string; content: string }[] = [];
  const systemText = options.system || options.messages.find(m => m.role === "system")?.content;
  if (systemText) msgs.push({ role: "system", content: systemText });
  for (const m of options.messages) {
    if (m.role !== "system") msgs.push({ role: m.role, content: m.content });
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: msgs, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    content: data.message?.content || "",
    model: data.model || model,
  };
}

// ── Connection test ─────────────────────────────────────────────────

export async function testConnection(
  config: AIProviderConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await callAI(config, {
      system: "Reply with exactly: OK",
      messages: [{ role: "user", content: "Say hello" }],
      maxTokens: 10,
      temperature: 0,
    });
    return { ok: !!response.content };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
