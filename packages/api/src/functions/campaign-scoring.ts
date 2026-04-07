import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { sanitizeForPrompt, safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

export default async function campaignScoring(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { campaign_id, rescore } = body;
  if (!campaign_id) return { data: null, error: { message: "campaign_id required" } };

  const isRescore = rescore === true;

  // 1. Load campaign
  const campaigns = await sql`SELECT * FROM campaigns WHERE id = ${campaign_id} LIMIT 1`;
  const campaign = campaigns[0];
  if (!campaign) return { data: null, error: { message: "Campaign not found" } };

  // 2. Load target products
  let productContext = "All Relai products";
  if (campaign.target_product_ids?.length > 0) {
    const products = await sql`SELECT id, name, description, coverage, example_use_cases FROM datasets WHERE id = ANY(${campaign.target_product_ids})`;
    productContext = products.map((p: any) => `- ${p.name}: ${p.description || "N/A"}. Coverage: ${p.coverage || "N/A"}. Use cases: ${p.example_use_cases || "N/A"}`).join("\n");
  }

  // 3. Load eligible clients
  const types = campaign.target_account_types || [];
  const geos = campaign.target_geographies || [];

  let allClients: any[];
  if (types.length > 0) {
    allClients = await sql`SELECT id, name, client_type, relationship_status, headquarters_country, aum, strategy_focus, notes FROM clients WHERE client_type = ANY(${types})`;
  } else {
    allClients = await sql`SELECT id, name, client_type, relationship_status, headquarters_country, aum, strategy_focus, notes FROM clients`;
  }

  let eligible = allClients.filter((c: any) => {
    if (!campaign.include_existing_clients && c.relationship_status === "Active Client") return false;
    if (!campaign.include_prospects && c.relationship_status === "Prospect") return false;
    if (geos.length > 0 && c.headquarters_country && !geos.includes(c.headquarters_country)) return false;
    return true;
  });

  // 4. Handle rescore vs new scoring
  const existingTargets = await sql`SELECT id, client_id FROM campaign_targets WHERE campaign_id = ${campaign_id}`;
  const existingIds = new Set(existingTargets.map((t: any) => t.client_id).filter(Boolean));
  const existingTargetMap = new Map(existingTargets.map((t: any) => [t.client_id, t.id]));

  if (isRescore && existingTargets.length > 0) {
    const rescoreClients = allClients.filter((c: any) => existingIds.has(c.id));
    if (rescoreClients.length === 0) return { data: { targets_created: 0, rescored_count: 0, eligible_count: 0, scored_count: 0 } };
    eligible = rescoreClients;
  } else {
    eligible = eligible.filter((c: any) => !existingIds.has(c.id));
  }

  if (eligible.length === 0) return { data: { targets_created: 0, rescored_count: 0, eligible_count: 0, scored_count: 0 } };

  const maxToScore = Math.min(eligible.length, 100);
  const toScore = eligible.slice(0, maxToScore);
  const clientIds = toScore.map((c: any) => c.id);

  // 5. Fetch intelligence data
  const [fundResults, contacts] = await Promise.all([
    sql`SELECT client_id, strategy_summary, sector_exposure_summary, portfolio_theme_summary, relevant_datasets_json, confidence_score, suggested_messaging, recommended_approach FROM fund_intelligence_results WHERE client_id = ANY(${clientIds}) ORDER BY created_at DESC`,
    sql`SELECT id, client_id, name, title, influence_level, relationship_strength FROM contacts WHERE client_id = ANY(${clientIds})`,
  ]);

  // Build intelligence context per client
  const intelligenceContext: Record<string, string> = {};
  for (const c of toScore) {
    const result = fundResults.find((r: any) => r.client_id === c.id);
    const parts: string[] = [];
    if (result) {
      if (result.strategy_summary) parts.push(`Strategy: ${result.strategy_summary}`);
      if (result.sector_exposure_summary) parts.push(`Sector Exposure: ${result.sector_exposure_summary}`);
      if (result.portfolio_theme_summary) parts.push(`Portfolio Themes: ${result.portfolio_theme_summary}`);
    }
    intelligenceContext[c.id] = parts.length > 0 ? parts.join("\n") : "No company intelligence available. Score based on firmographic fit only.";
  }

  // 6. Build AI prompt
  const accountList = toScore.map((c: any, i: number) =>
    `[${i}] ${sanitizeForPrompt(c.name)} | Type: ${sanitizeForPrompt(c.client_type)} | Status: ${sanitizeForPrompt(c.relationship_status)} | Country: ${sanitizeForPrompt(c.headquarters_country) || "?"} | AUM: ${c.aum || "?"} | Strategy: ${sanitizeForPrompt(c.strategy_focus) || "?"}
COMPANY INTELLIGENCE:
${intelligenceContext[c.id]}`
  ).join("\n---\n");

  const focusDescriptions: Record<string, string> = {
    upsell: "Expand product usage with existing paying clients",
    cross_sell: "Introduce complementary products to accounts using related datasets",
    new_logo: "Acquire net-new accounts",
    reactivation: "Re-engage dormant or lapsed accounts",
    renewal_expansion: "Increase renewal value with existing clients",
    partnership: "Identify potential data distribution or technology partnership targets",
  };

  const prompt = `You are a senior sales strategist for Relai, an institutional alternative data vendor.

CAMPAIGN BRIEF:
- Name: ${sanitizeForPrompt(campaign.name)}
- Objective: ${sanitizeForPrompt(focusDescriptions[campaign.focus] || campaign.focus)}
- Description: ${sanitizeForPrompt(campaign.description) || "N/A"}

TARGET PRODUCTS:
${productContext}

ELIGIBLE ACCOUNTS (score ALL):
${accountList}

SCORING FRAMEWORK (0-100 each):
1. PRODUCT_RELEVANCE (30%)
2. TIMING_SIGNAL (20%)
3. RELATIONSHIP_STRENGTH (15%)
4. STRATEGIC_FIT (15%)
5. CONVERSION_LIKELIHOOD (20%)

For each account produce:
- overall_score, evidence_of_fit, product_relevance_rationale, why_now, best_persona, message_angle, recommended_next_step, opportunity_type, product_fit (with coverage_overlap_score, sector_relevance[], supporting_companies[], evidence_summary, product_relevance_score)

Return ONLY valid JSON array sorted by overall_score desc. Top ${Math.min(campaign.max_targets || 25, maxToScore)} accounts.
[{"index":0,"overall_score":85,"scores":{"product_relevance":90,"timing_signal":80,"relationship_strength":75,"strategic_fit":85,"conversion_likelihood":88},"evidence_of_fit":"...","product_relevance_rationale":"...","why_now":"...","best_persona":"...","message_angle":"...","recommended_next_step":"...","opportunity_type":"existing_expansion","product_fit":{"coverage_overlap_score":72,"sector_relevance":["Defense"],"supporting_companies":["Lockheed"],"evidence_summary":"...","product_relevance_score":85}}]`;

  const aiData = await callAI(aiConfig, {
    system: "You are an expert institutional sales strategist. Return only valid JSON arrays. Never use markdown fences.",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    maxTokens: 16000,
  });

  let scoredResults: any[];
  const content = aiData.content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    scoredResults = JSON.parse(content);
  } catch {
    // Attempt truncation recovery
    try {
      const lastComplete = content.lastIndexOf("},");
      if (lastComplete > 0) {
        scoredResults = JSON.parse(content.substring(0, lastComplete + 1) + "]");
      } else {
        const lastObj = content.lastIndexOf("}");
        scoredResults = JSON.parse(content.substring(0, lastObj + 1) + "]");
      }
    } catch {
      return { data: null, error: { message: "Failed to parse scoring results" } };
    }
  }

  // 7. Map results
  const targetRecords = scoredResults
    .filter((r: any) => r.index !== undefined && r.index < toScore.length)
    .map((r: any) => {
      const client = toScore[r.index];
      const cContacts = contacts.filter((ct: any) => ct.client_id === client.id);
      const isExisting = client.relationship_status === "Active Client";
      const aiPF = r.product_fit || {};

      return {
        campaign_id,
        client_id: client.id,
        is_existing_client: isExisting,
        fit_score: Math.round(r.overall_score),
        fit_rationale: { scores: r.scores, evidence_of_fit: r.evidence_of_fit, product_relevance_rationale: r.product_relevance_rationale, why_now: r.why_now, best_persona: r.best_persona, opportunity_type: r.opportunity_type },
        product_fit_analysis: { coverage_overlap_score: aiPF.coverage_overlap_score || 0, sector_relevance: aiPF.sector_relevance || [], supporting_companies: aiPF.supporting_companies || [], evidence_summary: aiPF.evidence_summary || "", product_relevance_score: aiPF.product_relevance_score || 0 },
        recommended_approach: r.recommended_next_step,
        recommended_messaging: r.message_angle,
        target_personas: [{ role: r.best_persona }],
        recommended_contacts: cContacts.slice(0, 3).map((ct: any) => ({ id: ct.id, name: ct.name, title: ct.title, influence: ct.influence_level })),
        status: "not_started",
      };
    });

  // 8. Insert or update
  let insertedCount = 0;
  let updatedCount = 0;

  if (isRescore && targetRecords.length > 0) {
    for (const rec of targetRecords) {
      const existingId = existingTargetMap.get(rec.client_id);
      if (existingId) {
        await sql`
          UPDATE campaign_targets SET
            fit_score = ${rec.fit_score},
            fit_rationale = ${JSON.stringify(rec.fit_rationale)}::jsonb,
            product_fit_analysis = ${JSON.stringify(rec.product_fit_analysis)}::jsonb,
            recommended_approach = ${rec.recommended_approach},
            recommended_messaging = ${rec.recommended_messaging},
            target_personas = ${JSON.stringify(rec.target_personas)}::jsonb,
            recommended_contacts = ${JSON.stringify(rec.recommended_contacts)}::jsonb,
            updated_at = now()
          WHERE id = ${existingId}
        `;
        updatedCount++;
      }
    }
  } else if (targetRecords.length > 0) {
    for (const rec of targetRecords) {
      await sql`
        INSERT INTO campaign_targets (campaign_id, client_id, is_existing_client, fit_score, fit_rationale, product_fit_analysis, recommended_approach, recommended_messaging, target_personas, recommended_contacts, status)
        VALUES (${rec.campaign_id}, ${rec.client_id}, ${rec.is_existing_client}, ${rec.fit_score}, ${JSON.stringify(rec.fit_rationale)}::jsonb, ${JSON.stringify(rec.product_fit_analysis)}::jsonb, ${rec.recommended_approach}, ${rec.recommended_messaging}, ${JSON.stringify(rec.target_personas)}::jsonb, ${JSON.stringify(rec.recommended_contacts)}::jsonb, ${rec.status})
      `;
    }
    insertedCount = targetRecords.length;
  }

  return {
    data: {
      targets_created: insertedCount,
      rescored_count: updatedCount,
      eligible_count: eligible.length,
      scored_count: toScore.length,
    },
  };
}
