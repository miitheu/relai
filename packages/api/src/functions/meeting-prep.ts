import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { sanitizeForPrompt, safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

export default async function meetingPrep(ctx: FunctionContext) {
  const { sql, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { client_id, opportunity_id, meeting_context } = body;
  if (!client_id) return { data: null, error: { message: "client_id is required" } };

  // Fetch client
  const clients = await sql`SELECT * FROM clients WHERE id = ${client_id} LIMIT 1`;
  const client = clients[0];
  if (!client) return { data: null, error: { message: "Client not found" } };

  // Parallel data fetches
  const [contacts, opportunities, activities, notes, intelligence, datasets] = await Promise.all([
    sql`SELECT name, title, email, linkedin, influence_level, relationship_strength FROM contacts WHERE client_id = ${client_id} LIMIT 15`,
    sql`SELECT name, stage, value, probability, expected_close, notes FROM opportunities WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 10`,
    sql`SELECT activity_type, description, created_at FROM activities WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 15`,
    sql`SELECT content, created_at FROM notes WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 10`,
    sql`SELECT strategy_summary, sector_exposure_summary, portfolio_theme_summary, recommended_approach, confidence_score, created_at FROM fund_intelligence_results WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 5`,
    sql`SELECT name, description, coverage FROM datasets WHERE is_active = true LIMIT 20`,
  ]);

  let focusOpportunity: any = null;
  if (opportunity_id) {
    const oppRows = await sql`SELECT * FROM opportunities WHERE id = ${opportunity_id} LIMIT 1`;
    focusOpportunity = oppRows[0] || null;
  }

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
${contacts.map((c: any) => `- ${sanitizeForPrompt(c.name)}, ${sanitizeForPrompt(c.title)} (${sanitizeForPrompt(c.influence_level)})${c.relationship_strength === "Strong" ? " [KEY CONTACT]" : ""}`).join("\n") || "None on file"}

OPEN OPPORTUNITIES:
${opportunities.filter((o: any) => !["Closed Won", "Closed Lost"].includes(o.stage)).map((o: any) => `- ${sanitizeForPrompt(o.name)}: ${o.stage} - $${o.value} (${o.probability || "?"}% prob, close: ${o.expected_close || "TBD"})`).join("\n") || "None"}

${focusOpportunity ? `FOCUS OPPORTUNITY:\n- ${sanitizeForPrompt(focusOpportunity.name)}: ${focusOpportunity.stage} - $${focusOpportunity.value}\n- Notes: ${sanitizeForPrompt(focusOpportunity.notes)}` : ""}

RECENT ACTIVITY (last 15):
${activities.map((a: any) => `- [${a.created_at?.toISOString?.()?.slice(0, 10) || ""}] ${sanitizeForPrompt(a.activity_type)}: ${sanitizeForPrompt(a.description, 150)}`).join("\n") || "No activity"}

RECENT NOTES:
${notes.slice(0, 5).map((n: any) => `- [${n.created_at?.toISOString?.()?.slice(0, 10) || ""}] ${sanitizeForPrompt(n.content, 200)}`).join("\n") || "No notes"}

INTELLIGENCE INSIGHTS:
${intelligence.map((i: any) => {
  const parts = [];
  if (i.strategy_summary) parts.push(`Strategy: ${sanitizeForPrompt(i.strategy_summary, 200)}`);
  if (i.sector_exposure_summary) parts.push(`Sectors: ${sanitizeForPrompt(i.sector_exposure_summary, 150)}`);
  if (i.recommended_approach) parts.push(`Approach: ${sanitizeForPrompt(i.recommended_approach, 150)}`);
  return `- [${i.created_at?.toISOString?.()?.slice(0, 10) || ""}] ${parts.join(" | ")}`;
}).join("\n") || "No intelligence data"}

OUR PRODUCTS:
${datasets.slice(0, 10).map((d: any) => `- ${sanitizeForPrompt(d.name)}: ${sanitizeForPrompt(d.description)} (${sanitizeForPrompt(d.coverage)})`).join("\n")}

${meeting_context ? `MEETING CONTEXT: ${sanitizeForPrompt(meeting_context, 300)}` : ""}

Generate a meeting preparation brief as JSON:
{
  "executive_summary": "<2-3 sentence overview>",
  "talking_points": ["<key point>", ...],
  "questions_to_ask": ["<strategic question>", ...],
  "product_recommendations": [{"product": "<dataset name>", "rationale": "<why>"}],
  "risk_factors": ["<concern>", ...],
  "relationship_insights": "<analysis of engagement patterns>",
  "next_steps": ["<recommended follow-up>", ...]
}`;

  const aiResponse = await callAI(aiConfig, {
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
    temperature: 0.4,
  });

  const brief = safeParseJSON(aiResponse.content, null);
  if (!brief) {
    return { data: null, error: { message: "Failed to parse brief" } };
  }

  return {
    data: {
      client_id,
      opportunity_id: opportunity_id || null,
      brief,
      data_summary: {
        contacts_count: contacts.length,
        opportunities_count: opportunities.length,
        activities_count: activities.length,
        intelligence_count: intelligence.length,
      },
    },
  };
}
