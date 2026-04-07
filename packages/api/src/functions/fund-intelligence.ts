import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { AI_NOT_CONFIGURED_ERROR } from "./utils";

const SEC_HEADERS = { "User-Agent": "Relai CRM support@relai.com", Accept: "application/json" };

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// Step helpers
async function updateStep(sql: any, stepId: string, update: Record<string, any>) {
  const json = update.output_json ? JSON.stringify(update.output_json) : null;
  const summary = update.output_summary || null;
  const status = update.step_status;
  const startedAt = update.started_at || null;
  const completedAt = update.completed_at || null;
  const errorMessage = update.error_message || null;
  await sql`UPDATE intelligence_run_steps SET step_status = ${status}, output_summary = COALESCE(${summary}, output_summary), output_json = COALESCE(${json}::jsonb, output_json), started_at = COALESCE(${startedAt}::timestamptz, started_at), completed_at = COALESCE(${completedAt}::timestamptz, completed_at), error_message = COALESCE(${errorMessage}, error_message), updated_at = now() WHERE id = ${stepId}`;
}

async function updateRunProgress(sql: any, runId: string, currentStep: string, completedSteps: number) {
  await sql`UPDATE fund_intelligence_runs SET current_step = ${currentStep}, completed_steps = ${completedSteps}, updated_at = now() WHERE id = ${runId}`;
}

const JSON_OUTPUT_SCHEMA = `{
  "strategy_summary": "2-3 sentence summary",
  "sector_exposure_summary": "Key sector concentrations",
  "portfolio_theme_summary": "Major themes identified",
  "relevant_datasets": [{"dataset_name":"name","dataset_id":null,"relevance_score":85,"reason":"...","supporting_holdings":["Company A"]}],
  "recommended_approach": "How to position Relai",
  "suggested_target_personas": [{"title":"e.g. PM","reason":"Why interested"}],
  "suggested_messaging": "Draft outreach angle",
  "suggested_engagement_plan": [{"step":1,"action":"...","description":"...","timing":"Week 1"}],
  "confidence_score": 75
}`;

function getPlaybookConfig(clientType: string, hasSecMappings: boolean) {
  const ct = (clientType || "").toLowerCase();
  const isFund = hasSecMappings || ct.includes("hedge fund") || ct.includes("asset manager") || ct.includes("investment") || ct.includes("fund");
  return {
    usesSEC: isFund,
    type: isFund ? "fund_strategy" : ct.includes("bank") ? "financial_institution" : "corporate",
    steps: isFund ? ["account_classification", "source_discovery", "source_retrieval", "holdings_extraction", "signal_generation", "product_fit_analysis", "intelligence_summary"] : ["account_classification", "signal_generation", "product_fit_analysis", "intelligence_summary"],
    systemPrompt: `You are a sales intelligence analyst for Relai, an alternative data vendor. Analyze the entity and produce actionable sales intelligence. Score dataset relevance 0-100. Output valid JSON matching the exact schema requested.`,
  };
}

export default async function fundIntelligence(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { client_id, client_name, run_reason } = body;
  if (!client_id || !client_name) return { data: null, error: { message: "client_id and client_name required" } };

  const clientRows = await sql`SELECT client_type, strategy_focus, headquarters_country, aum FROM clients WHERE id = ${client_id} LIMIT 1`;
  const clientData = clientRows[0];
  const clientType = clientData?.client_type || "Other";

  const secMappings = await sql`SELECT id FROM external_source_mappings WHERE client_id = ${client_id} AND external_source_type IN ('sec_adviser', 'sec_issuer') LIMIT 1`;
  const hasSecMappings = secMappings.length > 0;

  const playbook = getPlaybookConfig(clientType, hasSecMappings);

  // Create run record
  const runRows = await sql`
    INSERT INTO fund_intelligence_runs (client_id, filing_source, filing_type, playbook_type, run_status, run_reason, triggered_by, generated_by, total_steps, completed_steps, current_step)
    VALUES (${client_id}, ${playbook.usesSEC ? "SEC EDGAR" : "AI Analysis"}, ${playbook.usesSEC ? "13F" : playbook.type}, ${playbook.type}, 'processing', ${run_reason || "manual"}, ${userId}, ${userId}, ${playbook.steps.length}, 0, ${playbook.steps[0]})
    RETURNING *
  `;
  const run = runRows[0];

  // Create step records
  const stepMap: Record<string, string> = {};
  for (let i = 0; i < playbook.steps.length; i++) {
    const stepRows = await sql`
      INSERT INTO intelligence_run_steps (run_id, step_name, step_order, step_status)
      VALUES (${run.id}, ${playbook.steps[i]}, ${i + 1}, 'pending') RETURNING id
    `;
    stepMap[playbook.steps[i]] = stepRows[0].id;
  }

  try {
    let holdings: any[] = [];
    let filingDate: string | null = null;
    let cik: string | null = null;
    let completedCount = 0;

    // Step 1: Classification
    await updateStep(sql, stepMap["account_classification"], { step_status: "running", started_at: new Date().toISOString() });
    await updateStep(sql, stepMap["account_classification"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Classified as ${playbook.type}`, output_json: { playbook_type: playbook.type, client_type: clientType, uses_sec: playbook.usesSEC } });
    completedCount++;
    await updateRunProgress(sql, run.id, playbook.steps[Math.min(completedCount, playbook.steps.length - 1)], completedCount);

    // SEC flow for fund types
    if (playbook.usesSEC) {
      // Source discovery
      await updateStep(sql, stepMap["source_discovery"], { step_status: "running", started_at: new Date().toISOString() });
      const mappings = await sql`SELECT external_identifier, external_entity_name FROM external_source_mappings WHERE client_id = ${client_id} AND external_source_type IN ('sec_adviser','sec_issuer') ORDER BY confidence_score DESC`;
      cik = mappings[0]?.external_identifier || null;

      if (!cik) {
        // Fallback: search EDGAR
        const searchName = client_name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
        try {
          const resp = await fetchWithTimeout(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=13F-HR&from=0&size=3`, { headers: SEC_HEADERS });
          if (resp.ok) {
            const data = await resp.json();
            const hit = data.hits?.hits?.[0]?._source;
            if (hit?.ciks?.[0]) { cik = hit.ciks[0]; filingDate = hit.file_date; }
          }
        } catch {}
      }
      await updateStep(sql, stepMap["source_discovery"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: cik ? `CIK: ${cik}` : "No SEC entity found", output_json: { cik } });
      completedCount++;
      await updateRunProgress(sql, run.id, playbook.steps[Math.min(completedCount, playbook.steps.length - 1)], completedCount);

      // Source retrieval + holdings extraction
      await updateStep(sql, stepMap["source_retrieval"], { step_status: "running", started_at: new Date().toISOString() });
      if (cik) {
        try {
          const paddedCik = cik.padStart(10, "0");
          const subResp = await fetchWithTimeout(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
          if (subResp.ok) {
            const subData = await subResp.json();
            const recent = subData.filings?.recent;
            if (recent) {
              const idx13F = recent.form?.findIndex((f: string) => f === "13F-HR" || f === "13F-HR/A");
              if (idx13F >= 0) {
                filingDate = recent.filingDate[idx13F];
                const accession = recent.accessionNumber[idx13F].replace(/-/g, "");
                const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${recent.primaryDocument[idx13F]}`;
                await sql`UPDATE fund_intelligence_runs SET filing_cik = ${cik}, filing_date = ${filingDate}, filing_url = ${filingUrl} WHERE id = ${run.id}`;
              }
            }
          }
        } catch {}
      }
      await updateStep(sql, stepMap["source_retrieval"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: filingDate ? `Filing date: ${filingDate}` : "No filing found" });
      completedCount++;

      // Holdings extraction
      await updateStep(sql, stepMap["holdings_extraction"], { step_status: "running", started_at: new Date().toISOString() });
      // Check for existing holdings snapshots
      if (cik) {
        const existingRuns = await sql`SELECT id FROM fund_intelligence_runs WHERE filing_cik = ${cik} AND run_status = 'completed' ORDER BY created_at DESC LIMIT 1`;
        if (existingRuns.length > 0) {
          const holdingsRows = await sql`SELECT issuer_name, ticker, sector, portfolio_weight, position_value FROM fund_holdings_snapshot WHERE run_id = ${existingRuns[0].id} ORDER BY portfolio_weight DESC LIMIT 30`;
          holdings = holdingsRows;
        }
      }
      await updateStep(sql, stepMap["holdings_extraction"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `${holdings.length} holdings loaded`, output_json: { holdings_count: holdings.length } });
      completedCount++;
      await updateRunProgress(sql, run.id, playbook.steps[Math.min(completedCount, playbook.steps.length - 1)], completedCount);
    }

    // Remaining AI steps: signal_generation, product_fit_analysis, intelligence_summary
    // We combine these into a single AI call for efficiency.
    const datasets = await sql`SELECT name, description, coverage FROM datasets WHERE is_active = true LIMIT 20`;
    const datasetContext = datasets.map((d: any) => `- ${d.name}: ${d.description || "N/A"} (Coverage: ${d.coverage || "N/A"})`).join("\n");

    const holdingsSummary = holdings.length > 0
      ? holdings.slice(0, 20).map((h: any) => `- ${h.issuer_name} (${h.ticker || "N/A"}): ${((h.portfolio_weight || 0) * 100).toFixed(1)}% weight, $${((h.position_value || 0) / 1e6).toFixed(1)}M${h.sector ? ` [${h.sector}]` : ""}`).join("\n")
      : "";
    const totalValue = holdings.reduce((s: number, h: any) => s + (h.position_value || 0), 0);

    for (const stepName of ["signal_generation", "product_fit_analysis"]) {
      if (stepMap[stepName]) {
        await updateStep(sql, stepMap[stepName], { step_status: "running", started_at: new Date().toISOString() });
        await updateStep(sql, stepMap[stepName], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: "Included in intelligence summary" });
        completedCount++;
        await updateRunProgress(sql, run.id, playbook.steps[Math.min(completedCount, playbook.steps.length - 1)], completedCount);
      }
    }

    await updateStep(sql, stepMap["intelligence_summary"], { step_status: "running", started_at: new Date().toISOString() });

    const userPrompt = `Analyze this entity and generate sales intelligence.
ENTITY: ${client_name}
TYPE: ${clientType}
${holdings.length > 0 ? `FILING DATE: ${filingDate || "Unknown"}
TOTAL HOLDINGS: ${holdings.length}
TOTAL PORTFOLIO VALUE: $${(totalValue / 1e6).toFixed(1)}M
TOP HOLDINGS:
${holdingsSummary}` : `HEADQUARTERS: ${clientData?.headquarters_country || "Unknown"}
AUM/SIZE: ${clientData?.aum || "Unknown"}
STRATEGY: ${clientData?.strategy_focus || "Unknown"}
NOTE: No SEC filings available — infer investment focus from metadata.`}

RELAI DATASETS:
${datasetContext}

Generate JSON: ${JSON_OUTPUT_SCHEMA}
Respond with ONLY valid JSON, no markdown.`;

    const aiResponse = await callAI(aiConfig, {
      system: playbook.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      temperature: 0.4,
    });

    let intelligence: any;
    try {
      const cleaned = aiResponse.content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      intelligence = JSON.parse(cleaned);
    } catch {
      await updateStep(sql, stepMap["intelligence_summary"], { step_status: "failed", error_message: "Failed to parse AI response", completed_at: new Date().toISOString() });
      await sql`UPDATE fund_intelligence_runs SET run_status = 'failed', error_message = 'Failed to parse AI response' WHERE id = ${run.id}`;
      return { data: null, error: { message: "Failed to parse intelligence results" } };
    }

    // Store results
    await sql`
      INSERT INTO fund_intelligence_results (client_id, run_id, strategy_summary, sector_exposure_summary, portfolio_theme_summary, relevant_datasets_json, recommended_approach, suggested_messaging, confidence_score)
      VALUES (${client_id}, ${run.id}, ${intelligence.strategy_summary || ""}, ${intelligence.sector_exposure_summary || ""}, ${intelligence.portfolio_theme_summary || ""}, ${JSON.stringify(intelligence.relevant_datasets || [])}::jsonb, ${intelligence.recommended_approach || ""}, ${intelligence.suggested_messaging || ""}, ${intelligence.confidence_score || 50})
    `;

    await updateStep(sql, stepMap["intelligence_summary"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Intelligence generated (confidence: ${intelligence.confidence_score || 50})`, output_json: { confidence: intelligence.confidence_score } });
    completedCount++;

    // Mark run complete
    await sql`UPDATE fund_intelligence_runs SET run_status = 'completed', generated_at = now(), completed_at = now(), completed_steps = ${completedCount}, current_step = null WHERE id = ${run.id}`;

    return {
      data: {
        run_id: run.id,
        client_id,
        intelligence,
        playbook_type: playbook.type,
        holdings_count: holdings.length,
      },
    };
  } catch (e: unknown) {
    // Mark failed steps
    const runningSteps = await sql`SELECT id FROM intelligence_run_steps WHERE run_id = ${run.id} AND step_status = 'running'`;
    for (const s of runningSteps) {
      await updateStep(sql, s.id, { step_status: "failed", error_message: e instanceof Error ? e.message : "Unknown error", completed_at: new Date().toISOString() });
    }
    await sql`UPDATE fund_intelligence_runs SET run_status = 'failed', error_message = ${e instanceof Error ? e.message : "Unknown error"} WHERE id = ${run.id}`;
    return { data: null, error: { message: "An internal error occurred. Please try again." } };
  }
}
