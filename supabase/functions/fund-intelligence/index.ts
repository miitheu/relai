import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("fund-intelligence");

const SEC_HEADERS = {
  "User-Agent": "Relai CRM support@relai.com",
  Accept: "application/json",
};

const EDGAR_SUBMISSIONS = "https://data.sec.gov/submissions";
const FETCH_TIMEOUT_MS = 15000; // 15 second timeout per SEC request

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ─── Step definitions ────────────────────────────────────────────────
const FUND_STEPS = [
  "account_classification",
  "source_discovery",
  "source_retrieval",
  "holdings_extraction",
  "signal_generation",
  "product_fit_analysis",
  "intelligence_summary",
];

const NON_SEC_STEPS = [
  "account_classification",
  "signal_generation",
  "product_fit_analysis",
  "intelligence_summary",
];

// ─── Playbook ────────────────────────────────────────────────────────
interface PlaybookConfig {
  type: string;
  label: string;
  usesSEC: boolean;
  steps: string[];
  systemPrompt: string;
  buildUserPrompt: (ctx: PromptContext) => string;
}

interface PromptContext {
  clientName: string;
  clientType: string;
  filingDate: string | null;
  holdingsSummary: string;
  holdingsCount: number;
  totalValue: number;
  insightHubContext: string;
  datasetContext: string;
  strategyFocus: string | null;
  headquartersCountry: string | null;
  aum: string | null;
}

const JSON_OUTPUT_SCHEMA = `{
  "strategy_summary": "2-3 sentence summary",
  "sector_exposure_summary": "Key sector concentrations",
  "portfolio_theme_summary": "Major themes identified",
  "relevant_datasets": [
    {"dataset_name":"exact name","dataset_id":null,"relevance_score":85,"reason":"Specific explanation","supporting_holdings":["Company A"]}
  ],
  "recommended_approach": "How to position Relai",
  "suggested_target_personas": [{"title":"e.g. PM","reason":"Why interested"}],
  "suggested_messaging": "Draft outreach angle",
  "suggested_engagement_plan": [{"step":1,"action":"Initial outreach","description":"What to do","timing":"Week 1"}],
  "confidence_score": 75
}`;

function getPlaybook(clientType: string, hasSecMappings = false): PlaybookConfig {
  const ct = (clientType || "").toLowerCase();

  if (hasSecMappings || ct.includes("hedge fund") || ct.includes("asset manager") || ct.includes("investment") || ct.includes("fund") || ct.includes("mutual") || ct.includes("etf")) {
    return {
      type: "fund_strategy", label: "Fund Strategy Intelligence", usesSEC: true, steps: FUND_STEPS,
      systemPrompt: `You are a sales intelligence analyst for Relai, an alternative data vendor specializing in procurement, government contracts, trade flows, and supply chain data.
Analyze a fund's investment profile to produce actionable sales intelligence.
If SEC 13F holdings data is available, base conclusions on actual holdings. If not, infer the fund's likely investment focus from its name, type, AUM, strategy, and headquarters. Score dataset relevance 0-100. Output valid JSON matching the exact schema requested.`,
      buildUserPrompt: (ctx) => `Analyze this fund and generate sales intelligence.
FUND: ${ctx.clientName}
TYPE: ${ctx.clientType}
${ctx.holdingsCount > 0 ? `FILING DATE: ${ctx.filingDate || "Unknown"}
TOTAL HOLDINGS: ${ctx.holdingsCount}
TOTAL PORTFOLIO VALUE: $${(ctx.totalValue / 1e6).toFixed(1)}M
TOP HOLDINGS:
${ctx.holdingsSummary}` : `HEADQUARTERS: ${ctx.headquartersCountry || "Unknown"}
AUM/SIZE: ${ctx.aum || "Unknown"}
STRATEGY: ${ctx.strategyFocus || "Unknown"}
NOTE: No SEC filings available — infer investment focus from fund metadata.`}
${ctx.insightHubContext}
RELAI DATASETS:
${ctx.datasetContext}
Generate a JSON response with this exact structure:
${JSON_OUTPUT_SCHEMA}
Respond with ONLY valid JSON, no markdown formatting.`,
    };
  }

  if (ct.includes("bank") || ct.includes("financial")) {
    return {
      type: "financial_institution", label: "Financial Institution Intelligence", usesSEC: false, steps: NON_SEC_STEPS,
      systemPrompt: `You are a sales intelligence analyst for Relai. Analyze a financial institution and produce actionable sales intelligence. Infer business segments needing alternative data. Score dataset relevance 0-100. Output valid JSON.`,
      buildUserPrompt: (ctx) => `Analyze this financial institution.
INSTITUTION: ${ctx.clientName}
TYPE: ${ctx.clientType}
HEADQUARTERS: ${ctx.headquartersCountry || "Unknown"}
AUM/SIZE: ${ctx.aum || "Unknown"}
STRATEGY: ${ctx.strategyFocus || "Unknown"}
${ctx.insightHubContext}
RELAI DATASETS:
${ctx.datasetContext}
Generate JSON with this structure: ${JSON_OUTPUT_SCHEMA}
For "supporting_holdings", list relevant business areas. Respond with ONLY valid JSON.`,
    };
  }

  if (ct.includes("vendor") || ct.includes("partner") || ct.includes("data provider")) {
    return {
      type: "partnership", label: "Partnership Intelligence", usesSEC: false, steps: NON_SEC_STEPS,
      systemPrompt: `You are a partnership intelligence analyst for Relai. Analyze a potential data vendor or partner. Identify product adjacency and complementarity. Score relevance 0-100. Output valid JSON.`,
      buildUserPrompt: (ctx) => `Analyze this data vendor/partner.
COMPANY: ${ctx.clientName}
TYPE: ${ctx.clientType}
HEADQUARTERS: ${ctx.headquartersCountry || "Unknown"}
FOCUS: ${ctx.strategyFocus || "Unknown"}
${ctx.insightHubContext}
RELAI DATASETS:
${ctx.datasetContext}
Generate JSON with this structure: ${JSON_OUTPUT_SCHEMA}
For "supporting_holdings", list relevant product areas. Respond with ONLY valid JSON.`,
    };
  }

  return {
    type: "corporate", label: "Corporate Intelligence", usesSEC: false, steps: NON_SEC_STEPS,
    systemPrompt: `You are a sales intelligence analyst for Relai. Analyze a corporate client and produce actionable sales intelligence. Infer sector, business model, and data needs. Score dataset relevance 0-100. Output valid JSON.`,
    buildUserPrompt: (ctx) => `Analyze this corporate client.
COMPANY: ${ctx.clientName}
TYPE: ${ctx.clientType}
HEADQUARTERS: ${ctx.headquartersCountry || "Unknown"}
AUM/SIZE: ${ctx.aum || "Unknown"}
STRATEGY: ${ctx.strategyFocus || "Unknown"}
${ctx.insightHubContext}
RELAI DATASETS:
${ctx.datasetContext}
Generate JSON with this structure: ${JSON_OUTPUT_SCHEMA}
For "supporting_holdings", list relevant business areas or supply chain connections. Respond with ONLY valid JSON.`,
  };
}

// ─── Step helper ─────────────────────────────────────────────────────
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

// ─── Main handler ────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  // Auth verification
  const auth = await verifyAuth(req);
  if (!auth) {
    return errorResponse("Unauthorized", 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseServiceKey);

  // Insight Hub client (shared, read-only) — optional
  const insightHubUrl = Deno.env.get("INSIGHT_HUB_URL");
  const insightHubKey = Deno.env.get("INSIGHT_HUB_ANON_KEY");
  const insightHubClient = (insightHubUrl && insightHubKey)
    ? createClient(insightHubUrl, insightHubKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  if (!insightHubClient) {
    log.info("Insight Hub not configured — running without coverage matching");
  }

  try {
    const { client_id, client_name, run_reason } = await req.json();
    if (!client_id || !client_name) {
      return errorResponse("client_id and client_name required", 400);
    }

    // Fetch client details
    const { data: clientData } = await sb.from("clients").select("client_type, strategy_focus, headquarters_country, aum").eq("id", client_id).single();
    const clientType = clientData?.client_type || "Other";

    // Check if client has SEC source mappings (override playbook if so)
    const { data: secMappings } = await sb.from("external_source_mappings")
      .select("id")
      .eq("client_id", client_id)
      .in("external_source_type", ["sec_adviser", "sec_issuer"])
      .limit(1);
    const hasSecMappings = (secMappings?.length || 0) > 0;

    const playbook = getPlaybook(clientType, hasSecMappings);

    log.info(`Running ${playbook.type} playbook for: ${client_name} (${clientType})`);

    // Create run record with step tracking
    const { data: run, error: runErr } = await sb.from("fund_intelligence_runs").insert({
      client_id,
      filing_source: playbook.usesSEC ? "SEC EDGAR" : "AI Analysis",
      filing_type: playbook.usesSEC ? "13F" : playbook.type,
      playbook_type: playbook.type,
      run_status: "processing",
      run_reason: run_reason || "manual",
      triggered_by: auth.userId,
      generated_by: auth.userId,
      total_steps: playbook.steps.length,
      completed_steps: 0,
      current_step: playbook.steps[0],
    }).select().single();

    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);

    // Create step records
    const stepRecords = playbook.steps.map((name, i) => ({
      run_id: run.id,
      step_name: name,
      step_order: i + 1,
      step_status: "pending",
    }));
    const { data: steps } = await sb.from("intelligence_run_steps").insert(stepRecords).select();
    const stepMap: Record<string, string> = {};
    for (const s of (steps || [])) stepMap[s.step_name] = s.id;

    try {
      let holdings: any[] = [];
      let filingDate: string | null = null;
      let filingUrl: string | null = null;
      let cik: string | null = null;
      let completedCount = 0;

      // ═══ STEP 1: Account Classification ═══
      const classStepId = stepMap["account_classification"];
      await updateStep(sb, classStepId, { step_status: "running", started_at: new Date().toISOString() });
      
      await updateStep(sb, classStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Classified as ${playbook.type}`,
        output_json: { playbook_type: playbook.type, client_type: clientType, uses_sec: playbook.usesSEC },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, playbook.steps[Math.min(completedCount, playbook.steps.length - 1)], completedCount);

      // ═══ STEP 2-4: SEC flow (fund_strategy only) ═══
      if (playbook.usesSEC) {
        // --- Gather ALL resolved CIKs from external_source_mappings ---
        const { data: allMappings } = await sb.from("external_source_mappings")
          .select("external_identifier, external_entity_name, external_source_type")
          .eq("client_id", client_id)
          .in("external_source_type", ["sec_adviser", "sec_issuer"])
          .order("confidence_score", { ascending: false });

        const resolvedCiks: { cik: string; name: string; sourceType: string }[] = [];
        if (allMappings && allMappings.length > 0) {
          for (const m of allMappings) {
            if (m.external_identifier && !resolvedCiks.some(r => r.cik === m.external_identifier)) {
              resolvedCiks.push({ cik: m.external_identifier, name: m.external_entity_name, sourceType: m.external_source_type });
            }
          }
        }

        // Fallback: check legacy single-CIK resolution record
        if (resolvedCiks.length === 0) {
          const { data: entityRes } = await sb.from("account_entity_resolutions")
            .select("*").eq("client_id", client_id).single();
          const isResolved = entityRes && (entityRes.resolution_status === "manually_confirmed" || entityRes.resolution_status === "auto_matched");
          if (isResolved && entityRes.sec_cik) {
            resolvedCiks.push({ cik: entityRes.sec_cik, name: entityRes.sec_filer_name || client_name, sourceType: "sec_adviser" });
          }
        }

        // Fallback: search EDGAR from raw name if no resolved CIKs
        if (resolvedCiks.length === 0) {
          const searchName = client_name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
          try {
            const searchResp = await fetchWithTimeout(
              `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=13F-HR&dateRange=custom&startdt=${getDateMonthsAgo(18)}&enddt=${getTodayDate()}&from=0&size=3`,
              { headers: SEC_HEADERS }
            );
            if (searchResp.ok) {
              const searchData = await searchResp.json();
              if (searchData.hits?.hits?.length > 0) {
                const hit = searchData.hits.hits[0]._source;
                const foundCik = hit?.ciks?.[0] || null;
                if (foundCik) {
                  resolvedCiks.push({ cik: foundCik, name: hit?.display_names?.[0] || client_name, sourceType: "sec_adviser" });
                  filingDate = hit?.file_date || null;
                }
              }
            }
          } catch (e) { console.log("EDGAR search failed, trying fallback"); }

          if (resolvedCiks.length === 0) {
            try {
              const companyResp = await fetchWithTimeout(
                `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=13F-HR`,
                { headers: SEC_HEADERS }
              );
              if (companyResp.ok) {
                const companyData = await companyResp.json();
                if (companyData.hits?.hits?.length > 0) {
                  const hit = companyData.hits.hits[0]._source;
                  const foundCik = hit?.ciks?.[0] || null;
                  if (foundCik) resolvedCiks.push({ cik: foundCik, name: hit?.display_names?.[0] || client_name, sourceType: "sec_adviser" });
                }
              }
            } catch {}
          }
        }

        log.info(`Found ${resolvedCiks.length} CIK(s) for ${client_name}`, { ciks: resolvedCiks.map(r => ({ name: r.name, cik: r.cik })) });
        cik = resolvedCiks[0]?.cik || null;

        // --- Source Discovery ---
        const discStepId = stepMap["source_discovery"];
        await updateStep(sb, discStepId, { step_status: "running", started_at: new Date().toISOString() });

        // Store source records for all CIKs
        for (const rc of resolvedCiks) {
          await sb.from("account_intelligence_sources").insert({
            run_id: run.id, client_id, source_type: "sec_edgar",
            source_identifier: `CIK:${rc.cik}`, source_date: filingDate,
            source_status: "discovered", metadata_json: { cik: rc.cik, name: rc.name, source_type: rc.sourceType },
          });
        }

        await updateStep(sb, discStepId, {
          step_status: "completed", completed_at: new Date().toISOString(),
          output_summary: resolvedCiks.length > 0 ? `Found ${resolvedCiks.length} SEC CIK(s): ${resolvedCiks.map(r => r.cik).join(", ")}` : "No SEC filing found",
          output_json: { ciks: resolvedCiks.map(r => ({ cik: r.cik, name: r.name })), count: resolvedCiks.length },
        });
        completedCount++;
        await updateRunProgress(sb, run.id, "source_retrieval", completedCount);

        // --- Source Retrieval: iterate ALL CIKs ---
        const retStepId = stepMap["source_retrieval"];
        await updateStep(sb, retStepId, { step_status: "running", started_at: new Date().toISOString() });

        const allFilingDates: string[] = [];

        for (const rc of resolvedCiks) {
          const paddedCik = rc.cik.padStart(10, "0");
          try {
            const subResp = await fetchWithTimeout(`${EDGAR_SUBMISSIONS}/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
            if (subResp.ok) {
              const subData = await subResp.json();
              const recent = subData.filings?.recent;
              if (recent) {
                const idx = recent.form?.findIndex((f: string) => f === "13F-HR" || f === "13F-HR/A");
                if (idx >= 0) {
                  const accession = recent.accessionNumber[idx].replace(/-/g, "");
                  const thisFilingDate = recent.filingDate[idx];
                  const primaryDoc = recent.primaryDocument[idx];
                  const thisFilingUrl = `https://www.sec.gov/Archives/edgar/data/${rc.cik}/${accession}/${primaryDoc}`;

                  if (thisFilingDate) allFilingDates.push(thisFilingDate);
                  if (!filingDate || (thisFilingDate && thisFilingDate > filingDate)) {
                    filingDate = thisFilingDate;
                    filingUrl = thisFilingUrl;
                  }

                  // Update source record for this CIK
                  await sb.from("account_intelligence_sources").update({
                    source_url: thisFilingUrl, source_date: thisFilingDate, source_status: "retrieved",
                    metadata_json: { cik: rc.cik, name: rc.name, filing_date: thisFilingDate, accession, filing_url: thisFilingUrl },
                  }).eq("run_id", run.id).eq("source_identifier", `CIK:${rc.cik}`);

                  // Fetch holdings XML
                  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${rc.cik}/${accession}/`;
                  try {
                    const indexResp = await fetchWithTimeout(indexUrl, { headers: { ...SEC_HEADERS, Accept: "text/html" } });
                    if (indexResp.ok) {
                      const indexHtml = await indexResp.text();
                      const xmlMatch = indexHtml.match(/href="([^"]*(?:infotable|information_table|13f|holdings)[^"]*\.xml)"/i);
                      if (xmlMatch) {
                        let xmlUrl = xmlMatch[1].startsWith("/") ? `https://www.sec.gov${xmlMatch[1]}` : xmlMatch[1].startsWith("http") ? xmlMatch[1] : `${indexUrl}${xmlMatch[1]}`;
                        const xmlResp = await fetchWithTimeout(xmlUrl, { headers: SEC_HEADERS }, 30000); // 30s for large XML files
                        if (xmlResp.ok) {
                          const cikHoldings = parseHoldingsXml(await xmlResp.text());
                          // Tag each holding with its source CIK
                          for (const h of cikHoldings) { (h as any).source_cik = rc.cik; (h as any).source_name = rc.name; }
                          holdings.push(...cikHoldings);
                          log.info(`Extracted ${cikHoldings.length} holdings from CIK ${rc.cik} (${rc.name})`);
                        }
                      } else {
                        for (const tryName of ["infotable.xml", "primary_doc.xml"]) {
                          try {
                            const tryResp = await fetchWithTimeout(`${indexUrl}${tryName}`, { headers: SEC_HEADERS });
                            if (tryResp.ok) {
                              const tryText = await tryResp.text();
                              if (tryText.includes("infoTable") || tryText.includes("nameOfIssuer")) {
                                const cikHoldings = parseHoldingsXml(tryText);
                                for (const h of cikHoldings) { (h as any).source_cik = rc.cik; (h as any).source_name = rc.name; }
                                holdings.push(...cikHoldings);
                                break;
                              }
                            }
                          } catch {}
                        }
                      }
                    }
                  } catch {}
                }
              }
            }
          } catch {}

          // Rate limit between CIK requests
          if (resolvedCiks.length > 1) await new Promise(r => setTimeout(r, 150));
        }

        await sb.from("fund_intelligence_runs").update({
          filing_date: filingDate, filing_url: filingUrl, filing_cik: resolvedCiks.map(r => r.cik).join(","),
        }).eq("id", run.id);

        await updateStep(sb, retStepId, {
          step_status: "completed", completed_at: new Date().toISOString(),
          output_summary: filingUrl ? `Retrieved filings from ${resolvedCiks.length} CIK(s), latest: ${filingDate}` : "No filing retrieved",
          output_json: { filing_url: filingUrl, filing_date: filingDate, cik_count: resolvedCiks.length, total_holdings: holdings.length },
        });
        completedCount++;
        await updateRunProgress(sb, run.id, "holdings_extraction", completedCount);

        // --- Holdings Extraction ---
        const extStepId = stepMap["holdings_extraction"];
        await updateStep(sb, extStepId, { step_status: "running", started_at: new Date().toISOString() });

        // Cap holdings to top 100 by value to stay within compute limits (large funds like Citadel can have 5000+)
        const totalHoldingsCount = holdings.length;
        if (holdings.length > 100) {
          holdings.sort((a, b) => (b.value || 0) - (a.value || 0));
          holdings.length = 100;
          log.info(`Capped holdings from ${totalHoldingsCount} to top 100 by value`);
        }

        // Resolve tickers via security_master (CUSIP) + Insight Hub (name matching)
        if (holdings.length > 0) {
          await resolveTickersFromInsightHub(holdings, insightHubClient, sb);
        }

        // Store holdings snapshot
        if (holdings.length > 0) {
          const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);
          const holdingsRows = holdings.map((h) => ({
            run_id: run.id,
            issuer_name: h.issuerName || "Unknown",
            ticker: h.ticker || null,
            cusip: h.cusip || null,
            position_value: h.value || 0,
            shares: h.shares || 0,
            portfolio_weight: totalValue > 0 ? ((h.value || 0) / totalValue) * 100 : 0,
            sector: h.sector || null,
          }));
          await sb.from("fund_holdings_snapshot").insert(holdingsRows);
        }

        await updateStep(sb, extStepId, {
          step_status: "completed", completed_at: new Date().toISOString(),
          output_summary: totalHoldingsCount > holdings.length
            ? `Extracted ${totalHoldingsCount} holdings, processing top ${holdings.length} by value`
            : `Extracted ${holdings.length} holdings`,
          output_json: { holdings_count: holdings.length, total_in_filing: totalHoldingsCount, top_5: holdings.slice(0, 5).map(h => h.issuerName) },
        });
        completedCount++;
        await updateRunProgress(sb, run.id, "signal_generation", completedCount);
      }

      // ═══ SIGNAL GENERATION (Insight Hub matching) ═══
      const sigStepId = stepMap["signal_generation"];
      await updateStep(sb, sigStepId, { step_status: "running", started_at: new Date().toISOString() });

      let insightHubMatches: any[] = [];
      const namesToMatch = holdings.length > 0
        ? holdings.slice(0, 100).map((h) => h.issuerName?.toUpperCase()).filter(Boolean)
        : [client_name.toUpperCase()];

      if (namesToMatch.length > 0 && insightHubClient) {
        const matchPromises = [];
        for (let i = 0; i < Math.min(namesToMatch.length, 60); i += 20) {
          const batch = namesToMatch.slice(i, i + 20);
          const orFilter = batch.map((name) => `company_name.ilike.%${name.replace(/[%_'"(),\\]/g, "")}%`).join(",");
          matchPromises.push(insightHubClient.from("ticker_lists").select("ticker_symbol, company_name, datafeed, gov_contract_rev, total_rev_2023").or(orFilter).limit(100));
          matchPromises.push(insightHubClient.from("trade_flows_ticker_lists").select("ticker_symbol, company_name, transactions_as_supplier, transactions_as_customer, total_rev_2023").or(orFilter).limit(100));
        }
        const matchResults = await Promise.all(matchPromises);
        const seenTickers = new Set<string>();
        matchResults.forEach((res, idx) => {
          if (!res.error && res.data) {
            for (const m of res.data) {
              const key = `${idx % 2 === 0 ? 'gc' : 'tf'}_${m.ticker_symbol}`;
              if (!seenTickers.has(key)) {
                seenTickers.add(key);
                if (idx % 2 === 0) {
                  insightHubMatches.push({ type: "gov_contracts", ticker: m.ticker_symbol, company: m.company_name, feed: m.datafeed, gov_contract_rev: m.gov_contract_rev, total_rev: m.total_rev_2023 });
                } else {
                  insightHubMatches.push({ type: "trade_flows", ticker: m.ticker_symbol, company: m.company_name, supplier_txns: m.transactions_as_supplier, customer_txns: m.transactions_as_customer, total_rev: m.total_rev_2023 });
                }
              }
            }
          }
        });
      }

      // Store relevance flags on holdings (batched to reduce DB round-trips)
      if (insightHubMatches.length > 0 && holdings.length > 0) {
        const matchedCompanies = new Set(insightHubMatches.map((m) => m.company?.toUpperCase()));
        const updatePromises: Promise<any>[] = [];
        for (const h of holdings) {
          if (matchedCompanies.has(h.issuerName?.toUpperCase())) {
            const matches = insightHubMatches.filter((m) => m.company?.toUpperCase() === h.issuerName?.toUpperCase());
            updatePromises.push(sb.from("fund_holdings_snapshot").update({ relevance_flags_json: matches }).eq("run_id", run.id).ilike("issuer_name", h.issuerName));
          }
        }
        if (updatePromises.length > 0) {
          // Execute in batches of 20 concurrently
          for (let i = 0; i < updatePromises.length; i += 20) {
            await Promise.all(updatePromises.slice(i, i + 20));
          }
        }
      }

      // Store signals in the new signals table
      const signalRecords = insightHubMatches.slice(0, 50).map(m => ({
        run_id: run.id,
        client_id,
        signal_type: m.type === "gov_contracts" ? "gov_contract_coverage" : "trade_flow_coverage",
        signal_category: "insight_hub_match",
        signal_value: `${m.company} (${m.ticker})`,
        confidence: 80,
        evidence_json: m,
      }));
      if (signalRecords.length > 0) {
        await sb.from("account_intelligence_signals").insert(signalRecords);
      }

      await updateStep(sb, sigStepId, {
        step_status: "completed", completed_at: new Date().toISOString(),
        output_summary: `${insightHubMatches.length} Insight Hub matches found`,
        output_json: { match_count: insightHubMatches.length, types: { gov_contracts: insightHubMatches.filter(m => m.type === "gov_contracts").length, trade_flows: insightHubMatches.filter(m => m.type === "trade_flows").length } },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, "product_fit_analysis", completedCount);

      // ═══ PRODUCT FIT ANALYSIS ═══
      const fitStepId = stepMap["product_fit_analysis"];
      await updateStep(sb, fitStepId, { step_status: "running", started_at: new Date().toISOString() });

      const { data: datasets } = await sb.from("datasets").select("id, name, description, coverage, example_use_cases").eq("is_active", true);

      // Compute product fit for each dataset
      const productFits: any[] = [];

      // Mark all previous fits as non-latest in one query (instead of per-dataset)
      if (datasets && datasets.length > 0) {
        await sb.from("product_fit_analyses").update({ is_latest: false }).eq("client_id", client_id).eq("is_latest", true);
      }

      // Pre-compute sectors from holdings once (not per-dataset)
      const holdingSectors = new Set<string>();
      for (const h of holdings) { if (h.sector) holdingSectors.add(h.sector); }

      for (const ds of (datasets || [])) {
        const relevantMatches = insightHubMatches.filter(m => {
          const dsName = (ds.name || "").toLowerCase();
          if (m.type === "gov_contracts" && (dsName.includes("gov") || dsName.includes("contract") || dsName.includes("procurement"))) return true;
          if (m.type === "trade_flows" && (dsName.includes("trade") || dsName.includes("supply") || dsName.includes("flow"))) return true;
          return false;
        });
        const overlapScore = holdings.length > 0 ? Math.round((relevantMatches.length / Math.max(holdings.length, 1)) * 100) : (relevantMatches.length > 0 ? 60 : 20);
        const sectors = new Set<string>(holdingSectors);
        for (const m of relevantMatches) { if (m.feed) sectors.add(m.feed); }

        const fitRecord = {
          run_id: run.id, client_id, product_id: ds.id,
          fit_score: Math.min(100, overlapScore + (relevantMatches.length > 0 ? 20 : 0)),
          coverage_overlap_score: Math.min(100, overlapScore),
          sector_relevance_score: Math.min(100, Array.from(sectors).length * 15),
          timing_score: 50,
          sector_relevance: Array.from(sectors).slice(0, 10),
          supporting_entities_json: relevantMatches.slice(0, 10).map(m => ({ company: m.company, ticker: m.ticker, type: m.type })),
          evidence_summary: relevantMatches.length > 0
            ? `${relevantMatches.length} portfolio companies found in ${ds.name} coverage: ${relevantMatches.slice(0, 3).map(m => m.company).join(", ")}`
            : `No direct coverage overlap found with ${ds.name}`,
          is_latest: true,
        };
        productFits.push(fitRecord);
      }

      if (productFits.length > 0) {
        await sb.from("product_fit_analyses").insert(productFits);
      }

      await updateStep(sb, fitStepId, {
        step_status: "completed", completed_at: new Date().toISOString(),
        output_summary: `Analyzed fit for ${productFits.length} products`,
        output_json: { product_count: productFits.length, top_fit: productFits.sort((a, b) => b.fit_score - a.fit_score).slice(0, 3).map(f => ({ product_id: f.product_id, score: f.fit_score })) },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, "intelligence_summary", completedCount);

      // ═══ INTELLIGENCE SUMMARY (AI call) ═══
      const sumStepId = stepMap["intelligence_summary"];
      await updateStep(sb, sumStepId, { step_status: "running", started_at: new Date().toISOString() });

      // --- Load effective exposure (look-through ETF weights) ---
      let effectiveExposureContext = "";
      const { data: effectiveExposure } = await sb
        .from("fund_effective_exposure")
        .select("direct_weight_pct, implied_etf_weight_pct, total_weight_pct, source_breakdown_json, security:security_id(ticker, issuer_name, is_etf)")
        .eq("fund_id", client_id)
        .order("total_weight_pct", { ascending: false })
        .limit(50);

      if (effectiveExposure && effectiveExposure.length > 0) {
        const withImplied = effectiveExposure.filter((e: any) => (e.implied_etf_weight_pct || 0) > 0);
        effectiveExposureContext = `\nEFFECTIVE EXPOSURE (look-through, includes ETF constituents):
Total positions: ${effectiveExposure.length}, of which ${withImplied.length} have ETF-implied weight.
Top effective positions:
${effectiveExposure.slice(0, 30).map((e: any) => {
  const sec = e.security as any;
  const direct = Number(e.direct_weight_pct || 0).toFixed(2);
  const implied = Number(e.implied_etf_weight_pct || 0).toFixed(2);
  const total = Number(e.total_weight_pct || 0).toFixed(2);
  const sources = (e.source_breakdown_json || []).map((s: any) => s.source_type || "direct").join("+");
  return `- ${sec?.issuer_name || "?"} (${sec?.ticker || "N/A"}): Total ${total}% [Direct ${direct}% + ETF-implied ${implied}%] via ${sources}`;
}).join("\n")}
IMPORTANT: Use effective exposure (which accounts for ETF look-through) as the PRIMARY basis for sector analysis and product fit. It is more accurate than raw reported holdings.\n`;
      }

      const holdingsSummary = holdings.slice(0, 50).map((h) => `${h.issuerName} (${h.ticker || "N/A"}): $${((h.value || 0) / 1000).toFixed(0)}K`).join("\n");
      const insightHubContext = insightHubMatches.length > 0
        ? `\nINSIGHT HUB COVERAGE MATCHES:\n${insightHubMatches.map((m) => m.type === "gov_contracts" ? `- ${m.company} (${m.ticker}): In ${m.feed} feed, Gov rev: $${((m.gov_contract_rev || 0) / 1e6).toFixed(1)}M` : `- ${m.company} (${m.ticker}): Trade Flows, ${m.supplier_txns || 0} supplier txns`).join("\n")}\n`
        : "\nNo direct matches in Relai data feeds.\n";
      const datasetContext = (datasets || []).map((d) => `- ${d.name}: ${d.description || ""} Coverage: ${d.coverage || ""}`).join("\n");
      const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);

      const promptCtx: PromptContext = {
        clientName: client_name, clientType, filingDate,
        holdingsSummary: effectiveExposureContext ? effectiveExposureContext + "\nRAW REPORTED HOLDINGS:\n" + holdingsSummary : holdingsSummary,
        holdingsCount: holdings.length, totalValue, insightHubContext, datasetContext,
        strategyFocus: clientData?.strategy_focus || null,
        headquartersCountry: clientData?.headquarters_country || null,
        aum: clientData?.aum || null,
      };

      const { callAI } = await import("../_shared/ai.ts");
      const aiData = await callAI(sb, {
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          { role: "system", content: playbook.systemPrompt },
          { role: "user", content: playbook.buildUserPrompt(promptCtx) },
        ],
        userId: auth.userId,
        functionName: "fund-intelligence",
      });
      const rawContent = aiData.choices?.[0]?.message?.content || "";

      let analysis: any;
      try {
        const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawContent];
        let jsonStr = jsonMatch[1].trim();
        try {
          analysis = JSON.parse(jsonStr);
        } catch {
          let repaired = jsonStr;
          repaired = repaired.replace(/,\s*"[^"]*$/, '');
          repaired = repaired.replace(/,\s*\{[^}]*$/, '');
          const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
          const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/]/g) || []).length;
          for (let i = 0; i < openBrackets; i++) repaired += ']';
          for (let i = 0; i < openBraces; i++) repaired += '}';
          analysis = JSON.parse(repaired);
        }
      } catch {
        throw new Error("Failed to parse AI analysis — invalid JSON");
      }

      // Match dataset IDs
      const relevantDatasets = (analysis.relevant_datasets || []).map((rd: any) => {
        const matched = (datasets || []).find((d) => d.name.toLowerCase() === rd.dataset_name?.toLowerCase());
        return { ...rd, dataset_id: matched?.id || null };
      });

      // Store in fund_intelligence_results (backward compatible)
      await sb.from("fund_intelligence_results").insert({
        run_id: run.id, client_id,
        strategy_summary: analysis.strategy_summary || null,
        sector_exposure_summary: analysis.sector_exposure_summary || null,
        portfolio_theme_summary: analysis.portfolio_theme_summary || null,
        relevant_datasets_json: relevantDatasets,
        recommended_approach: analysis.recommended_approach || null,
        suggested_target_personas_json: analysis.suggested_target_personas || [],
        suggested_messaging: analysis.suggested_messaging || null,
        suggested_engagement_plan_json: analysis.suggested_engagement_plan || [],
        confidence_score: analysis.confidence_score || 50,
      });

      // Upsert account_intelligence_summaries
      await sb.from("account_intelligence_summaries").upsert({
        client_id,
        run_id: run.id,
        strategy_summary: analysis.strategy_summary || null,
        sector_summary: analysis.sector_exposure_summary || null,
        theme_summary: analysis.portfolio_theme_summary || null,
        recommended_approach: analysis.recommended_approach || null,
        suggested_messaging: analysis.suggested_messaging || null,
        freshness_status: "fresh",
        new_source_available: false,
        new_source_metadata: {},
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });

      // Populate research_signals from intelligence analysis
      const researchSignalRecords: any[] = [];
      if (analysis.relevant_datasets?.length > 0) {
        for (const rd of analysis.relevant_datasets.slice(0, 5)) {
          researchSignalRecords.push({
            client_id,
            topic: `Product fit: ${rd.dataset_name || 'Unknown'}`,
            strength: (rd.relevance_score || 0) >= 70 ? 'High' : (rd.relevance_score || 0) >= 40 ? 'Medium' : 'Low',
            source_type: 'Intelligence',
            notes: rd.reason || '',
            created_by: auth.userId,
          });
        }
      }
      if (analysis.strategy_summary) {
        researchSignalRecords.push({
          client_id,
          topic: `Strategy: ${analysis.strategy_summary.substring(0, 100)}`,
          strength: 'Medium',
          source_type: 'Intelligence',
          notes: `From ${playbook.label} run`,
          created_by: auth.userId,
        });
      }
      if (analysis.sector_exposure_summary) {
        researchSignalRecords.push({
          client_id,
          topic: `Sector exposure: ${analysis.sector_exposure_summary.substring(0, 100)}`,
          strength: 'Medium',
          source_type: 'Intelligence',
          notes: `From ${playbook.label} run`,
          created_by: auth.userId,
        });
      }
      if (researchSignalRecords.length > 0) {
        await sb.from("research_signals").insert(researchSignalRecords).then(({ error }) => {
          if (error) log.error("Failed to insert research signals", { detail: error.message });
        });
      }

      await updateStep(sb, sumStepId, {
        step_status: "completed", completed_at: new Date().toISOString(),
        output_summary: `Intelligence generated with confidence ${analysis.confidence_score || 50}%`,
        output_json: { confidence: analysis.confidence_score, dataset_count: relevantDatasets.length, signals_created: researchSignalRecords.length },
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

      return jsonResponse({ success: true, run_id: run.id, playbook: playbook.type, steps_completed: completedCount });

    } catch (processingError: any) {
      // Mark current step as failed
      const { data: runningSteps } = await sb.from("intelligence_run_steps").select("id").eq("run_id", run.id).eq("step_status", "running");
      for (const s of (runningSteps || [])) {
        await updateStep(sb, s.id, { step_status: "failed", error_message: processingError.message, completed_at: new Date().toISOString() });
      }
      await sb.from("fund_intelligence_runs").update({ run_status: "failed", error_message: processingError.message }).eq("id", run.id);
      log.error("Processing error", { detail: processingError.message, run_id: run.id });
      return errorResponse("An internal error occurred. Please try again.");
    }

  } catch (error: any) {
    log.error("Intelligence error", { detail: error.message || "Unknown error" });
    return errorResponse("An internal error occurred. Please try again.");
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────
function getTodayDate(): string { return new Date().toISOString().split("T")[0]; }
function getDateMonthsAgo(months: number): string { const d = new Date(); d.setMonth(d.getMonth() - months); return d.toISOString().split("T")[0]; }

function parseHoldingsXml(xml: string): any[] {
  const holdings: any[] = [];
  const entryRegex = /<(?:ns1:|)infoTable>([\s\S]*?)<\/(?:ns1:|)infoTable>/gi;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const get = (tag: string) => { const m = entry.match(new RegExp(`<(?:ns1:|)${tag}>([^<]*)<\/(?:ns1:|)${tag}>`, "i")); return m ? m[1].trim() : null; };
    const issuerName = get("nameOfIssuer");
    const cusip = get("cusip");
    const value = get("value");
    const shares = get("sshPrnamt");
    if (issuerName) {
      holdings.push({ issuerName, cusip, titleOfClass: get("titleOfClass"), ticker: null, value: value ? parseFloat(value) : 0, shares: shares ? parseInt(shares) : 0, sector: null });
    }
  }
  holdings.sort((a, b) => (b.value || 0) - (a.value || 0));
  return holdings;
}

async function resolveTickersFromInsightHub(holdings: any[], insightHub: any, sb: any): Promise<void> {
  if (holdings.length === 0) return;
  const tickerMap = new Map<string, string>();

  // Pass 1: CUSIP lookup via security_master (most reliable)
  const withCusip = holdings.filter((h) => h.cusip);
  if (withCusip.length > 0) {
    for (let i = 0; i < withCusip.length; i += 50) {
      const batch = withCusip.slice(i, i + 50);
      const cusips = batch.map((h) => h.cusip);
      const { data } = await sb.from("security_master").select("ticker, cusip").in("cusip", cusips);
      if (data) {
        for (const row of data) {
          if (row.ticker && row.cusip) tickerMap.set(row.cusip.toUpperCase(), row.ticker);
        }
      }
    }
    for (const h of holdings) {
      if (h.cusip && tickerMap.has(h.cusip.toUpperCase())) {
        h.ticker = tickerMap.get(h.cusip.toUpperCase())!;
      }
    }
  }

  // Pass 2: Name matching via security_master for unresolved holdings
  const unresolvedAfterCusip = holdings.filter((h) => !h.ticker && h.issuerName);
  if (unresolvedAfterCusip.length > 0) {
    const nameMap = new Map<string, string>();
    const uniqueNames = [...new Set(unresolvedAfterCusip.map((h) => h.issuerName))];
    for (let i = 0; i < uniqueNames.length; i += 20) {
      const batch = uniqueNames.slice(i, i + 20);
      const orFilter = batch.map((name) => `issuer_name.ilike.%${name.replace(/[%_'"(),\\]/g, "")}%`).join(",");
      const { data } = await sb.from("security_master").select("ticker, issuer_name").or(orFilter).limit(200);
      if (data) {
        for (const row of data) {
          if (!row.ticker) continue;
          for (const name of batch) {
            if (row.issuer_name?.toUpperCase().includes(name.toUpperCase()) || name.toUpperCase().includes(row.issuer_name?.toUpperCase())) {
              nameMap.set(name.toUpperCase(), row.ticker);
            }
          }
        }
      }
    }
    for (const h of unresolvedAfterCusip) {
      const ticker = nameMap.get(h.issuerName?.toUpperCase());
      if (ticker) h.ticker = ticker;
    }
  }

  // Pass 3: Insight Hub ticker_lists name matching (fallback)
  if (insightHub) {
    const unresolvedNames = [...new Set(holdings.filter((h) => !h.ticker && h.issuerName).map((h) => h.issuerName))];
    const ihMap = new Map<string, string>();

    for (let i = 0; i < unresolvedNames.length; i += 20) {
      const batch = unresolvedNames.slice(i, i + 20);
      const orFilter = batch.map((name) => `company_name.ilike.%${name.replace(/[%_'"(),\\]/g, "")}%`).join(",");
      const { data } = await insightHub.from("ticker_lists").select("ticker_symbol, company_name").or(orFilter).limit(200);
      if (data) { for (const row of data) { for (const name of batch) { if (row.company_name?.toUpperCase().includes(name.toUpperCase()) || name.toUpperCase().includes(row.company_name?.toUpperCase())) { ihMap.set(name.toUpperCase(), row.ticker_symbol); } } } }
    }
    for (let i = 0; i < unresolvedNames.length; i += 20) {
      const batch = unresolvedNames.slice(i, i + 20).filter((n) => !ihMap.has(n.toUpperCase()));
      if (batch.length === 0) continue;
      const orFilter = batch.map((name) => `company_name.ilike.%${name.replace(/[%_'"(),\\]/g, "")}%`).join(",");
      const { data } = await insightHub.from("trade_flows_ticker_lists").select("ticker_symbol, company_name").or(orFilter).limit(200);
      if (data) { for (const row of data) { for (const name of batch) { if (row.company_name?.toUpperCase().includes(name.toUpperCase()) || name.toUpperCase().includes(row.company_name?.toUpperCase())) { if (!ihMap.has(name.toUpperCase())) ihMap.set(name.toUpperCase(), row.ticker_symbol); } } } }
    }
    for (const h of holdings) {
      if (!h.ticker) {
        const ticker = ihMap.get(h.issuerName?.toUpperCase());
        if (ticker) h.ticker = ticker;
      }
    }
  }

  const resolved = holdings.filter((h) => h.ticker).length;
  log.info(`Resolved ${resolved}/${holdings.length} tickers`);
}
