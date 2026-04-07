import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { sanitizeForPrompt, safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

export default async function churnRisk(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { client_id } = body;
  if (!client_id) return { data: null, error: { message: "client_id is required" } };

  const clients = await sql`SELECT * FROM clients WHERE id = ${client_id} LIMIT 1`;
  const client = clients[0];
  if (!client) return { data: null, error: { message: "Client not found" } };

  const [activitiesRes, deliveriesRes, renewalsRes, contractsRes, oppsRes] = await Promise.all([
    sql`SELECT activity_type, created_at FROM activities WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT delivery_type, status, delivered_at, created_at FROM deliveries WHERE client_id = ${client_id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT status, renewal_date, value, currency FROM renewals WHERE client_id = ${client_id} ORDER BY renewal_date DESC LIMIT 5`,
    sql`SELECT status, start_date, end_date, value, currency FROM contracts WHERE client_id = ${client_id} ORDER BY end_date DESC LIMIT 5`,
    sql`SELECT stage, value, created_at FROM opportunities WHERE client_id = ${client_id} AND stage IN ('Closed Won','Closed Lost') LIMIT 10`,
  ]);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  const activitiesLast30 = activitiesRes.filter((a: any) => new Date(a.created_at) >= thirtyDaysAgo).length;
  const activitiesLast60 = activitiesRes.filter((a: any) => new Date(a.created_at) >= sixtyDaysAgo).length;
  const activitiesLast90 = activitiesRes.filter((a: any) => new Date(a.created_at) >= ninetyDaysAgo).length;

  const lastActivity = activitiesRes[0]?.created_at || null;
  const daysSinceLastActivity = lastActivity
    ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / 86400000)
    : 999;

  const upcomingRenewals = renewalsRes.filter((r: any) => new Date(r.renewal_date) > now && r.status !== "completed");
  const nearestRenewal = upcomingRenewals[0];
  const daysToRenewal = nearestRenewal
    ? Math.floor((new Date(nearestRenewal.renewal_date).getTime() - now.getTime()) / 86400000)
    : null;

  const activeContracts = contractsRes.filter((c: any) => c.status === "active" || (c.end_date && new Date(c.end_date) > now));

  const prompt = `You are a customer success analyst for a financial data provider. Analyze this client's churn risk.

CLIENT:
- Name: ${sanitizeForPrompt(client.name)}
- Type: ${sanitizeForPrompt(client.client_type)}
- Status: ${sanitizeForPrompt(client.relationship_status)}
- AUM: ${client.aum_millions ? client.aum_millions + "M" : "unknown"}

ENGAGEMENT METRICS:
- Activities last 30 days: ${activitiesLast30}
- Activities last 60 days: ${activitiesLast60}
- Activities last 90 days: ${activitiesLast90}
- Days since last activity: ${daysSinceLastActivity}
- Total activities on record: ${activitiesRes.length}

DELIVERY HISTORY (${deliveriesRes.length} deliveries):
${deliveriesRes.slice(0, 5).map((d: any) => `- ${sanitizeForPrompt(d.delivery_type)}: ${sanitizeForPrompt(d.status)} (${d.delivered_at?.toISOString?.()?.slice(0, 10) || "pending"})`).join("\n") || "No deliveries"}

CONTRACTS (${activeContracts.length} active):
${activeContracts.map((c: any) => `- ${sanitizeForPrompt(c.status)}: ${c.value} ${c.currency}, ends ${c.end_date || "unknown"}`).join("\n") || "No active contracts"}

RENEWALS:
${nearestRenewal ? `- Next renewal: ${nearestRenewal.renewal_date} (${daysToRenewal} days away), value: ${nearestRenewal.value} ${nearestRenewal.currency}, status: ${nearestRenewal.status}` : "No upcoming renewals"}

CLOSED DEALS: ${oppsRes.filter((o: any) => o.stage === "Closed Won").length} won, ${oppsRes.filter((o: any) => o.stage === "Closed Lost").length} lost

Analyze and return JSON:
{
  "churn_risk_score": <number 0-100>,
  "risk_level": "<low|medium|high|critical>",
  "key_risk_indicators": ["<indicator>", ...],
  "positive_signals": ["<signal>", ...],
  "engagement_trend": "<improving|stable|declining|inactive>",
  "recommended_actions": ["<action>", ...],
  "summary": "<2-3 sentence analysis>"
}`;

  const aiResponse = await callAI(aiConfig, {
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1000,
    temperature: 0.3,
  });

  const analysis = safeParseJSON(aiResponse.content, null);
  if (!analysis) return { data: null, error: { message: "Failed to parse analysis" } };

  // Store health score
  await sql`UPDATE customer_health_scores SET is_latest = false WHERE client_id = ${client_id} AND is_latest = true`;

  const healthScore = Math.max(0, 100 - (analysis.churn_risk_score || 50));
  await sql`
    INSERT INTO customer_health_scores (client_id, score, components_json)
    VALUES (${client_id}, ${healthScore}, ${JSON.stringify({
      engagement: activitiesLast30 > 5 ? 80 : activitiesLast30 > 2 ? 60 : activitiesLast30 > 0 ? 40 : 20,
      activity_trend: analysis.engagement_trend,
      risk_level: analysis.risk_level,
      risk_indicators: analysis.key_risk_indicators,
    })}::jsonb)
  `;

  return {
    data: {
      client_id,
      analysis,
      health_score: healthScore,
      engagement_metrics: {
        activities_30d: activitiesLast30,
        activities_60d: activitiesLast60,
        activities_90d: activitiesLast90,
        days_since_last_activity: daysSinceLastActivity,
        days_to_renewal: daysToRenewal,
        active_contracts: activeContracts.length,
      },
    },
  };
}
