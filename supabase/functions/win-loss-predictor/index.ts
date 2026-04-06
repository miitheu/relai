import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const log = createLogger("win-loss-predictor");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { opportunity_id } = await req.json();
    if (!opportunity_id) return errorResponse("opportunity_id is required", 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the opportunity with client info
    const { data: opp, error: oppError } = await sb
      .from("opportunities")
      .select("*, clients(name, type, status, relationship_status, aum_millions, country, region)")
      .eq("id", opportunity_id)
      .single();

    if (oppError || !opp) return errorResponse("Opportunity not found", 404);

    // Fetch recent activities for this opportunity's client
    const { data: activities } = await sb
      .from("activities")
      .select("activity_type, subject, created_at")
      .eq("client_id", opp.client_id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch historical win/loss data for similar opportunities
    const { data: historicalOpps } = await sb
      .from("opportunities")
      .select("stage, value, currency, created_at, expected_close_date")
      .in("stage", ["Closed Won", "Closed Lost"])
      .limit(100);

    const winCount = historicalOpps?.filter((o: any) => o.stage === "Closed Won").length || 0;
    const lossCount = historicalOpps?.filter((o: any) => o.stage === "Closed Lost").length || 0;
    const baseWinRate = historicalOpps?.length ? Math.round((winCount / historicalOpps.length) * 100) : 50;

    // Fetch contacts associated with this client
    const { data: contacts } = await sb
      .from("contacts")
      .select("first_name, last_name, title, is_primary")
      .eq("client_id", opp.client_id)
      .limit(10);

    // Build AI prompt
    const client = opp.clients;
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(opp.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysUntilClose = opp.expected_close_date
      ? Math.floor(
          (new Date(opp.expected_close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : null;

    const prompt = `You are a senior sales analytics expert for a financial data provider CRM. Analyze this opportunity and predict the win probability.

OPPORTUNITY:
- Name: ${sanitizeForPrompt(opp.name)}
- Stage: ${sanitizeForPrompt(opp.stage)}
- Value: ${opp.value} ${opp.currency || "USD"}
- Probability (current): ${opp.probability || "not set"}%
- Days in pipeline: ${daysSinceCreated}
- Expected close: ${opp.expected_close_date || "not set"} (${daysUntilClose !== null ? daysUntilClose + " days away" : "unknown"})

CLIENT:
- Name: ${sanitizeForPrompt(client?.name)}
- Type: ${sanitizeForPrompt(client?.type)}
- Status: ${sanitizeForPrompt(client?.status)}
- Relationship: ${sanitizeForPrompt(client?.relationship_status)}
- AUM: ${client?.aum_millions ? client.aum_millions + "M" : "unknown"}
- Region: ${sanitizeForPrompt(client?.region)} / ${sanitizeForPrompt(client?.country)}

CONTACTS (${contacts?.length || 0}):
${contacts?.map((c: any) => `- ${sanitizeForPrompt(c.first_name)} ${sanitizeForPrompt(c.last_name)}, ${sanitizeForPrompt(c.title)}${c.is_primary ? " (PRIMARY)" : ""}`).join("\n") || "None identified"}

RECENT ACTIVITY (${activities?.length || 0} activities):
${activities?.slice(0, 10).map((a: any) => `- ${sanitizeForPrompt(a.activity_type)}: ${sanitizeForPrompt(a.subject)} (${a.created_at?.slice(0, 10)})`).join("\n") || "No recent activity"}

HISTORICAL CONTEXT:
- Overall win rate: ${baseWinRate}% (${winCount} wins, ${lossCount} losses)

Provide your analysis as JSON with this exact structure:
{
  "win_probability": <number 0-100>,
  "confidence": "<low|medium|high>",
  "risk_factors": ["<string>", ...],
  "positive_factors": ["<string>", ...],
  "recommended_actions": ["<string>", ...],
  "summary": "<1-2 sentence summary>"
}`;

    const aiResponse = await callAIWithRetry(sb, {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
      userId: auth.userId,
      functionName: "win-loss-predictor",
      response_format: { type: "json_object" },
    });

    const responseText = aiResponse.choices?.[0]?.message?.content || "{}";
    let prediction;
    try {
      prediction = JSON.parse(responseText);
    } catch {
      log.error("Failed to parse AI response", { response: responseText.slice(0, 200) });
      return errorResponse("Failed to parse prediction", 502);
    }

    log.info("Prediction generated", {
      opportunity_id,
      win_probability: prediction.win_probability,
    });

    return jsonResponse({
      opportunity_id,
      prediction,
      metadata: {
        base_win_rate: baseWinRate,
        days_in_pipeline: daysSinceCreated,
        activity_count: activities?.length || 0,
        contact_count: contacts?.length || 0,
      },
    });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
