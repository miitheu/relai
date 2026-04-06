import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { webSearch } from "../_shared/web-search.ts";
import { searchSECEntities, getCompanyInfo } from "../_shared/sec-search.ts";

const log = createLogger("account-discovery-v2");

const DISCOVERY_STEPS = [
  "analyze_top_clients",
  "sec_sector_search",
  "web_sector_discovery",
  "ai_scoring_ranking",
  "deduplication",
  "store_suggestions",
];

async function updateStep(sb: any, stepId: string, update: Record<string, any>) {
  await sb.from("intelligence_run_steps").update({ ...update, updated_at: new Date().toISOString() }).eq("id", stepId);
}

async function updateRunProgress(sb: any, runId: string, currentStep: string, completedSteps: number) {
  await sb.from("fund_intelligence_runs").update({
    current_step: currentStep,
    completed_steps: completedSteps,
    updated_at: new Date().toISOString(),
  }).eq("id", runId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const auth = await verifyAuth(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const {
      mode = "combined",
      client_id,
      target_sectors,
      target_regions,
      max_suggestions = 20,
      sources = ["ai_lookalike", "sec_edgar", "web_search"],
      discovery_name,
    } = await req.json();

    const enableSEC = sources.includes("sec_edgar");
    const enableWeb = sources.includes("web_search");

    log.info(`Account discovery: mode=${mode}, source_client=${client_id || "none"}`);

    // Create run record
    const { data: run, error: runErr } = await sb.from("fund_intelligence_runs").insert({
      client_id: client_id || null,
      filing_source: "Discovery Agent",
      filing_type: "account_discovery",
      playbook_type: "account_discovery",
      run_status: "processing",
      run_reason: "manual",
      triggered_by: auth.userId,
      generated_by: auth.userId,
      total_steps: DISCOVERY_STEPS.length,
      completed_steps: 0,
      current_step: DISCOVERY_STEPS[0],
    }).select().single();

    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);

    const stepRecords = DISCOVERY_STEPS.map((name, i) => ({
      run_id: run.id,
      step_name: name,
      step_order: i + 1,
      step_status: "pending",
    }));
    const { data: steps } = await sb.from("intelligence_run_steps").insert(stepRecords).select();
    const stepMap: Record<string, string> = {};
    for (const s of (steps || [])) stepMap[s.step_name] = s.id;

    try {
      let completedCount = 0;
      const candidateNames: { name: string; source: string; metadata?: any }[] = [];

      // ═══ STEP 1: Analyze Top Clients ═══
      const analyzeStepId = stepMap["analyze_top_clients"];
      await updateStep(sb, analyzeStepId, { step_status: "running", started_at: new Date().toISOString() });

      // Fetch winning patterns
      const { data: wonOpps } = await sb.from("opportunities")
        .select("value, clients(name, client_type, strategy_focus, headquarters_country, aum)")
        .eq("stage", "Closed Won")
        .order("value", { ascending: false })
        .limit(20);

      const { data: activeClients } = await sb.from("clients")
        .select("name, client_type, strategy_focus, headquarters_country, aum")
        .eq("relationship_status", "Active")
        .limit(30);

      // Build ideal client profile (ICP)
      const allClients = [
        ...(wonOpps || []).map((o: any) => o.clients).filter(Boolean),
        ...(activeClients || []),
      ];

      const typeFreq: Record<string, number> = {};
      const strategyFreq: Record<string, number> = {};
      const countryFreq: Record<string, number> = {};
      for (const c of allClients) {
        if (c.client_type) typeFreq[c.client_type] = (typeFreq[c.client_type] || 0) + 1;
        if (c.strategy_focus) strategyFreq[c.strategy_focus] = (strategyFreq[c.strategy_focus] || 0) + 1;
        if (c.headquarters_country) countryFreq[c.headquarters_country] = (countryFreq[c.headquarters_country] || 0) + 1;
      }

      const topTypes = Object.entries(typeFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      const topStrategies = Object.entries(strategyFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
      const topCountries = Object.entries(countryFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

      const icp = {
        topTypes: target_sectors || topTypes,
        topStrategies,
        topCountries: target_regions || topCountries,
        avgDealSize: wonOpps?.length ? Math.round((wonOpps.reduce((s: number, o: any) => s + Number(o.value || 0), 0)) / wonOpps.length) : 0,
        totalActiveClients: activeClients?.length || 0,
      };

      // If lookalike mode, add source client context
      let sourceClient: any = null;
      if (client_id && (mode === "lookalike" || mode === "combined")) {
        const { data: sc } = await sb.from("clients").select("*").eq("id", client_id).single();
        sourceClient = sc;
      }

      await updateStep(sb, analyzeStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `ICP: ${icp.topTypes.join(", ")} in ${icp.topCountries.join(", ")}. ${allClients.length} clients analyzed.`,
        output_json: icp,
      });
      completedCount++;
      await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);

      // ═══ STEP 2: SEC Sector Search ═══
      const secStepId = stepMap["sec_sector_search"];

      if (!enableSEC) {
        await updateStep(sb, secStepId, { step_status: "completed", completed_at: new Date().toISOString(), output_summary: "Skipped (source not selected)" });
        completedCount++;
        await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);
      } else {
      await updateStep(sb, secStepId, { step_status: "running", started_at: new Date().toISOString() });

      if (mode === "lookalike" || mode === "combined") {
        // Search for similar entities to source client or ICP types
        const searchTerms = sourceClient
          ? [sourceClient.strategy_focus || sourceClient.client_type || "hedge fund"]
          : icp.topTypes.slice(0, 2);

        for (const term of searchTerms) {
          const secResults = await searchSECEntities(term, { forms: "13F-HR", maxResults: 15 });
          for (const r of secResults) {
            candidateNames.push({ name: r.name, source: "sec_edgar", metadata: { cik: r.cik, filingDate: r.filingDate } });
          }
          // Rate limit
          if (searchTerms.length > 1) await new Promise(r => setTimeout(r, 200));
        }
      }

      if (mode === "sector" || mode === "combined") {
        const sectors = target_sectors || icp.topTypes;
        for (const sector of sectors.slice(0, 2)) {
          const secResults = await searchSECEntities(`"${sector}" investment`, { forms: "13F-HR,ADV", maxResults: 15 });
          for (const r of secResults) {
            if (!candidateNames.some(c => c.name.toUpperCase() === r.name.toUpperCase())) {
              candidateNames.push({ name: r.name, source: "sec_edgar", metadata: { cik: r.cik } });
            }
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }

      await updateStep(sb, secStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Found ${candidateNames.length} candidates from SEC EDGAR`,
        output_json: { candidate_count: candidateNames.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);
      } // end enableSEC

      // ═══ STEP 3: Web Sector Discovery ═══
      const webStepId = stepMap["web_sector_discovery"];

      if (!enableWeb) {
        await updateStep(sb, webStepId, { step_status: "completed", completed_at: new Date().toISOString(), output_summary: "Skipped (source not selected)" });
        completedCount++;
        await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);
      } else {
      await updateStep(sb, webStepId, { step_status: "running", started_at: new Date().toISOString() });

      const webQueries: string[] = [];
      const sectors = target_sectors || icp.topTypes;
      const regions = target_regions || icp.topCountries;

      if (mode === "lookalike" && sourceClient) {
        webQueries.push(`"${sourceClient.client_type || "hedge fund"}" firms similar to "${sourceClient.name}" alternative data`);
      }
      if (mode === "sector" || mode === "combined") {
        webQueries.push(`"alternative data" "${sectors[0] || "hedge fund"}" firms ${regions[0] || ""}`);
        if (sectors.length > 1) {
          webQueries.push(`"${sectors[1]}" asset manager quantitative data ${regions[0] || ""}`);
        }
      }

      const webCandidateCountBefore = candidateNames.length;
      for (let i = 0; i < webQueries.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1100));
        try {
          const results = await webSearch(webQueries[i], { count: 10 });
          // Extract company names from search results (AI will do the heavy lifting later)
          for (const r of results.results) {
            candidateNames.push({ name: r.title, source: "web_search", metadata: { url: r.url, description: r.description } });
          }
        } catch {}
      }

      await updateStep(sb, webStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Found ${candidateNames.length - webCandidateCountBefore} web candidates (${candidateNames.length} total)`,
        output_json: { web_candidates: candidateNames.length - webCandidateCountBefore, total: candidateNames.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);
      } // end enableWeb

      // ═══ STEP 4: AI Scoring & Ranking ═══
      const scoreStepId = stepMap["ai_scoring_ranking"];
      await updateStep(sb, scoreStepId, { step_status: "running", started_at: new Date().toISOString() });

      // Fetch existing client names for dedup context
      const { data: existingClients } = await sb.from("clients").select("name, normalized_name").limit(500);
      const existingNames = (existingClients || []).map((c: any) => c.name);

      // Fetch active datasets for product fit context
      const { data: datasets } = await sb.from("datasets").select("name, description").eq("is_active", true);

      const candidateContext = candidateNames.slice(0, 50).map((c, i) =>
        `${i + 1}. ${c.name} [source: ${c.source}]${c.metadata?.cik ? ` (SEC CIK: ${c.metadata.cik})` : ""}${c.metadata?.description ? ` — ${c.metadata.description.slice(0, 100)}` : ""}`
      ).join("\n");

      const aiResponse = await callAIWithRetry(sb, {
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: `You are a sales prospecting analyst for Relai, an alternative data vendor specializing in government contracts, trade flows, and procurement data.
Score and rank potential prospects for the sales team.
IMPORTANT: Only include REAL companies that actually exist. Do not make up company names.
Return valid JSON array only.`,
          },
          {
            role: "user",
            content: `Analyze these candidate companies and return the top ${max_suggestions} best prospects for Relai.

IDEAL CLIENT PROFILE:
- Top client types: ${icp.topTypes.join(", ")}
- Top strategies: ${icp.topStrategies.join(", ")}
- Top regions: ${icp.topCountries.join(", ")}
- Avg deal size: $${icp.avgDealSize.toLocaleString()}
${sourceClient ? `\nSOURCE CLIENT (find similar): ${sourceClient.name} — ${sourceClient.client_type}, ${sourceClient.strategy_focus || "unknown strategy"}, ${sourceClient.headquarters_country || "unknown region"}` : ""}

EXISTING CLIENTS (exclude these):
${existingNames.slice(0, 50).join(", ")}

RELAI DATASETS:
${(datasets || []).map((d: any) => `- ${d.name}: ${d.description || ""}`).join("\n")}

CANDIDATE COMPANIES:
${candidateContext}

Return a JSON array of the top ${max_suggestions} prospects:
[
  {
    "name": "<real company name>",
    "type": "<Hedge Fund|Asset Manager|Bank|Corporate|Other>",
    "country": "<country>",
    "estimated_aum": "<e.g. $5B or Unknown>",
    "similarity_score": <0-100>,
    "product_fit_score": <0-100>,
    "discovery_source": "<sec_edgar|web_search|ai_lookalike>",
    "similarity_reason": "<1 sentence>",
    "product_fit_reason": "<1 sentence>",
    "recommended_approach": "<1 sentence sales tactic>",
    "target_datasets": ["<dataset names>"],
    "sec_cik": "<CIK if available, else null>"
  }
]

Only include companies you are confident actually exist. Score similarity 0-100 (how similar to ICP) and product_fit 0-100 (how likely to buy Relai data).
Respond with ONLY a valid JSON array.`,
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
        userId: auth.userId,
        functionName: "account-discovery-v2",
        response_format: { type: "json_object" },
      });

      const responseText = aiResponse.choices?.[0]?.message?.content || "[]";
      let suggestions: any[];
      try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const parsed = JSON.parse(jsonMatch[1].trim());
        suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.prospects || []);
      } catch {
        suggestions = [];
        log.warn("Failed to parse AI suggestions");
      }

      await updateStep(sb, scoreStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `AI ranked ${suggestions.length} prospects`,
        output_json: { suggestion_count: suggestions.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);

      // ═══ STEP 5: Deduplication ═══
      const dedupStepId = stepMap["deduplication"];
      await updateStep(sb, dedupStepId, { step_status: "running", started_at: new Date().toISOString() });

      const normalizedExisting = new Set((existingClients || []).map((c: any) => (c.normalized_name || c.name || "").toLowerCase().trim()));

      // Check previously dismissed suggestions
      const { data: dismissed } = await sb.from("discovery_suggestions")
        .select("normalized_name")
        .eq("status", "dismissed");
      const dismissedNames = new Set((dismissed || []).map((d: any) => (d.normalized_name || "").toLowerCase()));

      let dedupedCount = 0;
      const finalSuggestions = suggestions.filter((s: any) => {
        const norm = (s.name || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
        if (normalizedExisting.has(norm)) { dedupedCount++; return false; }
        if (dismissedNames.has(norm)) { dedupedCount++; return false; }
        // Fuzzy match: check if any existing name contains or is contained
        for (const existing of normalizedExisting) {
          if (existing.includes(norm) || norm.includes(existing)) { dedupedCount++; return false; }
        }
        return true;
      });

      await updateStep(sb, dedupStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `${finalSuggestions.length} unique suggestions (${dedupedCount} duplicates removed)`,
        output_json: { final_count: finalSuggestions.length, duplicates_removed: dedupedCount },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, DISCOVERY_STEPS[completedCount], completedCount);

      // ═══ STEP 5.5: Strategy Classification (batch AI call) ═══
      const hedgeFundSuggestions = finalSuggestions.filter((s: any) =>
        (s.type || "").toLowerCase().includes("hedge") || (s.type || "").toLowerCase().includes("fund")
      );
      if (hedgeFundSuggestions.length > 0) {
        try {
          const classifyPrompt = `Classify each hedge fund's investment strategy. Use ONLY these categories: Systematic/Quantitative, Fundamental Long/Short, Multi-Strategy, Global Macro, Credit, Event-Driven, Activist, Fixed Income, Commodities, Mixed/Other.

For each fund, provide the classification based on what you know. If unsure, use "Unknown".

Funds to classify:
${hedgeFundSuggestions.slice(0, 30).map((s: any, i: number) =>
  `${i + 1}. ${s.name}${s.country ? ` (${s.country})` : ''}${s.estimated_aum ? ` — AUM: ${s.estimated_aum}` : ''}`
).join("\n")}

Return JSON array: [{"name": "...", "strategy": "...", "detail": "brief 1-sentence reason"}]
No markdown fences.`;

          const { callAI: classifyAI } = await import("../_shared/ai.ts");
          const classifyResult = await classifyAI(sb, {
            model: "claude-sonnet-4-20250514",
            messages: [
              { role: "system", content: "You are a hedge fund industry expert. Classify investment strategies accurately. Return only valid JSON." },
              { role: "user", content: classifyPrompt },
            ],
            temperature: 0.2,
            max_tokens: 2000,
            userId: auth.userId,
            functionName: "account-discovery-v2",
          });

          let classifications: any[] = [];
          try {
            let raw = classifyResult.choices?.[0]?.message?.content || "[]";
            raw = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            classifications = JSON.parse(raw);
          } catch { /* ignore parse errors */ }

          // Apply classifications to suggestions
          for (const c of classifications) {
            const match = finalSuggestions.find((s: any) =>
              s.name.toLowerCase().trim() === (c.name || "").toLowerCase().trim()
            );
            if (match) {
              match.strategy_classification = c.strategy;
              match.strategy_detail = c.detail;
            }
          }
          log.info(`Classified ${classifications.length} fund strategies`);
        } catch (e: any) {
          log.error(`Strategy classification failed: ${e.message}`);
          // Non-fatal — continue without classifications
        }
      }

      // ═══ STEP 6: Store Suggestions ═══
      const storeStepId = stepMap["store_suggestions"];
      await updateStep(sb, storeStepId, { step_status: "running", started_at: new Date().toISOString() });

      const suggestionRows = finalSuggestions.slice(0, max_suggestions).map((s: any) => ({
        run_id: run.id,
        name: s.name,
        normalized_name: (s.name || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " "),
        suggested_type: s.type,
        country: s.country,
        estimated_aum: s.estimated_aum,
        similarity_score: Math.min(100, Math.max(0, s.similarity_score || 0)),
        product_fit_score: Math.min(100, Math.max(0, s.product_fit_score || 0)),
        discovery_source: s.discovery_source || "ai_lookalike",
        similarity_reason: s.similarity_reason,
        product_fit_reason: s.product_fit_reason,
        recommended_approach: s.recommended_approach,
        target_datasets: s.target_datasets || [],
        sec_cik: s.sec_cik || null,
        metadata_json: { mode, source_client_id: client_id || null },
        seed_client_id: client_id || null,
        run_type: mode === 'lookalike' ? 'lookalike' : mode === 'sector' ? 'sector' : 'combined',
        run_params: { mode, client_id: client_id || null, target_sectors: target_sectors || [], target_regions: target_regions || [] },
        discovery_name: discovery_name || null,
        strategy_classification: s.strategy_classification || null,
        strategy_detail: s.strategy_detail || null,
        status: "new",
        created_by: auth.userId,
      }));

      if (suggestionRows.length > 0) {
        await sb.from("discovery_suggestions").insert(suggestionRows);
      }

      await updateStep(sb, storeStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Stored ${suggestionRows.length} suggestions`,
        output_json: { stored_count: suggestionRows.length },
      });
      completedCount++;

      // Mark run complete
      await sb.from("fund_intelligence_runs").update({
        run_status: "completed",
        generated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        completed_steps: completedCount,
        current_step: null,
      }).eq("id", run.id);

      log.info("Discovery completed", { mode, suggestions: suggestionRows.length });

      return jsonResponse({
        success: true,
        run_id: run.id,
        mode,
        suggestions_count: suggestionRows.length,
        suggestions: suggestionRows.map(s => ({ name: s.name, type: s.suggested_type, similarity_score: s.similarity_score, product_fit_score: s.product_fit_score })),
      });

    } catch (processingError: any) {
      const { data: runningSteps } = await sb.from("intelligence_run_steps").select("id").eq("run_id", run.id).eq("step_status", "running");
      for (const s of (runningSteps || [])) {
        await updateStep(sb, s.id, { step_status: "failed", error_message: processingError.message, completed_at: new Date().toISOString() });
      }
      await sb.from("fund_intelligence_runs").update({ run_status: "failed", error_message: processingError.message }).eq("id", run.id);
      log.error("Processing error", { detail: processingError.message, run_id: run.id });
      return errorResponse("An internal error occurred. Please try again.");
    }

  } catch (error: any) {
    log.error("Discovery error", { detail: error.message });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
