import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { AI_NOT_CONFIGURED_ERROR, safeParseJSON } from "./utils";

const SEC_HEADERS = { "User-Agent": "Relai CRM support@relai.com", Accept: "application/json" };

const DISCOVERY_STEPS = ["analyze_top_clients", "sec_sector_search", "web_sector_discovery", "ai_scoring_ranking", "deduplication", "store_suggestions"];

async function updateStep(sql: any, stepId: string, update: Record<string, any>) {
  const json = update.output_json ? JSON.stringify(update.output_json) : null;
  await sql`UPDATE intelligence_run_steps SET step_status = ${update.step_status}, output_summary = COALESCE(${update.output_summary || null}, output_summary), output_json = COALESCE(${json}::jsonb, output_json), started_at = COALESCE(${update.started_at || null}::timestamptz, started_at), completed_at = COALESCE(${update.completed_at || null}::timestamptz, completed_at), updated_at = now() WHERE id = ${stepId}`;
}
async function updateRunProgress(sql: any, runId: string, currentStep: string, completedSteps: number) {
  await sql`UPDATE fund_intelligence_runs SET current_step = ${currentStep}, completed_steps = ${completedSteps}, updated_at = now() WHERE id = ${runId}`;
}

async function searchSECEntities(term: string, maxResults = 15): Promise<{ name: string; cik: string; filingDate?: string }[]> {
  const results: any[] = [];
  const clean = term.replace(/[^a-zA-Z0-9\s"]/g, "").trim();
  if (!clean) return results;
  try {
    const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(clean)}&forms=13F-HR&from=0&size=${maxResults}`, { headers: SEC_HEADERS });
    if (r.ok) {
      const d = await r.json();
      for (const h of (d.hits?.hits || [])) {
        const s = h._source || {};
        const n = s.display_names?.[0] || s.entity_name || "";
        const c = s.ciks?.[0] || "";
        if (c && n && !results.some((x: any) => x.cik === c)) results.push({ name: n, cik: c, filingDate: s.file_date });
      }
    }
  } catch {}
  return results;
}

export default async function accountDiscovery(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { mode = "combined", client_id, target_sectors, target_regions, max_suggestions = 20, sources = ["ai_lookalike", "sec_edgar"], discovery_name } = body;
  const enableSEC = sources.includes("sec_edgar");

  // Create run record
  const runRows = await sql`
    INSERT INTO fund_intelligence_runs (client_id, filing_source, filing_type, playbook_type, run_status, run_reason, triggered_by, generated_by, total_steps, completed_steps, current_step)
    VALUES (${client_id || null}, 'Discovery Agent', 'account_discovery', 'account_discovery', 'processing', 'manual', ${userId}, ${userId}, ${DISCOVERY_STEPS.length}, 0, ${DISCOVERY_STEPS[0]})
    RETURNING *
  `;
  const run = runRows[0];

  const stepMap: Record<string, string> = {};
  for (let i = 0; i < DISCOVERY_STEPS.length; i++) {
    const rows = await sql`INSERT INTO intelligence_run_steps (run_id, step_name, step_order, step_status) VALUES (${run.id}, ${DISCOVERY_STEPS[i]}, ${i + 1}, 'pending') RETURNING id`;
    stepMap[DISCOVERY_STEPS[i]] = rows[0].id;
  }

  try {
    let completedCount = 0;
    const candidateNames: { name: string; source: string; metadata?: any }[] = [];

    // Step 1: Analyze ICP
    await updateStep(sql, stepMap["analyze_top_clients"], { step_status: "running", started_at: new Date().toISOString() });
    const wonOpps = await sql`SELECT value, client_id FROM opportunities WHERE stage = 'Closed Won' ORDER BY value DESC LIMIT 20`;
    const activeClients = await sql`SELECT name, client_type, strategy_focus, headquarters_country, aum FROM clients WHERE relationship_status = 'Active' LIMIT 30`;

    const typeFreq: Record<string, number> = {};
    const strategyFreq: Record<string, number> = {};
    const countryFreq: Record<string, number> = {};
    for (const c of activeClients) {
      if (c.client_type) typeFreq[c.client_type] = (typeFreq[c.client_type] || 0) + 1;
      if (c.strategy_focus) strategyFreq[c.strategy_focus] = (strategyFreq[c.strategy_focus] || 0) + 1;
      if (c.headquarters_country) countryFreq[c.headquarters_country] = (countryFreq[c.headquarters_country] || 0) + 1;
    }

    const topTypes = target_sectors || Object.entries(typeFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const topStrategies = Object.entries(strategyFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const topCountries = target_regions || Object.entries(countryFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    const icp = { topTypes, topStrategies, topCountries, avgDealSize: 0, totalActiveClients: activeClients.length };

    let sourceClient: any = null;
    if (client_id && (mode === "lookalike" || mode === "combined")) {
      const scRows = await sql`SELECT * FROM clients WHERE id = ${client_id} LIMIT 1`;
      sourceClient = scRows[0];
    }

    await updateStep(sql, stepMap["analyze_top_clients"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `ICP: ${icp.topTypes.join(", ")}`, output_json: icp });
    completedCount++;
    await updateRunProgress(sql, run.id, DISCOVERY_STEPS[completedCount], completedCount);

    // Step 2: SEC search
    if (!enableSEC) {
      await updateStep(sql, stepMap["sec_sector_search"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: "Skipped" });
    } else {
      await updateStep(sql, stepMap["sec_sector_search"], { step_status: "running", started_at: new Date().toISOString() });
      const searchTerms = sourceClient ? [sourceClient.strategy_focus || sourceClient.client_type || "hedge fund"] : icp.topTypes.slice(0, 2);
      for (const term of searchTerms) {
        const results = await searchSECEntities(term);
        for (const r of results) candidateNames.push({ name: r.name, source: "sec_edgar", metadata: { cik: r.cik } });
        if (searchTerms.length > 1) await new Promise(r => setTimeout(r, 200));
      }
      await updateStep(sql, stepMap["sec_sector_search"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Found ${candidateNames.length} SEC candidates` });
    }
    completedCount++;
    await updateRunProgress(sql, run.id, DISCOVERY_STEPS[completedCount], completedCount);

    // Step 3: Web discovery (skipped in self-hosted — no Brave API)
    await updateStep(sql, stepMap["web_sector_discovery"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: "Skipped in self-hosted mode" });
    completedCount++;
    await updateRunProgress(sql, run.id, DISCOVERY_STEPS[completedCount], completedCount);

    // Step 4: AI scoring
    await updateStep(sql, stepMap["ai_scoring_ranking"], { step_status: "running", started_at: new Date().toISOString() });
    const existingClients = await sql`SELECT name, normalized_name FROM clients LIMIT 500`;
    const existingNames = existingClients.map((c: any) => c.name);
    const datasets = await sql`SELECT name, description FROM datasets WHERE is_active = true`;

    const candidateContext = candidateNames.slice(0, 50).map((c, i) => `${i + 1}. ${c.name} [source: ${c.source}]${c.metadata?.cik ? ` (CIK: ${c.metadata.cik})` : ""}`).join("\n");

    const aiResponse = await callAI(aiConfig, {
      system: "You are a sales prospecting analyst for Relai, an alternative data vendor. Only include REAL companies. Return valid JSON array only.",
      messages: [{ role: "user", content: `Analyze candidates and return top ${max_suggestions} best prospects.

IDEAL CLIENT PROFILE:
- Types: ${icp.topTypes.join(", ")}
- Strategies: ${icp.topStrategies.join(", ")}
- Regions: ${icp.topCountries.join(", ")}
${sourceClient ? `\nSOURCE CLIENT: ${sourceClient.name} — ${sourceClient.client_type}` : ""}

EXISTING CLIENTS (exclude):
${existingNames.slice(0, 50).join(", ")}

RELAI DATASETS:
${datasets.map((d: any) => `- ${d.name}: ${d.description || ""}`).join("\n")}

CANDIDATES:
${candidateContext}

Return JSON array:
[{"name":"...","type":"Hedge Fund|Asset Manager|Bank|Corporate|Other","country":"...","estimated_aum":"...","similarity_score":80,"product_fit_score":75,"discovery_source":"sec_edgar|ai_lookalike","similarity_reason":"...","product_fit_reason":"...","recommended_approach":"...","target_datasets":["..."],"sec_cik":"..."}]` }],
      maxTokens: 4000,
      temperature: 0.3,
    });

    let suggestions: any[];
    try {
      const parsed = safeParseJSON(aiResponse.content, []);
      suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.prospects || []);
    } catch { suggestions = []; }

    await updateStep(sql, stepMap["ai_scoring_ranking"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `${suggestions.length} prospects ranked` });
    completedCount++;
    await updateRunProgress(sql, run.id, DISCOVERY_STEPS[completedCount], completedCount);

    // Step 5: Dedup
    await updateStep(sql, stepMap["deduplication"], { step_status: "running", started_at: new Date().toISOString() });
    const normalizedExisting = new Set(existingClients.map((c: any) => (c.normalized_name || c.name || "").toLowerCase().trim()));
    const dismissed = await sql`SELECT normalized_name FROM discovery_suggestions WHERE status = 'dismissed'`;
    const dismissedNames = new Set(dismissed.map((d: any) => (d.normalized_name || "").toLowerCase()));

    let dedupedCount = 0;
    const finalSuggestions = suggestions.filter((s: any) => {
      const norm = (s.name || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
      if (normalizedExisting.has(norm) || dismissedNames.has(norm)) { dedupedCount++; return false; }
      for (const existing of normalizedExisting) {
        if (existing.includes(norm) || norm.includes(existing)) { dedupedCount++; return false; }
      }
      return true;
    });

    await updateStep(sql, stepMap["deduplication"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `${finalSuggestions.length} unique (${dedupedCount} deduped)` });
    completedCount++;
    await updateRunProgress(sql, run.id, DISCOVERY_STEPS[completedCount], completedCount);

    // Step 6: Store
    await updateStep(sql, stepMap["store_suggestions"], { step_status: "running", started_at: new Date().toISOString() });
    const stored = finalSuggestions.slice(0, max_suggestions);
    for (const s of stored) {
      await sql`
        INSERT INTO discovery_suggestions (run_id, name, normalized_name, suggested_type, country, estimated_aum, similarity_score, product_fit_score, discovery_source, similarity_reason, product_fit_reason, recommended_approach, target_datasets, sec_cik, metadata_json, seed_client_id, run_type, run_params, discovery_name, status, created_by)
        VALUES (${run.id}, ${s.name}, ${(s.name || "").toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ")}, ${s.type}, ${s.country}, ${s.estimated_aum}, ${Math.min(100, Math.max(0, s.similarity_score || 0))}, ${Math.min(100, Math.max(0, s.product_fit_score || 0))}, ${s.discovery_source || "ai_lookalike"}, ${s.similarity_reason}, ${s.product_fit_reason}, ${s.recommended_approach}, ${JSON.stringify(s.target_datasets || [])}::jsonb, ${s.sec_cik || null}, ${JSON.stringify({ mode, source_client_id: client_id || null })}::jsonb, ${client_id || null}, ${mode === "lookalike" ? "lookalike" : mode === "sector" ? "sector" : "combined"}, ${JSON.stringify({ mode, client_id: client_id || null, target_sectors: target_sectors || [], target_regions: target_regions || [] })}::jsonb, ${discovery_name || null}, 'new', ${userId})
      `;
    }

    await updateStep(sql, stepMap["store_suggestions"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Stored ${stored.length}` });
    completedCount++;

    await sql`UPDATE fund_intelligence_runs SET run_status = 'completed', generated_at = now(), completed_at = now(), completed_steps = ${completedCount}, current_step = null WHERE id = ${run.id}`;

    return {
      data: {
        success: true,
        run_id: run.id,
        mode,
        suggestions_count: stored.length,
        suggestions: stored.map((s: any) => ({ name: s.name, type: s.type, similarity_score: s.similarity_score, product_fit_score: s.product_fit_score })),
      },
    };
  } catch (e: unknown) {
    const runningSteps = await sql`SELECT id FROM intelligence_run_steps WHERE run_id = ${run.id} AND step_status = 'running'`;
    for (const s of runningSteps) await updateStep(sql, s.id, { step_status: "failed", error_message: e instanceof Error ? e.message : "Unknown", completed_at: new Date().toISOString() });
    await sql`UPDATE fund_intelligence_runs SET run_status = 'failed', error_message = ${e instanceof Error ? e.message : "Unknown"} WHERE id = ${run.id}`;
    return { data: null, error: { message: "An internal error occurred. Please try again." } };
  }
}
