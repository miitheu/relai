// Resolve AI provider config from org settings or environment variables.

import { sql } from "../db";
import type { AIProviderConfig, AIProviderId } from "./provider";

export async function resolveAIConfig(userId: string): Promise<AIProviderConfig | null> {
  // 1. Check org settings
  try {
    const orgResult = await sql`
      SELECT o.settings FROM organizations o
      JOIN profiles p ON p.org_id = o.id
      WHERE p.user_id = ${userId} LIMIT 1
    `;
    const settings = orgResult[0]?.settings as Record<string, any> | undefined;
    if (settings?.ai_provider?.id && (settings.ai_provider.apiKey || settings.ai_provider.baseUrl)) {
      return settings.ai_provider as AIProviderConfig;
    }
  } catch {
    // Table may not exist yet — fall through to env vars
  }

  // 2. Fall back to env vars
  const envProvider = process.env.AI_PROVIDER as AIProviderId | undefined;
  if (envProvider) {
    return {
      id: envProvider,
      apiKey: process.env.AI_API_KEY,
      baseUrl: process.env.AI_BASE_URL,
      model: process.env.AI_MODEL,
    };
  }

  return null;
}
