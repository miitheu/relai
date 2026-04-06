import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { sanitizeForPrompt } from "../_shared/sanitize.ts";

const logger = createLogger("campaign-scoring");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const { campaign_id, rescore } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");
    const isRescore = rescore === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. Load campaign
    const { data: campaign, error: cErr } = await sb
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    // 2. Load target products with full metadata
    let products: any[] = [];
    let productContext = "All Relai products";
    if (campaign.target_product_ids?.length > 0) {
      const { data: prods } = await sb
        .from("datasets")
        .select("id, name, description, coverage, example_use_cases")
        .in("id", campaign.target_product_ids);
      products = prods || [];
      productContext = products
        .map((p: any) => `• ${p.name}: ${p.description || "N/A"}. Coverage: ${p.coverage || "N/A"}. Use cases: ${p.example_use_cases || "N/A"}`)
        .join("\n");
    }

    // 3. Load eligible clients
    let clientQuery = sb
      .from("clients")
      .select("id, name, client_type, relationship_status, headquarters_country, aum, strategy_focus, notes");

    const types = campaign.target_account_types || [];
    if (types.length > 0) clientQuery = clientQuery.in("client_type", types);

    const geos = campaign.target_geographies || [];
    const { data: allClients = [] } = await clientQuery;

    let eligible = (allClients || []).filter((c: any) => {
      if (!campaign.include_existing_clients && c.relationship_status === "Active Client") return false;
      if (!campaign.include_prospects && c.relationship_status === "Prospect") return false;
      if (geos.length > 0 && c.headquarters_country && !geos.includes(c.headquarters_country)) return false;
      return true;
    });

    // 4. Handle rescore vs new scoring
    const { data: existingTargets } = await sb
      .from("campaign_targets")
      .select("id, client_id")
      .eq("campaign_id", campaign_id);
    const existingIds = new Set((existingTargets || []).map((t: any) => t.client_id).filter(Boolean));
    const existingTargetMap = new Map((existingTargets || []).map((t: any) => [t.client_id, t.id]));

    if (isRescore && existingTargets && existingTargets.length > 0) {
      // Re-score mode: score existing targets with updated weights
      const rescoreClients = (allClients || []).filter((c: any) => existingIds.has(c.id));
      if (rescoreClients.length === 0) {
        return jsonResponse({ targets: [], message: "No existing targets to re-score" });
      }
      eligible = rescoreClients;
    } else {
      // New scoring mode: exclude existing targets
      eligible = eligible.filter((c: any) => !existingIds.has(c.id));
    }

    if (eligible.length === 0) {
      return jsonResponse({ targets: [], message: "No eligible accounts found" });
    }

    const maxToScore = Math.min(eligible.length, 100);
    const toScore = eligible.slice(0, maxToScore);
    const clientIds = toScore.map((c: any) => c.id);

    // 5. COMPANY INTELLIGENCE LAYER — load per-client intelligence data
    // Load fund intelligence results (13F holdings analysis) + effective exposure
    const [
      fundRunsRes, fundResultsRes,
      oppsRes, delivRes, contactsRes, signalsRes, effectiveExposureRes
    ] = await Promise.all([
      sb.from("fund_intelligence_runs").select("id, client_id, run_status, filing_type, filing_date, playbook_type")
        .in("client_id", clientIds).eq("run_status", "completed").order("created_at", { ascending: false }),
      sb.from("fund_intelligence_results").select("client_id, run_id, strategy_summary, sector_exposure_summary, portfolio_theme_summary, relevant_datasets_json, confidence_score, suggested_messaging, recommended_approach")
        .in("client_id", clientIds).order("created_at", { ascending: false }),
      sb.from("opportunities").select("id, client_id, stage, value, dataset_id, name").in("client_id", clientIds),
      sb.from("deliveries").select("id, client_id, dataset_id, delivery_type, status").in("client_id", clientIds),
      sb.from("contacts").select("id, client_id, name, title, influence_level, relationship_strength").in("client_id", clientIds),
      sb.from("research_signals").select("id, client_id, topic, strength").in("client_id", clientIds),
      // Load effective exposure (look-through ETF weights) for all clients
      sb.from("fund_effective_exposure")
        .select("fund_id, direct_weight_pct, implied_etf_weight_pct, total_weight_pct, security:security_id(ticker, issuer_name, is_etf)")
        .in("fund_id", clientIds)
        .order("total_weight_pct", { ascending: false })
        .limit(500),
    ]);

    const fundRuns = fundRunsRes.data || [];
    const fundResults = fundResultsRes.data || [];
    const opps = oppsRes.data || [];
    const deliveries = delivRes.data || [];
    const contacts = contactsRes.data || [];
    const signals = signalsRes.data || [];
    const effectiveExposure = effectiveExposureRes.data || [];

    // Load holdings for completed fund runs
    const completedRunIds = fundRuns.map((r: any) => r.id);
    let holdings: any[] = [];
    if (completedRunIds.length > 0) {
      const { data: h } = await sb
        .from("fund_holdings_snapshot")
        .select("run_id, issuer_name, ticker, sector, portfolio_weight, position_value, relevance_flags_json")
        .in("run_id", completedRunIds.slice(0, 50))
        .order("portfolio_weight", { ascending: false });
      holdings = h || [];
    }

    // Map runs to clients
    const clientRunMap: Record<string, string> = {};
    for (const r of fundRuns) {
      if (!clientRunMap[r.client_id]) clientRunMap[r.client_id] = r.id;
    }

    // 6. BUILD COMPANY INTELLIGENCE CONTEXT per client
    const intelligenceContext: Record<string, string> = {};
    const productFitData: Record<string, any> = {};

    for (const c of toScore) {
      const parts: string[] = [];
      const fitAnalysis: any = {
        coverage_overlap_score: 0,
        sector_relevance: [],
        supporting_companies: [],
        evidence_summary: "",
        product_relevance_score: 0,
      };

      // --- Fund Intelligence (13F Holdings) ---
      const runId = clientRunMap[c.id];
      const result = fundResults.find((r: any) => r.client_id === c.id);

      if (result) {
        parts.push(`INTELLIGENCE AVAILABLE:`);
        if (result.strategy_summary) parts.push(`Strategy: ${result.strategy_summary}`);
        if (result.sector_exposure_summary) parts.push(`Sector Exposure: ${result.sector_exposure_summary}`);
        if (result.portfolio_theme_summary) parts.push(`Portfolio Themes: ${result.portfolio_theme_summary}`);

        const relevantDs = result.relevant_datasets_json || [];
        if (relevantDs.length > 0) {
          parts.push(`Previously identified relevant products: ${relevantDs.map((d: any) => d.name || d.dataset_name || d).join(", ")}`);
        }
      }

      // --- Effective Exposure (look-through ETF weights) — PRIMARY evidence source ---
      const clientExposure = effectiveExposure.filter((e: any) => e.fund_id === c.id);
      if (clientExposure.length > 0) {
        const withImplied = clientExposure.filter((e: any) => (e.implied_etf_weight_pct || 0) > 0);
        const sectors = new Set<string>();
        const exposureCompanies: string[] = [];

        parts.push(`EFFECTIVE EXPOSURE (look-through, includes ETF constituents):`);
        parts.push(`Total positions: ${clientExposure.length}, ETF-implied: ${withImplied.length}`);

        const topExposure = clientExposure.slice(0, 15);
        for (const e of topExposure) {
          const sec = e.security as any;
          if (sec?.issuer_name) exposureCompanies.push(sec.issuer_name);
          const total = Number(e.total_weight_pct || 0).toFixed(2);
          const direct = Number(e.direct_weight_pct || 0).toFixed(2);
          const implied = Number(e.implied_etf_weight_pct || 0).toFixed(2);
          parts.push(`  ${sec?.issuer_name || "?"} (${sec?.ticker || "N/A"}): ${total}% total [${direct}% direct + ${implied}% ETF]`);
        }

        fitAnalysis.sector_relevance = Array.from(sectors).slice(0, 10);
        fitAnalysis.supporting_companies = exposureCompanies.slice(0, 10).map(name => ({ name }));
        fitAnalysis.coverage_overlap_score = Math.min(100, Math.round((withImplied.length / Math.max(clientExposure.length, 1)) * 100) + 10);
      }

      if (runId) {
        const clientHoldings = holdings.filter((h: any) => h.run_id === runId);
        // Only use raw holdings if no effective exposure data
        if (clientHoldings.length > 0 && clientExposure.length === 0) {
          const sectors = new Set<string>();
          const companiesInPortfolio: string[] = [];
          const relevantHoldings: any[] = [];

          for (const h of clientHoldings) {
            if (h.sector) sectors.add(h.sector);
            companiesInPortfolio.push(h.issuer_name);
            const flags = h.relevance_flags_json || [];
            if (flags.length > 0) {
              relevantHoldings.push({
                name: h.issuer_name, ticker: h.ticker, sector: h.sector,
                weight: h.portfolio_weight, flags,
              });
            }
          }

          fitAnalysis.sector_relevance = Array.from(sectors).slice(0, 10);
          fitAnalysis.supporting_companies = relevantHoldings.slice(0, 10).map((h: any) => ({
            name: h.name, ticker: h.ticker, sector: h.sector, portfolio_weight: h.weight,
          }));
          const overlapScore = clientHoldings.length > 0
            ? Math.round((relevantHoldings.length / clientHoldings.length) * 100)
            : 0;
          fitAnalysis.coverage_overlap_score = overlapScore;

          parts.push(`13F PORTFOLIO (raw, no look-through):`);
          parts.push(`Total holdings: ${clientHoldings.length}, Relevant: ${relevantHoldings.length} (${overlapScore}% overlap)`);
          parts.push(`Sectors: ${Array.from(sectors).slice(0, 8).join(", ")}`);
          if (relevantHoldings.length > 0) {
            parts.push(`Key holdings: ${relevantHoldings.slice(0, 5).map((h: any) => `${h.name} (${h.ticker || "N/A"}, ${(h.weight * 100).toFixed(1)}%)`).join("; ")}`);
          }
        }
      }

      // --- CRM Engagement Data (secondary signals, NOT primary evidence) ---
      const cOpps = opps.filter((o: any) => o.client_id === c.id);
      const cDel = deliveries.filter((d: any) => d.client_id === c.id);
      const cSignals = signals.filter((s: any) => s.client_id === c.id);

      if (cOpps.length > 0 || cDel.length > 0 || cSignals.length > 0) {
        parts.push(`CRM ENGAGEMENT (for timing/relationship signals only):`);
        if (cOpps.length > 0) {
          const activeOpps = cOpps.filter((o: any) => !["Closed Won", "Closed Lost"].includes(o.stage));
          const wonOpps = cOpps.filter((o: any) => o.stage === "Closed Won");
          parts.push(`Opportunities: ${cOpps.length} total (${activeOpps.length} active, ${wonOpps.length} won)`);
        }
        if (cDel.length > 0) {
          const trials = cDel.filter((d: any) => d.delivery_type?.toLowerCase() === "trial");
          parts.push(`Deliveries: ${cDel.length} (${trials.length} trials)`);
        }
        if (cSignals.length > 0) {
          const highSignals = cSignals.filter((s: any) => s.strength === "High");
          parts.push(`Research signals: ${cSignals.length} (${highSignals.length} high-strength)`);
        }
      }

      intelligenceContext[c.id] = parts.length > 0 ? parts.join("\n") : "No company intelligence available. Score based on firmographic fit only.";
      productFitData[c.id] = fitAnalysis;
    }

    // 7. Build AI prompt with intelligence-first pipeline
    const accountList = toScore.map((c: any, i: number) =>
      `[${i}] ${sanitizeForPrompt(c.name)} | Type: ${sanitizeForPrompt(c.client_type)} | Status: ${sanitizeForPrompt(c.relationship_status)} | Country: ${sanitizeForPrompt(c.headquarters_country) || "?"} | AUM: ${c.aum || "?"} | Strategy: ${sanitizeForPrompt(c.strategy_focus) || "?"}
COMPANY INTELLIGENCE:
${intelligenceContext[c.id]}`
    ).join("\n---\n");

    const focusDescriptions: Record<string, string> = {
      upsell: "Expand product usage with existing paying clients who already license other Relai products",
      cross_sell: "Introduce complementary products to accounts that use related but different datasets",
      new_logo: "Acquire net-new accounts that have never purchased from Relai",
      reactivation: "Re-engage dormant or lapsed accounts that previously evaluated or used products",
      renewal_expansion: "Increase renewal value with existing clients coming up for contract renewal",
      partnership: "Identify potential data distribution or technology partnership targets",
    };

    const prompt = `You are a senior sales strategist for Relai, an institutional alternative data vendor selling to hedge funds, asset managers, banks, and corporates.

CRITICAL INSTRUCTION: Your scoring and messaging must be grounded in COMPANY INTELLIGENCE and PRODUCT FIT EVIDENCE — NOT in contact information. Contacts are delivery channels, not evidence of fit.

THE CORRECT REASONING PIPELINE:
1. Analyze company intelligence (portfolio holdings, strategy, sector exposure)
2. Assess product relevance based on overlap between the product's coverage and the company's interests
3. Identify concrete evidence of fit (specific companies, sectors, themes in their portfolio that the product covers)
4. Only then identify the best persona to receive the message
5. Generate messaging that references specific supporting evidence (companies, sectors, use cases)

CAMPAIGN BRIEF:
- Name: ${sanitizeForPrompt(campaign.name)}
- Objective: ${sanitizeForPrompt(focusDescriptions[campaign.focus] || campaign.focus)}
- Description: ${sanitizeForPrompt(campaign.description) || "N/A"}

TARGET PRODUCTS:
${productContext}

ELIGIBLE ACCOUNTS (score ALL of these):
${accountList}

SCORING FRAMEWORK — evaluate each account on these dimensions (0-100 each):
1. PRODUCT_RELEVANCE (30%): How well does the product match this account's needs? For funds: what % of their portfolio is covered by this dataset? For corporates: does their industry/supply chain align?
2. TIMING_SIGNAL (20%): Is there evidence suggesting NOW is a good time? (active opps, recent signals, trial activity, upcoming renewals)
3. RELATIONSHIP_STRENGTH (15%): Quality of existing relationship and engagement history
4. STRATEGIC_FIT (15%): Does this account align with Relai's ideal customer profile for this campaign objective?
5. CONVERSION_LIKELIHOOD (20%): Overall probability of converting this account

For each account, produce:
- overall_score: weighted average of the 5 dimensions
- evidence_of_fit: 2-3 sentences grounded in SPECIFIC company intelligence (holdings, sectors, themes). NOT generic.
- product_relevance_rationale: Why THIS product matters, referencing specific portfolio companies or sectors the product covers
- why_now: Concrete timing signal or "No specific timing signal"
- best_persona: Job title/role best positioned to evaluate this product
- message_angle: A specific angle referencing supporting companies/sectors from their portfolio. NOT generic outbound copy.
- recommended_next_step: Concrete first action
- opportunity_type: "existing_expansion" or "new_opportunity"
- product_fit: Object with: coverage_overlap_score (0-100), sector_relevance (string[]), supporting_companies (string[] of company names from their portfolio that the product covers), evidence_summary (1-2 sentence evidence chain), product_relevance_score (0-100)

Return ONLY valid JSON array, no markdown fences. Sort by overall_score descending. Return top ${Math.min(campaign.max_targets || 25, maxToScore)} accounts.
CRITICAL: Always close the JSON array with ]. If running out of space, return fewer accounts but ensure valid JSON.
[{"index":0,"overall_score":85,"scores":{"product_relevance":90,"timing_signal":80,"relationship_strength":75,"strategic_fit":85,"conversion_likelihood":88},"evidence_of_fit":"...","product_relevance_rationale":"...","why_now":"...","best_persona":"...","message_angle":"...","recommended_next_step":"...","opportunity_type":"existing_expansion","product_fit":{"coverage_overlap_score":72,"sector_relevance":["Defense","Aerospace"],"supporting_companies":["Lockheed Martin","Raytheon"],"evidence_summary":"...","product_relevance_score":85}}]`;

    const { callAI } = await import("../_shared/ai.ts");
    const aiData = await callAI(sb, {
      model: "claude-sonnet-4-20250514",
      messages: [
        {
          role: "system",
          content: "You are an expert institutional sales strategist. Your analysis is grounded in company intelligence and product fit evidence, never in contact data. You produce rigorous, evidence-based account scoring. Return only valid JSON arrays. Never use markdown fences.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 16000,
      userId: auth.userId,
      functionName: "campaign-scoring",
    });
    let content = aiData.choices?.[0]?.message?.content || "[]";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let scoredResults: any[];
    try {
      scoredResults = JSON.parse(content);
    } catch {
      logger.warn("Initial parse failed, attempting truncation recovery...");
      try {
        const lastCompleteObj = content.lastIndexOf('},');
        if (lastCompleteObj > 0) {
          const truncated = content.substring(0, lastCompleteObj + 1) + ']';
          scoredResults = JSON.parse(truncated);
          logger.info(`Recovered ${scoredResults.length} results from truncated response`);
        } else {
          const lastObj = content.lastIndexOf('}');
          if (lastObj > 0) {
            const truncated = content.substring(0, lastObj + 1) + ']';
            scoredResults = JSON.parse(truncated);
          } else {
            throw new Error("No recoverable JSON");
          }
        }
      } catch (e2: any) {
        logger.error("Failed to parse AI response", { snippet: content.slice(0, 500) });
        throw new Error("Failed to parse scoring results");
      }
    }

    // 8. Map results and merge with pre-computed product fit data
    const targetRecords = scoredResults
      .filter((r: any) => r.index !== undefined && r.index < toScore.length)
      .map((r: any) => {
        const client = toScore[r.index];
        const cContacts = contacts.filter((ct: any) => ct.client_id === client.id);
        const isExisting = client.relationship_status === "Active Client";

        // Merge AI-generated product_fit with pre-computed holdings data
        const preComputed = productFitData[client.id] || {};
        const aiProductFit = r.product_fit || {};
        const mergedFit = {
          coverage_overlap_score: preComputed.coverage_overlap_score || aiProductFit.coverage_overlap_score || 0,
          sector_relevance: aiProductFit.sector_relevance?.length > 0 ? aiProductFit.sector_relevance : (preComputed.sector_relevance || []),
          supporting_companies: aiProductFit.supporting_companies?.length > 0 ? aiProductFit.supporting_companies : (preComputed.supporting_companies?.map((sc: any) => sc.name || sc) || []),
          evidence_summary: aiProductFit.evidence_summary || preComputed.evidence_summary || "",
          product_relevance_score: aiProductFit.product_relevance_score || r.scores?.product_relevance || 0,
        };

        return {
          campaign_id,
          client_id: client.id,
          is_existing_client: isExisting,
          fit_score: Math.round(r.overall_score),
          fit_rationale: {
            scores: r.scores,
            evidence_of_fit: r.evidence_of_fit,
            product_relevance_rationale: r.product_relevance_rationale,
            why_now: r.why_now,
            best_persona: r.best_persona,
            opportunity_type: r.opportunity_type,
          },
          product_fit_analysis: mergedFit,
          recommended_approach: r.recommended_next_step,
          recommended_messaging: r.message_angle,
          target_personas: [{ role: r.best_persona }],
          recommended_contacts: cContacts.slice(0, 3).map((ct: any) => ({
            id: ct.id,
            name: ct.name,
            title: ct.title,
            influence: ct.influence_level,
          })),
          status: "not_started",
        };
      });

    // 9. Insert or update targets
    let insertedCount = 0;
    let updatedCount = 0;

    if (isRescore && targetRecords.length > 0) {
      // Update existing targets with new scores
      for (const rec of targetRecords) {
        const existingId = existingTargetMap.get(rec.client_id);
        if (existingId) {
          const { error: updateErr } = await sb
            .from("campaign_targets")
            .update({
              fit_score: rec.fit_score,
              fit_rationale: rec.fit_rationale,
              product_fit_analysis: rec.product_fit_analysis,
              recommended_approach: rec.recommended_approach,
              recommended_messaging: rec.recommended_messaging,
              target_personas: rec.target_personas,
              recommended_contacts: rec.recommended_contacts,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingId);
          if (!updateErr) updatedCount++;
        }
      }
    } else if (targetRecords.length > 0) {
      const { error: insertErr } = await sb
        .from("campaign_targets")
        .insert(targetRecords);
      if (insertErr) {
        logger.error("Insert error", { error: insertErr.message });
        throw new Error("Failed to save targets: " + insertErr.message);
      }
      insertedCount = targetRecords.length;
    }

    return jsonResponse({
      targets_created: insertedCount,
      rescored_count: updatedCount,
      eligible_count: eligible.length,
      scored_count: toScore.length,
    });
  } catch (e: any) {
    logger.error("campaign-scoring error", { error: e.message, stack: e.stack });
    return errorResponse("An internal error occurred", 400);
  }
});
