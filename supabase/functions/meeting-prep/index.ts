import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const log = createLogger("meeting-prep");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { client_id, opportunity_id, meeting_context } = await req.json();
    if (!client_id) return errorResponse("client_id is required", 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch client details
    const { data: client, error: clientError } = await sb
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    if (clientError || !client) return errorResponse("Client not found", 404);

    // Parallel data fetches
    const [contactsRes, oppsRes, activitiesRes, notesRes, intelligenceRes, datasetsRes] =
      await Promise.all([
        sb.from("contacts").select("name, title, email, linkedin, influence_level, relationship_strength").eq("client_id", client_id).limit(15),
        sb.from("opportunities").select("name, stage, value, probability, expected_close, notes").eq("client_id", client_id).order("created_at", { ascending: false }).limit(10),
        sb.from("activities").select("activity_type, description, created_at").eq("client_id", client_id).order("created_at", { ascending: false }).limit(15),
        sb.from("notes").select("content, created_at").eq("client_id", client_id).order("created_at", { ascending: false }).limit(10),
        sb.from("fund_intelligence_results").select("strategy_summary, sector_exposure_summary, portfolio_theme_summary, recommended_approach, confidence_score, created_at").eq("client_id", client_id).order("created_at", { ascending: false }).limit(5),
        sb.from("datasets").select("name, description, coverage").eq("is_active", true).limit(20),
      ]);

    // If opportunity_id provided, fetch it specifically
    let focusOpportunity = null;
    if (opportunity_id) {
      const { data } = await sb
        .from("opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .single();
      focusOpportunity = data;
    }

    const contacts = contactsRes.data || [];
    const opportunities = oppsRes.data || [];
    const activities = activitiesRes.data || [];
    const notes = notesRes.data || [];
    const intelligence = intelligenceRes.data || [];
    const datasets = datasetsRes.data || [];

    const prompt = `You are a senior sales strategist at a financial data provider. Prepare a comprehensive meeting brief.

CLIENT PROFILE:
- Name: ${sanitizeForPrompt(client.name)}
- Type: ${sanitizeForPrompt(client.client_type)}
- Tier: ${sanitizeForPrompt(client.client_tier)}
- Relationship: ${sanitizeForPrompt(client.relationship_status)}
- AUM: ${client.aum || "unknown"}
- Strategy: ${sanitizeForPrompt(client.strategy_focus)}
- Country: ${sanitizeForPrompt(client.headquarters_country)}

KEY CONTACTS:
${contacts.map((c: any) => `- ${sanitizeForPrompt(c.name)}, ${sanitizeForPrompt(c.title)} (${sanitizeForPrompt(c.influence_level)})${c.relationship_strength === 'Strong' ? " [KEY CONTACT]" : ""}`).join("\n") || "None on file"}

OPEN OPPORTUNITIES:
${opportunities.filter((o: any) => !["Closed Won", "Closed Lost"].includes(o.stage)).map((o: any) => `- ${sanitizeForPrompt(o.name)}: ${o.stage} - $${o.value} (${o.probability || "?"}% prob, close: ${o.expected_close || "TBD"})`).join("\n") || "None"}

${focusOpportunity ? `FOCUS OPPORTUNITY:\n- ${sanitizeForPrompt(focusOpportunity.name)}: ${focusOpportunity.stage} - $${focusOpportunity.value}\n- Notes: ${sanitizeForPrompt(focusOpportunity.notes)}` : ""}

RECENT ACTIVITY (last 15):
${activities.map((a: any) => `- [${a.created_at?.slice(0, 10)}] ${sanitizeForPrompt(a.activity_type)}: ${sanitizeForPrompt(a.description, 150)}`).join("\n") || "No activity"}

RECENT NOTES:
${notes.slice(0, 5).map((n: any) => `- [${n.created_at?.slice(0, 10)}] ${sanitizeForPrompt(n.content, 200)}`).join("\n") || "No notes"}

INTELLIGENCE INSIGHTS:
${intelligence.map((i: any) => {
  const parts = [];
  if (i.strategy_summary) parts.push(`Strategy: ${sanitizeForPrompt(i.strategy_summary, 200)}`);
  if (i.sector_exposure_summary) parts.push(`Sectors: ${sanitizeForPrompt(i.sector_exposure_summary, 150)}`);
  if (i.recommended_approach) parts.push(`Approach: ${sanitizeForPrompt(i.recommended_approach, 150)}`);
  return `- [${i.created_at?.slice(0, 10)}] ${parts.join(" | ")}`;
}).join("\n") || "No intelligence data"}

OUR PRODUCTS (data coverage):
${datasets.slice(0, 10).map((d: any) => `- ${sanitizeForPrompt(d.name)}: ${sanitizeForPrompt(d.description)} (${sanitizeForPrompt(d.coverage)})`).join("\n")}

${meeting_context ? `MEETING CONTEXT: ${sanitizeForPrompt(meeting_context, 300)}` : ""}

Generate a meeting preparation brief as JSON:
{
  "executive_summary": "<2-3 sentence overview of the relationship and current status>",
  "talking_points": ["<key point to raise>", ...],
  "questions_to_ask": ["<strategic question>", ...],
  "product_recommendations": [{"product": "<dataset name>", "rationale": "<why it fits>"}],
  "risk_factors": ["<concern to be aware of>", ...],
  "relationship_insights": "<analysis of engagement patterns and relationship health>",
  "next_steps": ["<recommended follow-up action>", ...]
}`;

    const aiResponse = await callAIWithRetry(sb, {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.4,
      userId: auth.userId,
      functionName: "meeting-prep",
      response_format: { type: "json_object" },
    });

    const responseText = aiResponse.choices?.[0]?.message?.content || "{}";
    let brief;
    try {
      brief = JSON.parse(responseText);
    } catch {
      log.error("Failed to parse AI response", { response: responseText.slice(0, 200) });
      return errorResponse("Failed to parse brief", 502);
    }

    log.info("Meeting brief generated", { client_id, opportunity_id });

    return jsonResponse({
      client_id,
      opportunity_id: opportunity_id || null,
      brief,
      data_summary: {
        contacts_count: contacts.length,
        opportunities_count: opportunities.length,
        activities_count: activities.length,
        intelligence_count: intelligence.length,
      },
    });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
