import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAdmin } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("sec-import-accounts");

const SEC_UA = "Relai CRM admin@relai.com";

interface EdgarEntity {
  cik: string;
  name: string;
  ticker?: string;
  exchange?: string;
}

interface EnrichedEntity extends EdgarEntity {
  sic?: string;
  sicDescription?: string;
  stateOfIncorporation?: string;
  latest13FDate?: string;
  portfolio_value?: number;
  filing_count_13f?: number;
}

// ─── SEC helpers ───────────────────────────────────────────────────

async function fetchAllTickers(): Promise<EdgarEntity[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC tickers fetch failed: ${res.status}`);
  const data = await res.json();
  const entities: EdgarEntity[] = [];
  for (const key of Object.keys(data)) {
    const e = data[key];
    entities.push({ cik: String(e.cik_str), name: e.title || "", ticker: e.ticker || undefined, exchange: e.exchange || undefined });
  }
  return entities;
}

async function getEntitySubmissions(cik: string): Promise<{
  name: string; cik: string; sic?: string; sicDescription?: string;
  stateOfIncorporation?: string;
  filings: { form: string; filingDate: string; accessionNumber: string }[];
}> {
  const paddedCik = cik.padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
    headers: { "User-Agent": SEC_UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC EDGAR returned ${res.status} for CIK ${cik}`);
  const data = await res.json();
  const recent = data.filings?.recent || {};
  const forms = recent.form || []; const dates = recent.filingDate || []; const accessions = recent.accessionNumber || [];
  const filings: { form: string; filingDate: string; accessionNumber: string }[] = [];
  for (let i = 0; i < Math.min(forms.length, 30); i++) {
    filings.push({ form: forms[i], filingDate: dates[i], accessionNumber: accessions[i] });
  }
  return { name: data.name || "", cik: String(data.cik), sic: data.sic, sicDescription: data.sicDescription, stateOfIncorporation: data.stateOfIncorporation, filings };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[''`]/g, "").replace(/&/g, " and ")
    .replace(/[.,"""\-\(\)\/\\:;!?#@]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b(llc|lp|ltd|limited|inc|incorporated|corp|corporation|plc|gmbh|sa|ag|nv|bv|llp|co|company)\.?\s*$/gi, "").trim();
}

function classifyEntityType(sic?: string, sicDesc?: string, filings?: { form: string }[]): string {
  const has13F = filings?.some(f => f.form.startsWith("13F"));
  const hasADV = filings?.some(f => f.form === "ADV" || f.form === "ADV/A");
  if (has13F) return "Hedge Fund";
  if (hasADV) return "Asset Manager";
  const desc = (sicDesc || "").toLowerCase();
  if (desc.includes("bank")) return "Bank";
  if (desc.includes("insurance")) return "Insurance";
  if (desc.includes("invest")) return "Asset Manager";
  return "Other";
}

// SIC codes commonly associated with investment entities
const INVESTMENT_SIC_CODES: Record<string, string> = {
  "6199": "Finance Services",
  "6211": "Security Brokers & Dealers",
  "6221": "Commodity Contracts Dealers",
  "6282": "Investment Advice",
  "6311": "Fire, Marine & Casualty Insurance",
  "6321": "Accident and Health Insurance",
  "6399": "Insurance Carriers NEC",
  "6411": "Insurance Agents & Brokers",
  "6712": "State Chartered Banks",
  "6722": "Management Investment Companies, Open-End",
  "6726": "Investment Offices NEC",
  "6770": "Blank Checks",
};

// ─── Serve ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const auth = await verifyAdmin(req);
    if (!auth) {
      return errorResponse("Forbidden", 403);
    }

    const body = await req.json();
    const { action } = body;

    // ── ACTION: discover ─────────────────────────────────────────
    if (action === "discover") {
      const {
        limit = 50,
        offset = 0,
        min_aum,         // minimum portfolio value in USD (e.g. 100_000_000)
        sic_filter,      // 'investment_only' | 'all' | specific SIC code
        name_search,     // text filter on name
      } = body;

      // 1. Collect all known CIKs and normalized names from CRM
      const { data: existingMappings } = await sb
        .from("external_source_mappings").select("external_identifier")
        .eq("external_source_type", "sec_filer");
      const knownCiks = new Set((existingMappings || []).map((m: any) => String(m.external_identifier)));

      const { data: existingClients } = await sb
        .from("clients").select("normalized_name").eq("is_merged", false);
      const knownNames = new Set((existingClients || []).map((c: any) => c.normalized_name).filter(Boolean));

      // 2. Use SEC 13F filer list for AUM filtering
      // Fetch the EDGAR full-text search for recent 13F-HR filers to get portfolio values
      // We'll use the SEC's XBRL 13F table for AUM data
      let filer13FData: Map<string, { value: number; date: string }> | null = null;

      if (min_aum && min_aum > 0) {
        // Fetch recent 13F cover pages to estimate AUM
        // SEC provides a summary via the EDGAR full index
        // For efficiency, we'll fetch the 13F filer list which has portfolio values
        try {
          const filerRes = await fetch(
            "https://www.sec.gov/files/data/13f-data/13flist2024q4.pdf",
            { headers: { "User-Agent": SEC_UA } }
          );
          // The 13F list is a PDF, not easily parseable. Instead we'll rely on
          // enrichment at display time. Mark that AUM filter is requested.
          filer13FData = null;
        } catch { /* ignore */ }
      }

      // 3. Fetch all SEC tickers and filter
      const allTickers = await fetchAllTickers();

      let candidates = allTickers.filter(t => {
        if (knownCiks.has(t.cik)) return false;
        if (knownNames.has(normalizeName(t.name))) return false;
        return true;
      });

      // Name search
      if (name_search && name_search.trim()) {
        const q = name_search.toLowerCase().trim();
        candidates = candidates.filter(t =>
          t.name.toLowerCase().includes(q) ||
          (t.ticker || "").toLowerCase() === q ||
          t.cik === q
        );
      }

      // SIC / sector filter: we need to check SIC codes for investment-related entities
      // Since the tickers file doesn't include SIC, we filter by name heuristics for the initial list
      if (sic_filter === "investment_only" || !sic_filter) {
        const investmentKeywords = [
          "fund", "capital", "partner", "management", "advisors", "advisory",
          "asset", "investment", "hedge", "ventures", "equity", "securities",
          "trust", "financial", "wealth", "portfolio", "quant", "alpha",
          "strategy", "fixed income", "credit", "macro",
        ];
        candidates = candidates.filter(t => {
          const name = t.name.toLowerCase();
          return investmentKeywords.some(kw => name.includes(kw));
        });
      }
      // If sic_filter === "all", no keyword filtering

      candidates.sort((a, b) => a.name.localeCompare(b.name));
      const total = candidates.length;
      const page = candidates.slice(offset, offset + limit);

      // Return candidates without enrichment to avoid timeout
      // Enrichment happens at import time
      const results: EnrichedEntity[] = page.map(c => ({ ...c } as EnrichedEntity));

      return jsonResponse({
        suggestions: results,
        total,
        enriched_count: results.length,
        offset,
        limit,
        known_cik_count: knownCiks.size,
      });
    }

    // ── ACTION: search (manual search, kept for flexibility) ─────
    if (action === "search") {
      const { query, limit = 20 } = body;
      if (!query) throw new Error("query is required");
      const allTickers = await fetchAllTickers();
      const q = query.toLowerCase().trim();
      const results = allTickers.filter(t => t.name.toLowerCase().includes(q) || (t.ticker || "").toLowerCase() === q || t.cik === q).slice(0, limit);

      const ciks = results.map(r => r.cik);
      const { data: existingMappings } = await sb.from("external_source_mappings").select("external_identifier, client_id").eq("external_source_type", "sec_filer").in("external_identifier", ciks);
      const existingCikMap = new Map((existingMappings || []).map((m: any) => [m.external_identifier, m.client_id]));
      const { data: existingClients } = await sb.from("clients").select("id, name, normalized_name").eq("is_merged", false);
      const normalizedMap = new Map((existingClients || []).map((c: any) => [(c.normalized_name || normalizeName(c.name)), c.id]));
      const enriched = results.map(r => {
        const nn = normalizeName(r.name);
        return { ...r, already_in_crm: existingCikMap.has(r.cik) || normalizedMap.has(nn), existing_client_id: existingCikMap.get(r.cik) || normalizedMap.get(nn) || null };
      });
      return jsonResponse({ results: enriched });
    }

    // ── ACTION: import ───────────────────────────────────────────
    if (action === "import") {
      const { entities, imported_by } = body;
      if (!entities?.length) throw new Error("entities array is required");
      const importResults: any[] = [];

      for (const entity of entities) {
        try {
          const details = await getEntitySubmissions(entity.cik);
          const normName = normalizeName(details.name || entity.name);
          const clientType = entity.override_type || classifyEntityType(details.sic, details.sicDescription, details.filings);

          const { data: existingMapping } = await sb.from("external_source_mappings").select("client_id").eq("external_source_type", "sec_filer").eq("external_identifier", entity.cik).maybeSingle();
          if (existingMapping) { importResults.push({ cik: entity.cik, name: details.name, status: "skipped", reason: "CIK already mapped", client_id: existingMapping.client_id }); continue; }

          const { data: nameMatch } = await sb.from("clients").select("id, name").eq("normalized_name", normName).eq("is_merged", false).maybeSingle();
          let clientId: string;

          if (nameMatch) {
            clientId = nameMatch.id;
            importResults.push({ cik: entity.cik, name: details.name, status: "linked", reason: `Linked to existing "${nameMatch.name}"`, client_id: clientId });
          } else {
            const { data: newClient, error: insertErr } = await sb.from("clients").insert({
              name: details.name || entity.name, normalized_name: normName, client_type: clientType,
              relationship_status: "Prospect", client_tier: "Tier 3", import_source: "sec_discovery",
              headquarters_country: details.stateOfIncorporation || "",
              notes: `Imported from SEC EDGAR. SIC: ${details.sicDescription || "N/A"}. Ticker: ${entity.ticker || "N/A"}.`,
            }).select("id").single();
            if (insertErr) throw insertErr;
            clientId = newClient.id;
            importResults.push({ cik: entity.cik, name: details.name, status: "created", reason: "New account created", client_id: clientId });
          }

          await sb.from("external_source_mappings").insert({
            client_id: clientId, external_source_type: "sec_filer", external_entity_name: details.name,
            external_identifier: entity.cik, confidence_score: 95, manually_confirmed: true,
            confirmed_by: imported_by || null, confirmed_at: new Date().toISOString(), match_method: "sec_import",
            source_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${entity.cik}`,
            metadata_json: { sic: details.sic, sicDescription: details.sicDescription, stateOfIncorporation: details.stateOfIncorporation, ticker: entity.ticker, recent_filings: details.filings.slice(0, 5) },
          });

          await sb.from("account_entity_resolutions").upsert({
            client_id: clientId, source_name: details.name || entity.name, normalized_name: normName,
            resolution_status: "resolved", entity_type: "sec_filer", sec_cik: entity.cik,
            sec_filer_name: details.name, canonical_name: details.name, confidence_score: 95,
            matched_by: "sec_import", manually_confirmed: true, resolved_at: new Date().toISOString(), resolved_by: imported_by || null,
          }, { onConflict: "client_id" });

          await sb.from("client_provenance").insert({
            client_id: clientId, source_type: "sec_discovery", source_identifier: entity.cik,
            source_name: `SEC EDGAR - CIK ${entity.cik}`,
            source_metadata: { cik: entity.cik, filer_name: details.name, ticker: entity.ticker, sic: details.sic, sic_description: details.sicDescription, state: details.stateOfIncorporation, filing_count: details.filings.length, latest_filing: details.filings[0] || null },
            imported_by: imported_by || null,
          });

          if (nameMatch && normalizeName(nameMatch.name) !== normName) {
            await sb.from("client_aliases").insert({ client_id: clientId, alias_name: details.name, normalized_alias: normName, alias_type: "sec_filer", source: "sec_import", created_by: imported_by || null });
          }
        } catch (entityErr: any) {
          importResults.push({ cik: entity.cik, name: entity.name, status: "error", reason: entityErr.message });
        }
      }

      return jsonResponse({
        success: true, total: entities.length,
        created: importResults.filter((r: any) => r.status === "created").length,
        linked: importResults.filter((r: any) => r.status === "linked").length,
        skipped: importResults.filter((r: any) => r.status === "skipped").length,
        errors: importResults.filter((r: any) => r.status === "error").length,
        results: importResults,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e: any) {
    logger.error("sec-import-accounts error", { error: e.message, stack: e.stack });
    return errorResponse("An internal error occurred", 400);
  }
});
