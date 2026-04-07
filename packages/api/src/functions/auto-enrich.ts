import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { sanitizeForPrompt, safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

function buildEnrichmentPrompt(type: string, client: any): string | null {
  const clientDesc = `${sanitizeForPrompt(client.name)} - ${sanitizeForPrompt(client.client_type)} based in ${sanitizeForPrompt(client.headquarters_country || client.region)}${client.aum_millions ? `, AUM: ${client.aum_millions}M` : ""}`;

  switch (type) {
    case "company_profile":
      return `You are a financial research analyst. Provide a company profile for: ${clientDesc}
Return JSON:
{"description":"<1-2 sentences>","founded_year":<number or null>,"headquarters":"<city, country>","employee_count_estimate":"<range>","primary_business":"<main activity>","regulatory_status":"<regulated/unregulated/unknown>","website_domain":"<likely domain>","confidence":<0.0-1.0>}`;
    case "key_personnel":
      return `You are a financial research analyst. Who are key personnel at: ${clientDesc}
Return JSON:
{"personnel":[{"name":"<name>","likely_title":"<title>","relevance":"<why they matter for data sales>"}],"confidence":<0.0-1.0>}
Include up to 5 key decision makers for data/technology purchases.`;
    case "recent_news":
      return `You are a financial research analyst. What notable events occurred related to: ${clientDesc}
Return JSON:
{"events":[{"date_approximate":"<YYYY-MM>","headline":"<brief>","significance":"<impact on data needs>"}],"market_sentiment":"<positive|neutral|negative|mixed>","confidence":<0.0-1.0>}
Include up to 5 most relevant events.`;
    case "competitive_landscape":
      return `You are a financial research analyst. Analyze competitive landscape for: ${clientDesc}
In the context of financial data purchasing, return JSON:
{"competitors":[{"name":"<competitor>","relationship":"<direct/indirect>","overlap_area":"<where they compete>"}],"market_position":"<leader|challenger|niche|emerging>","data_sophistication":"<basic|intermediate|advanced>","likely_data_vendors":["<vendor>"],"confidence":<0.0-1.0>}`;
    default:
      return null;
  }
}

export default async function autoEnrich(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { client_id, enrichment_types } = body;
  if (!client_id) return { data: null, error: { message: "client_id is required" } };

  const clients = await sql`SELECT * FROM clients WHERE id = ${client_id} LIMIT 1`;
  const client = clients[0];
  if (!client) return { data: null, error: { message: "Client not found" } };

  const types = enrichment_types || ["company_profile", "key_personnel", "recent_news", "competitive_landscape"];
  const results: any[] = [];

  for (const enrichType of types) {
    const prompt = buildEnrichmentPrompt(enrichType, client);
    if (!prompt) continue;

    try {
      const aiResponse = await callAI(aiConfig, {
        messages: [{ role: "user", content: prompt }],
        maxTokens: 1500,
        temperature: 0.3,
      });

      const enrichData = safeParseJSON(aiResponse.content, null);
      if (!enrichData) continue;

      const inserted = await sql`
        INSERT INTO enrichment_results (entity_type, entity_id, source, enrichment_type, data_json, confidence)
        VALUES ('client', ${client_id}, 'ai_enrichment', ${enrichType}, ${JSON.stringify(enrichData)}::jsonb, ${enrichData.confidence || 0.7})
        RETURNING id
      `;

      results.push({ type: enrichType, status: "success", id: inserted[0]?.id, data: enrichData });
    } catch (err: unknown) {
      results.push({ type: enrichType, status: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return {
    data: {
      client_id,
      results,
      summary: {
        total: types.length,
        successful: results.filter(r => r.status === "success").length,
        failed: results.filter(r => r.status === "error").length,
      },
    },
  };
}
