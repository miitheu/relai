import type { FunctionContext } from "./utils";

const SEC_UA = "Relai CRM admin@relai.com";
const SEC_HEADERS = { "User-Agent": SEC_UA, Accept: "application/json" };

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[''`]/g, "").replace(/&/g, " and ")
    .replace(/[.,"""\-()\/\\:;!?#@]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(llc|lp|ltd|limited|inc|incorporated|corp|corporation|plc|gmbh|sa|ag|nv|bv|llp|co|company)\.?\s*$/gi, "").trim();
}

function classifyEntityType(filings?: { form: string }[]): string {
  const has13F = filings?.some(f => f.form.startsWith("13F"));
  const hasADV = filings?.some(f => f.form === "ADV" || f.form === "ADV/A");
  if (has13F) return "Hedge Fund";
  if (hasADV) return "Asset Manager";
  return "Other";
}

async function fetchAllTickers(): Promise<{ cik: string; name: string; ticker?: string; exchange?: string }[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`SEC tickers fetch failed: ${res.status}`);
  const data = await res.json();
  const entities: any[] = [];
  for (const key of Object.keys(data)) {
    const e = data[key];
    entities.push({ cik: String(e.cik_str), name: e.title || "", ticker: e.ticker, exchange: e.exchange });
  }
  return entities;
}

async function getEntitySubmissions(cik: string) {
  const paddedCik = cik.padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
  if (!res.ok) throw new Error(`SEC EDGAR returned ${res.status} for CIK ${cik}`);
  const data = await res.json();
  const recent = data.filings?.recent || {};
  const forms = recent.form || []; const dates = recent.filingDate || []; const accessions = recent.accessionNumber || [];
  const filings: { form: string; filingDate: string; accessionNumber: string }[] = [];
  for (let i = 0; i < Math.min(forms.length, 30); i++) filings.push({ form: forms[i], filingDate: dates[i], accessionNumber: accessions[i] });
  return { name: data.name || "", cik: String(data.cik), sic: data.sic, sicDescription: data.sicDescription, stateOfIncorporation: data.stateOfIncorporation, filings };
}

// ── SEC Import ──
export async function secImportAccounts(ctx: FunctionContext) {
  const { sql, userId, body } = ctx;

  // Check admin role
  const roleRows = await sql`SELECT role FROM user_roles WHERE user_id = ${userId} AND role = 'admin' LIMIT 1`;
  if (roleRows.length === 0) return { data: null, error: { message: "Forbidden: admin role required" } };

  const { action } = body;

  if (action === "discover") {
    const { limit: lim = 50, offset = 0, name_search, sic_filter } = body;
    const existingMappings = await sql`SELECT external_identifier FROM external_source_mappings WHERE external_source_type = 'sec_filer'`;
    const knownCiks = new Set(existingMappings.map((m: any) => String(m.external_identifier)));
    const existingClients = await sql`SELECT normalized_name FROM clients WHERE is_merged = false`;
    const knownNames = new Set(existingClients.map((c: any) => c.normalized_name).filter(Boolean));

    const allTickers = await fetchAllTickers();
    let candidates = allTickers.filter(t => !knownCiks.has(t.cik) && !knownNames.has(normalizeName(t.name)));

    if (name_search?.trim()) {
      const q = name_search.toLowerCase().trim();
      candidates = candidates.filter((t: any) => t.name.toLowerCase().includes(q) || (t.ticker || "").toLowerCase() === q || t.cik === q);
    }

    if (sic_filter === "investment_only" || !sic_filter) {
      const kw = ["fund", "capital", "partner", "management", "advisors", "advisory", "asset", "investment", "hedge", "ventures", "equity", "securities", "trust", "financial", "wealth"];
      candidates = candidates.filter((t: any) => kw.some(k => t.name.toLowerCase().includes(k)));
    }

    candidates.sort((a, b) => a.name.localeCompare(b.name));
    return { data: { suggestions: candidates.slice(offset, offset + lim), total: candidates.length, offset, limit: lim, known_cik_count: knownCiks.size } };
  }

  if (action === "search") {
    const { query, limit: lim = 20 } = body;
    if (!query) return { data: null, error: { message: "query is required" } };
    const allTickers = await fetchAllTickers();
    const q = query.toLowerCase().trim();
    const results = allTickers.filter((t: any) => t.name.toLowerCase().includes(q) || (t.ticker || "").toLowerCase() === q || t.cik === q).slice(0, lim);
    return { data: { results } };
  }

  if (action === "import") {
    const { entities, imported_by } = body;
    if (!entities?.length) return { data: null, error: { message: "entities array is required" } };
    const importResults: any[] = [];

    for (const entity of entities) {
      try {
        const details = await getEntitySubmissions(entity.cik);
        const normName = normalizeName(details.name || entity.name);
        const clientType = entity.override_type || classifyEntityType(details.filings);

        const existingMapping = await sql`SELECT client_id FROM external_source_mappings WHERE external_source_type = 'sec_filer' AND external_identifier = ${entity.cik} LIMIT 1`;
        if (existingMapping.length > 0) { importResults.push({ cik: entity.cik, name: details.name, status: "skipped", reason: "CIK already mapped", client_id: existingMapping[0].client_id }); continue; }

        const nameMatch = await sql`SELECT id, name FROM clients WHERE normalized_name = ${normName} AND is_merged = false LIMIT 1`;
        let clientId: string;

        if (nameMatch.length > 0) {
          clientId = nameMatch[0].id;
          importResults.push({ cik: entity.cik, name: details.name, status: "linked", reason: `Linked to "${nameMatch[0].name}"`, client_id: clientId });
        } else {
          const newClient = await sql`
            INSERT INTO clients (name, normalized_name, client_type, relationship_status, client_tier, import_source, headquarters_country, notes)
            VALUES (${details.name || entity.name}, ${normName}, ${clientType}, 'Prospect', 'Tier 3', 'sec_discovery', ${details.stateOfIncorporation || ""}, ${"Imported from SEC EDGAR. SIC: " + (details.sicDescription || "N/A")})
            RETURNING id
          `;
          clientId = newClient[0].id;
          importResults.push({ cik: entity.cik, name: details.name, status: "created", reason: "New account created", client_id: clientId });
        }

        await sql`
          INSERT INTO external_source_mappings (client_id, external_source_type, external_entity_name, external_identifier, confidence_score, manually_confirmed, confirmed_by, confirmed_at, match_method, source_url, metadata_json)
          VALUES (${clientId}, 'sec_filer', ${details.name}, ${entity.cik}, 95, true, ${imported_by || null}, now(), 'sec_import', ${"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + entity.cik}, ${JSON.stringify({ sic: details.sic, sicDescription: details.sicDescription, stateOfIncorporation: details.stateOfIncorporation, ticker: entity.ticker, recent_filings: details.filings.slice(0, 5) })}::jsonb)
        `;

        await sql`
          INSERT INTO account_entity_resolutions (client_id, source_name, normalized_name, resolution_status, entity_type, sec_cik, sec_filer_name, canonical_name, confidence_score, matched_by, manually_confirmed, resolved_at)
          VALUES (${clientId}, ${details.name}, ${normName}, 'resolved', 'sec_filer', ${entity.cik}, ${details.name}, ${details.name}, 95, 'sec_import', true, now())
          ON CONFLICT (client_id) DO UPDATE SET resolution_status = 'resolved', sec_cik = ${entity.cik}, sec_filer_name = ${details.name}, canonical_name = ${details.name}, confidence_score = 95, resolved_at = now()
        `;
      } catch (err: unknown) {
        importResults.push({ cik: entity.cik, name: entity.name, status: "error", reason: err instanceof Error ? err.message : "Unknown" });
      }
    }

    return { data: { success: true, total: entities.length, created: importResults.filter(r => r.status === "created").length, linked: importResults.filter(r => r.status === "linked").length, skipped: importResults.filter(r => r.status === "skipped").length, errors: importResults.filter(r => r.status === "error").length, results: importResults } };
  }

  return { data: null, error: { message: `Unknown action: ${action}` } };
}

// ── SEC Freshness Check ──
export async function secFreshnessCheck(ctx: FunctionContext) {
  const { sql, body } = ctx;
  const { client_id } = body;
  if (!client_id) return { data: null, error: { message: "client_id required" } };

  const clients = await sql`SELECT name, client_type FROM clients WHERE id = ${client_id} LIMIT 1`;
  if (clients.length === 0) return { data: null, error: { message: "Client not found" } };

  const lastRuns = await sql`
    SELECT id, filing_date, filing_cik, filing_url, created_at, playbook_type FROM fund_intelligence_runs
    WHERE client_id = ${client_id} AND run_status = 'completed' ORDER BY created_at DESC LIMIT 1
  `;
  const lastRun = lastRuns[0];
  const lastCik = lastRun?.filing_cik;
  const lastFilingDate = lastRun?.filing_date;

  if (!lastCik) {
    const searchName = clients[0].name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    let discoveredCik: string | null = null;
    let latestFilingDate: string | null = null;
    try {
      const resp = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=13F-HR&from=0&size=1`, { headers: SEC_HEADERS });
      if (resp.ok) {
        const data = await resp.json();
        if (data.hits?.hits?.length > 0) { discoveredCik = data.hits.hits[0]._source?.ciks?.[0]; latestFilingDate = data.hits.hits[0]._source?.file_date; }
      }
    } catch {}
    return { data: { has_sec_data: false, cik: discoveredCik, latest_filing_available: latestFilingDate ? { date: latestFilingDate, cik: discoveredCik } : null, last_processed_filing: null, new_filing_available: !!latestFilingDate, freshness_status: "no_data" } };
  }

  const paddedCik = lastCik.padStart(10, "0");
  let latestFiling: any = null;
  try {
    const subResp = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
    if (subResp.ok) {
      const subData = await subResp.json();
      const recent = subData.filings?.recent;
      if (recent) {
        const idx = recent.form?.findIndex((f: string) => f === "13F-HR" || f === "13F-HR/A");
        if (idx >= 0) {
          const accession = recent.accessionNumber[idx].replace(/-/g, "");
          latestFiling = { date: recent.filingDate[idx], type: recent.form[idx], accession: recent.accessionNumber[idx], url: `https://www.sec.gov/Archives/edgar/data/${lastCik}/${accession}/${recent.primaryDocument[idx]}` };
        }
      }
    }
  } catch {}

  const newFilingAvailable = latestFiling && lastFilingDate && latestFiling.date > lastFilingDate;
  const lastRunAge = lastRun ? Math.floor((Date.now() - new Date(lastRun.created_at).getTime()) / 86400000) : null;

  let freshness_status = "fresh";
  if (newFilingAvailable) freshness_status = "new_source_available";
  else if (lastRunAge && lastRunAge > 90) freshness_status = "stale";
  else if (lastRunAge && lastRunAge > 30) freshness_status = "aging";

  // Update summary
  if (newFilingAvailable && latestFiling) {
    await sql`UPDATE account_intelligence_summaries SET freshness_status = ${freshness_status}, freshness_checked_at = now(), new_source_available = true, new_source_metadata = ${JSON.stringify({ filing_date: latestFiling.date, filing_type: latestFiling.type, filing_url: latestFiling.url, detected_at: new Date().toISOString() })}::jsonb WHERE client_id = ${client_id}`;
  } else {
    await sql`UPDATE account_intelligence_summaries SET freshness_status = ${freshness_status}, freshness_checked_at = now() WHERE client_id = ${client_id}`;
  }

  return {
    data: {
      has_sec_data: true, cik: lastCik,
      last_processed_filing: { date: lastFilingDate, run_id: lastRun?.id, run_date: lastRun?.created_at },
      latest_filing_available: latestFiling, new_filing_available: !!newFilingAvailable,
      freshness_status, days_since_last_run: lastRunAge,
    },
  };
}
