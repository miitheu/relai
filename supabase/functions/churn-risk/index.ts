import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse, optionsResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const log = createLogger("churn-risk");

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { client_id } = await req.json();
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

    // Parallel data fetches for churn analysis
    const [activitiesRes, deliveriesRes, renewalsRes, contractsRes, oppsRes] =
      await Promise.all([
        sb.from("activities")
          .select("activity_type, created_at")
          .eq("client_id", client_id)
          .order("created_at", { ascending: false })
          .limit(50),
        sb.from("deliveries")
          .select("delivery_type, status, delivered_at, created_at")
          .eq("client_id", client_id)
          .order("created_at", { ascending: false })
          .limit(20),
        sb.from("renewals")
          .select("status, renewal_date, value, currency")
          .eq("client_id", client_id)
          .order("renewal_date", { ascending: false })
          .limit(5),
        sb.from("contracts")
          .select("status, start_date, end_date, value, currency")
          .eq("client_id", client_id)
          .order("end_date", { ascending: false })
          .limit(5),
        sb.from("opportunities")
          .select("stage, value, created_at")
          .eq("client_id", client_id)
          .in("stage", ["Closed Won", "Closed Lost"])
          .limit(10),
      ]);

    const activities = activitiesRes.data || [];
    const deliveries = deliveriesRes.data || [];
    const renewals = renewalsRes.data || [];
    const contracts = contractsRes.data || [];
    const closedOpps = oppsRes.data || [];

    // Compute engagement metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const activitiesLast30 = activities.filter(
      (a: any) => new Date(a.created_at) >= thirtyDaysAgo
    ).length;
    const activitiesLast60 = activities.filter(
      (a: any) => new Date(a.created_at) >= sixtyDaysAgo
    ).length;
    const activitiesLast90 = activities.filter(
      (a: any) => new Date(a.created_at) >= ninetyDaysAgo
    ).length;

    const lastActivity = activities[0]?.created_at || null;
    const daysSinceLastActivity = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Find nearest renewal
    const upcomingRenewals = renewals.filter(
      (r: any) => new Date(r.renewal_date) > now && r.status !== "completed"
    );
    const nearestRenewal = upcomingRenewals[0];
    const daysToRenewal = nearestRenewal
      ? Math.floor((new Date(nearestRenewal.renewal_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Active contracts
    const activeContracts = contracts.filter(
      (c: any) => c.status === "active" || (c.end_date && new Date(c.end_date) > now)
    );

    const prompt = `You are a customer success analyst for a financial data provider. Analyze this client's churn risk.

CLIENT:
- Name: ${sanitizeForPrompt(client.name)}
- Type: ${sanitizeForPrompt(client.type)}
- Status: ${sanitizeForPrompt(client.status)}
- Relationship: ${sanitizeForPrompt(client.relationship_status)}
- AUM: ${client.aum_millions ? client.aum_millions + "M" : "unknown"}

ENGAGEMENT METRICS:
- Activities last 30 days: ${activitiesLast30}
- Activities last 60 days: ${activitiesLast60}
- Activities last 90 days: ${activitiesLast90}
- Days since last activity: ${daysSinceLastActivity}
- Total activities on record: ${activities.length}

DELIVERY HISTORY (${deliveries.length} deliveries):
${deliveries.slice(0, 5).map((d: any) => `- ${sanitizeForPrompt(d.delivery_type)}: ${sanitizeForPrompt(d.status)} (${d.delivered_at?.slice(0, 10) || "pending"})`).join("\n") || "No deliveries"}

CONTRACTS (${activeContracts.length} active):
${activeContracts.map((c: any) => `- ${sanitizeForPrompt(c.status)}: ${c.value} ${c.currency}, ends ${c.end_date || "unknown"}`).join("\n") || "No active contracts"}

RENEWALS:
${nearestRenewal ? `- Next renewal: ${nearestRenewal.renewal_date} (${daysToRenewal} days away), value: ${nearestRenewal.value} ${nearestRenewal.currency}, status: ${nearestRenewal.status}` : "No upcoming renewals"}

CLOSED DEALS: ${closedOpps.filter((o: any) => o.stage === "Closed Won").length} won, ${closedOpps.filter((o: any) => o.stage === "Closed Lost").length} lost

Analyze and return JSON:
{
  "churn_risk_score": <number 0-100, where 100 is highest risk>,
  "risk_level": "<low|medium|high|critical>",
  "key_risk_indicators": ["<indicator>", ...],
  "positive_signals": ["<signal>", ...],
  "engagement_trend": "<improving|stable|declining|inactive>",
  "recommended_actions": ["<action>", ...],
  "summary": "<2-3 sentence analysis>"
}`;

    const aiResponse = await callAIWithRetry(sb, {
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.3,
      userId: auth.userId,
      functionName: "churn-risk",
      response_format: { type: "json_object" },
    });

    const responseText = aiResponse.choices?.[0]?.message?.content || "{}";
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch {
      log.error("Failed to parse AI response", { response: responseText.slice(0, 200) });
      return errorResponse("Failed to parse analysis", 502);
    }

    // Store as customer health score
    // Mark previous scores as not latest
    await sb
      .from("customer_health_scores")
      .update({ is_latest: false })
      .eq("client_id", client_id)
      .eq("is_latest", true);

    // Insert new health score (inverted: 100 - churn_risk = health)
    const healthScore = Math.max(0, 100 - (analysis.churn_risk_score || 50));
    await sb.from("customer_health_scores").insert({
      client_id,
      score: healthScore,
      components_json: {
        engagement: activitiesLast30 > 5 ? 80 : activitiesLast30 > 2 ? 60 : activitiesLast30 > 0 ? 40 : 20,
        activity_trend: analysis.engagement_trend,
        risk_level: analysis.risk_level,
        risk_indicators: analysis.key_risk_indicators,
      },
    });

    log.info("Churn analysis completed", {
      client_id,
      churn_risk_score: analysis.churn_risk_score,
      health_score: healthScore,
    });

    return jsonResponse({
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
    });
  } catch (e: unknown) {
    log.error("Unhandled error", { error: e instanceof Error ? e.message : String(e) });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
