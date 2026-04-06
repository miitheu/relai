import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const log = createLogger("auto-enrich");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { client_id, enrichment_types } = await req.json();
    if (!client_id) return errorResponse("client_id is required", 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch client
    const { data: client, error: clientError } = await sb
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    if (clientError || !client) return errorResponse("Client not found", 404);

    const types = enrichment_types || ["company_profile", "key_personnel", "recent_news", "competitive_landscape"];
    const results: any[] = [];

    for (const enrichType of types) {
      const prompt = buildEnrichmentPrompt(enrichType, client);
      if (!prompt) continue;

      try {
        const aiResponse = await callAIWithRetry(sb, {
          model: "gemini-2.0-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
          temperature: 0.3,
          userId: auth.userId,
          functionName: "auto-enrich",
          response_format: { type: "json_object" },
        });

        const responseText = aiResponse.choices?.[0]?.message?.content || "{}";
        let enrichData;
        try {
          enrichData = JSON.parse(responseText);
        } catch {
          log.warn("Failed to parse enrichment response", { type: enrichType });
          continue;
        }

        // Store enrichment result
        const { data: inserted } = await sb
          .from("enrichment_results")
          .insert({
            entity_type: "client",
            entity_id: client_id,
            source: "ai_enrichment",
            enrichment_type: enrichType,
            data_json: enrichData,
            confidence: enrichData.confidence || 0.7,
          })
          .select("id")
          .single();

        results.push({
          type: enrichType,
          status: "success",
          id: inserted?.id,
          data: enrichData,
        });
      } catch (err: unknown) {
        log.warn("Enrichment failed for type", {
          type: enrichType,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({
          type: enrichType,
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    log.info("Enrichment completed", {
      client_id,
      types_requested: types.length,
      successful: results.filter((r) => r.status === "success").length,
    });

    return jsonResponse({
      client_id,
      results,
      summary: {
        total: types.length,
        successful: results.filter((r) => r.status === "success").length,
        failed: results.filter((r) => r.status === "error").length,
      },
    });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});

function buildEnrichmentPrompt(type: string, client: any): string | null {
  const clientDesc = `${sanitizeForPrompt(client.name)} - ${sanitizeForPrompt(client.type)} based in ${sanitizeForPrompt(client.country || client.region)}${client.aum_millions ? `, AUM: ${client.aum_millions}M` : ""}`;

  switch (type) {
    case "company_profile":
      return `You are a financial research analyst. Based on your knowledge, provide a company profile for: ${clientDesc}

Return JSON:
{
  "description": "<1-2 sentence company description>",
  "founded_year": <number or null>,
  "headquarters": "<city, country>",
  "employee_count_estimate": "<range like 100-500>",
  "primary_business": "<main business activity>",
  "regulatory_status": "<regulated/unregulated/unknown>",
  "website_domain": "<likely domain>",
  "confidence": <0.0-1.0>
}`;

    case "key_personnel":
      return `You are a financial research analyst. Based on your knowledge of the financial industry, who are likely key personnel at: ${clientDesc}

Return JSON:
{
  "personnel": [
    {"name": "<name>", "likely_title": "<title>", "relevance": "<why they matter for data sales>"}
  ],
  "confidence": <0.0-1.0>
}

Include up to 5 likely key decision makers for data/technology purchases.`;

    case "recent_news":
      return `You are a financial research analyst. Based on your knowledge up to your training cutoff, what notable events or news has occurred related to: ${clientDesc}

Return JSON:
{
  "events": [
    {"date_approximate": "<YYYY-MM or YYYY>", "headline": "<brief headline>", "significance": "<impact on data needs>"}
  ],
  "market_sentiment": "<positive|neutral|negative|mixed>",
  "confidence": <0.0-1.0>
}

Include up to 5 most relevant recent events.`;

    case "competitive_landscape":
      return `You are a financial research analyst. Analyze the competitive landscape for: ${clientDesc}

In the context of financial data purchasing and usage, return JSON:
{
  "competitors": [
    {"name": "<competitor>", "relationship": "<direct/indirect>", "overlap_area": "<where they compete>"}
  ],
  "market_position": "<leader|challenger|niche|emerging>",
  "data_sophistication": "<basic|intermediate|advanced>",
  "likely_data_vendors": ["<vendor name>"],
  "confidence": <0.0-1.0>
}`;

    default:
      return null;
  }
}
