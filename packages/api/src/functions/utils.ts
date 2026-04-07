// Shared utilities for function handlers

import type { AIProviderConfig } from "../ai/provider";
import type postgres from "postgres";

export type Sql = ReturnType<typeof import("postgres").default>;

export interface FunctionContext {
  sql: Sql;
  userId: string;
  body: Record<string, any>;
  aiConfig: AIProviderConfig | null;
}

/** Sanitize user-supplied text before including it in an AI prompt. */
export function sanitizeForPrompt(text: unknown, maxLength = 1000): string {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .slice(0, maxLength)
    .trim();
}

/** Strip markdown code fences from AI response content. */
export function stripCodeFences(content: string): string {
  return content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
}

/** Safely parse JSON from AI response, returning fallback on failure. */
export function safeParseJSON<T = any>(text: string, fallback: T): T {
  try {
    const cleaned = stripCodeFences(text);
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

/** Standard error for AI not being configured. */
export const AI_NOT_CONFIGURED_ERROR = {
  data: null,
  error: {
    message: "AI provider not configured. Set one up in Settings > AI Configuration.",
    code: "AI_NOT_CONFIGURED",
  },
};
