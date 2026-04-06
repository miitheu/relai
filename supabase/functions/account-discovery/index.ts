import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const logger = createLogger("account-discovery");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get the source client
    const { data: client, error: cErr } = await sb
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();
    if (cErr || !client) throw new Error("Client not found");

    // Get existing client names to avoid duplicates
    const { data: existingClients } = await sb
      .from("clients")
      .select("name, normalized_name, client_type");
    const existingNames = new Set(
      (existingClients || []).map((c: any) => (c.normalized_name || c.name).toLowerCase())
    );

    // Get datasets for context
    const { data: datasets } = await sb
      .from("datasets")
      .select("name, description, coverage")
      .eq("is_active", true)
      .limit(20);
    const datasetContext = (datasets || [])
      .map((d: any) => `- ${d.name}: ${d.description || ""} (${d.coverage || ""})`)
      .join("\n");

    // Sanitize user-controlled fields before embedding in AI prompt
    const safeName = sanitizeForPrompt(client.name);
    const safeClientType = sanitizeForPrompt(client.client_type);
    const safeStatus = sanitizeForPrompt(client.relationship_status);
    const safeCountry = sanitizeForPrompt(client.headquarters_country);
    const safeAum = sanitizeForPrompt(client.aum);
    const safeStrategy = sanitizeForPrompt(client.strategy_focus);

    // Build AI prompt
    const prompt = `You are a sales intelligence assistant for Relai, an alternative data vendor.

Given this account:
- Name: ${safeName}
- Type: ${safeClientType}
- Status: ${safeStatus}
- Country: ${safeCountry || "Unknown"}
- AUM: ${safeAum || "Unknown"}
- Strategy: ${safeStrategy || "Unknown"}

Relai's products:
${datasetContext}

Generate a list of 8-12 REAL companies that are similar to this account and would likely be good prospects for Relai's data products.

For each company, provide:
1. name - the real company name
2. type - company type (Hedge Fund, Asset Manager, Bank, Corporate, Vendor, Other)
3. country - headquarters country
4. similarity_reason - why this company is similar to the source account (1-2 sentences)
5. product_fit_reason - why Relai data would be valuable to them (1-2 sentences)
6. recommended_approach - brief suggestion for first outreach


CRITICAL RULES:
- Only suggest REAL, well-known companies that actually exist
- Focus on companies in the same industry/strategy/segment
- Mix of direct competitors, adjacent firms, and similar-profile organizations
- Do NOT include "${safeName}" itself
- Prefer companies that would genuinely benefit from alternative data

Return ONLY valid JSON array, no markdown:
[{"name":"...","type":"...","country":"...","similarity_reason":"...","product_fit_reason":"...","recommended_approach":"..."}]`;

    const { callAI } = await import("../_shared/ai.ts");
    const aiData = await callAI(sb, {
      model: "claude-sonnet-4-20250514",
      messages: [
        { role: "system", content: "You are a financial industry expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      userId: auth.userId,
      functionName: "account-discovery",
    });
    let content = aiData.choices?.[0]?.message?.content || "[]";

    // Clean markdown fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let suggestions: any[];
    try {
      suggestions = JSON.parse(content);
    } catch {
      suggestions = [];
    }

    // Mark which ones are already in CRM
    const enriched = suggestions.map((s: any) => ({
      ...s,
      already_in_crm: existingNames.has((s.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")),
    }));

    logger.info("Account discovery completed", { client_id, suggestion_count: enriched.length });

    return jsonResponse({ suggestions: enriched });
  } catch (e: any) {
    logger.error("Account discovery failed", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});
