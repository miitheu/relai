import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { webSearch } from "../_shared/web-search.ts";

const logger = createLogger("resolve-entity");

const SEC_HEADERS = {
  "User-Agent": "Relai CRM support@relai.com",
  Accept: "application/json",
};

// ─── LEGAL SUFFIXES ──────────────────────────────────────────────────
const LEGAL_SUFFIXES = [
  "llc", "l\\.?l\\.?c\\.?", "lp", "l\\.?p\\.?", "ltd", "limited",
  "inc", "incorporated", "corp", "corporation", "plc", "gmbh",
  "sa", "ag", "nv", "bv", "llp", "l\\.?l\\.?p\\.?", "co", "company",
];
const LEGAL_SUFFIX_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\.?\\s*$`, "gi");
const LEGAL_SUFFIX_INLINE_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\.?\\b`, "gi");

const BUSINESS_WORDS = [
  "management", "advisors", "adviser", "advisory", "capital",
  "holdings", "partners", "investments", "asset management",
  "group", "fund", "funds", "global", "international",
  "associates", "financial", "securities", "investment",
  "strategies", "strategy", "asset", "wealth",
];
const BUSINESS_WORD_RE = new RegExp(`\\b(${BUSINESS_WORDS.join("|")})\\b`, "gi");

// ─── NORMALIZATION ──────────────────────────────────────────────────
function normalizeBasic(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[.,''"""\-\(\)\/\\]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeSansLegal(name: string): string {
  let n = normalizeBasic(name);
  let prev = "";
  while (prev !== n) { prev = n; n = n.replace(LEGAL_SUFFIX_RE, "").trim(); }
  n = n.replace(LEGAL_SUFFIX_INLINE_RE, " ").replace(/\s+/g, " ").trim();
  return n;
}

function normalizeCore(name: string): string {
  return normalizeSansLegal(name).replace(BUSINESS_WORD_RE, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] { return s.split(/\s+/).filter(Boolean); }

function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string) => { const arr: string[] = []; for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2)); return arr; };
  const ba = bigrams(a); const bb = bigrams(b);
  if (ba.length + bb.length === 0) return 0;
  const setB = new Set(bb); let inter = 0;
  for (const bg of ba) if (setB.has(bg)) inter++;
  return (2 * inter) / (ba.length + bb.length);
}

function tokenContainment(query: string, candidate: string): number {
  const tq = tokens(query); const tc = new Set(tokens(candidate));
  if (tq.length === 0) return 0;
  let contained = 0; for (const t of tq) if (tc.has(t)) contained++;
  return contained / tq.length;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a)); const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let overlap = 0; for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

// ─── SCORING ────────────────────────────────────────────────────────
function scoreCandidate(sourceName: string, candidateName: string, aliasNames: string[]): { confidence: number; match_method: string; match_reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0;
  let method = "none";

  const srcBasic = normalizeBasic(sourceName);
  const srcSansLegal = normalizeSansLegal(sourceName);
  const srcCore = normalizeCore(sourceName);
  const candBasic = normalizeBasic(candidateName);
  const candSansLegal = normalizeSansLegal(candidateName);
  const candCore = normalizeCore(candidateName);

  if (srcBasic === candBasic) return { confidence: 98, match_method: "exact", match_reasons: ["Exact name match"] };
  if (srcSansLegal === candSansLegal && srcSansLegal.length > 2) return { confidence: 95, match_method: "exact_sans_legal", match_reasons: [`Exact after removing legal suffixes: "${srcSansLegal}"`] };
  if (srcCore === candCore && srcCore.length > 2) { confidence = 88; method = "core_match"; reasons.push(`Core name match: "${srcCore}"`); }

  const srcToks = tokens(srcSansLegal);
  const containment = tokenContainment(srcSansLegal, candSansLegal);
  if (containment === 1.0 && srcToks.length >= 2) {
    const bonus = srcToks.length >= 3 ? 92 : 90;
    if (bonus > confidence) { confidence = bonus; method = "token_containment"; reasons.push("All source tokens found in candidate"); }
  }

  const overlap = tokenOverlap(srcSansLegal, candSansLegal);
  if (overlap >= 0.8) { const s = Math.round(75 + overlap * 20); if (s > confidence) { confidence = s; method = "token_overlap"; reasons.push(`Token overlap: ${Math.round(overlap * 100)}%`); } }

  const diceSL = diceCoefficient(srcSansLegal, candSansLegal);
  if (diceSL > 0.7) { const s = Math.round(60 + diceSL * 35); if (s > confidence) { confidence = s; method = "fuzzy_sans_legal"; reasons.push(`Fuzzy (suffix-stripped): ${Math.round(diceSL * 100)}%`); } }

  const diceC = diceCoefficient(srcCore, candCore);
  if (diceC > 0.7) { const s = Math.round(55 + diceC * 35); if (s > confidence) { confidence = s; method = "fuzzy_core"; reasons.push(`Fuzzy (core): ${Math.round(diceC * 100)}%`); } }

  for (const alias of aliasNames) {
    const aN = normalizeSansLegal(alias);
    if (aN === candSansLegal) { reasons.push(`Alias match: "${alias}"`); if (confidence < 95) { confidence = 95; method = "alias_match"; } }
    else { const ad = diceCoefficient(aN, candSansLegal); if (ad > 0.8 && confidence < 85) { reasons.push(`Fuzzy alias: "${alias}" → ${Math.round(ad * 100)}%`); confidence = Math.round(70 + ad * 20); method = "alias_fuzzy"; } }
  }

  if (confidence === 0) {
    const bd = diceCoefficient(srcBasic, candBasic);
    confidence = Math.round(bd * 60); method = bd > 0.5 ? "fuzzy_low" : "weak";
    if (bd > 0.3) reasons.push(`Basic similarity: ${Math.round(bd * 100)}%`);
  }

  return { confidence: Math.min(confidence, 98), match_method: method, match_reasons: reasons };
}

// ─── ENTITY TYPE CLASSIFICATION ─────────────────────────────────────
function classifyEntityType(clientType: string): string {
  const ct = (clientType || "").toLowerCase();
  if (ct.includes("hedge fund")) return "hedge_fund";
  if (ct.includes("asset manager") || ct.includes("investment")) return "asset_manager";
  if (ct.includes("bank") || ct.includes("financial")) return "bank";
  if (ct.includes("vendor") || ct.includes("data provider")) return "data_vendor";
  if (ct.includes("fund") || ct.includes("mutual") || ct.includes("etf")) return "asset_manager";
  return "corporate";
}

function getSourceTypes(entityType: string): string[] {
  switch (entityType) {
    case "hedge_fund":
    case "asset_manager":
      return ["sec_adviser", "sec_issuer", "ticker"];
    case "corporate":
    case "public_company":
      return ["sec_issuer", "ticker", "company_filings"];
    case "bank":
      return ["sec_issuer", "ticker", "company_filings"];
    case "data_vendor":
      return ["website_domain"];
    default:
      return ["sec_issuer", "company_filings"];
  }
}

// ─── SEC EDGAR SEARCH ───────────────────────────────────────────────
async function searchEDGAR(searchTerm: string, formTypes: string): Promise<{ name: string; cik: string; filing_date: string | null; filing_type: string | null }[]> {
  const results: any[] = [];
  const cleanTerm = searchTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  if (!cleanTerm || cleanTerm.length < 2) return results;

  // Exact phrase search
  try {
    const resp = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(cleanTerm)}%22&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
    if (resp.ok) {
      const data = await resp.json();
      for (const hit of (data.hits?.hits || [])) {
        const src = hit._source || {};
        const filerName = src.display_names?.[0] || src.entity_name || "";
        const hitCik = src.ciks?.[0] || "";
        if (hitCik && filerName && !results.some((r: any) => r.cik === hitCik)) {
          results.push({ name: filerName, cik: hitCik, filing_date: src.file_date || null, filing_type: src.form_type || null });
        }
      }
    }
  } catch {}

  await new Promise(r => setTimeout(r, 120));

  // Broad search if few results
  if (results.length < 3) {
    try {
      const resp = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(cleanTerm)}&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
      if (resp.ok) {
        const data = await resp.json();
        for (const hit of (data.hits?.hits || [])) {
          const src = hit._source || {};
          const filerName = src.display_names?.[0] || src.entity_name || "";
          const hitCik = src.ciks?.[0] || "";
          if (hitCik && filerName && !results.some((r: any) => r.cik === hitCik)) {
            results.push({ name: filerName, cik: hitCik, filing_date: src.file_date || null, filing_type: src.form_type || null });
          }
        }
      }
    } catch {}
  }

  return results;
}

// ─── SECURITY MASTER + INSIGHT HUB SEARCH ──────────────────────────
async function searchSecurityMaster(sb: any, searchTerms: Set<string>): Promise<{ name: string; cik: string; filing_date: string | null; filing_type: string | null; source: string }[]> {
  const results: any[] = [];
  const seenIds = new Set<string>();

  for (const term of searchTerms) {
    if (!term || term.length < 2) continue;
    const safeTerm = term.replace(/[%_'"]/g, "");

    // Name search
    const { data } = await sb.from("security_master").select("id, ticker, issuer_name, cusip, sector").ilike("issuer_name", `%${safeTerm}%`).limit(10);
    if (data) {
      for (const row of data) {
        const key = row.ticker || row.id;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          results.push({ name: row.issuer_name, cik: row.ticker || row.cusip || row.id, filing_date: null, filing_type: row.sector || null, source: "security_master" });
        }
      }
    }

    // Ticker match (if term looks like a ticker: all uppercase, 1-5 chars)
    if (/^[A-Z]{1,5}$/.test(term.toUpperCase()) && term.length <= 5) {
      const { data: tickerData } = await sb.from("security_master").select("id, ticker, issuer_name, cusip, sector").eq("ticker", term.toUpperCase()).limit(5);
      if (tickerData) {
        for (const row of tickerData) {
          const key = row.ticker || row.id;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            results.push({ name: row.issuer_name, cik: row.ticker || row.cusip || row.id, filing_date: null, filing_type: row.sector || null, source: "security_master" });
          }
        }
      }
    }
  }
  return results;
}

async function searchInsightHub(searchTerms: Set<string>): Promise<{ name: string; cik: string; filing_date: string | null; filing_type: string | null; source: string }[]> {
  const insightHubUrl = Deno.env.get("INSIGHT_HUB_URL");
  const insightHubKey = Deno.env.get("INSIGHT_HUB_ANON_KEY");
  if (!insightHubUrl || !insightHubKey) return [];

  const ih = createClient(insightHubUrl, insightHubKey);
  const results: any[] = [];
  const seenTickers = new Set<string>();

  for (const term of searchTerms) {
    if (!term || term.length < 2) continue;
    const safeTerm = term.replace(/[%_'"]/g, "");

    for (const table of ["ticker_lists", "trade_flows_ticker_lists"]) {
      const { data } = await ih.from(table).select("ticker_symbol, company_name").ilike("company_name", `%${safeTerm}%`).limit(10);
      if (data) {
        for (const row of data) {
          if (row.ticker_symbol && !seenTickers.has(row.ticker_symbol)) {
            seenTickers.add(row.ticker_symbol);
            results.push({ name: row.company_name, cik: row.ticker_symbol, filing_date: null, filing_type: null, source: "insight_hub" });
          }
        }
      }
    }
  }
  return results;
}

async function searchWeb(clientName: string): Promise<{ name: string; cik: string; filing_date: string | null; filing_type: string | null; source: string }[]> {
  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (!braveKey) return [];

  try {
    const searchResults = await webSearch(`"${clientName}" company official site`, { count: 5 });
    const results: any[] = [];
    const seenNames = new Set<string>();

    for (const r of searchResults.results) {
      // Extract likely company name from title (take before " - " or " | " separators)
      let name = r.title.split(/\s[-|–—]\s/)[0].trim();
      // Remove common suffixes like "Home", "Official Site"
      name = name.replace(/\s*(home|official site|website|homepage)$/i, "").trim();
      if (name.length >= 2 && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        // Extract domain as identifier
        const domain = new URL(r.url).hostname.replace("www.", "");
        results.push({ name, cik: domain, filing_date: null, filing_type: null, source: "web_search" });
      }
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { client_id, action, sec_cik, sec_filer_name, additional_matches, source_type, external_identifier, external_name } = await req.json();
    if (!client_id) throw new Error("client_id required");

    // ─── MANUAL CONFIRM action ────────────────────────────────────
    if (action === "confirm") {
      // Support both legacy SEC confirm and universal confirm
      const extSourceType = source_type || "sec_adviser";
      const extIdentifier = external_identifier || sec_cik;
      const extName = external_name || sec_filer_name;
      if (!extIdentifier || !extName) throw new Error("external identifier and name required for confirm");

      // Update core resolution
      const { error } = await sb.from("account_entity_resolutions").update({
        sec_cik: sec_cik || extIdentifier,
        sec_filer_name: sec_filer_name || extName,
        canonical_name: extName,
        resolution_status: "manually_confirmed",
        confidence_score: 100,
        matched_by: "manual",
        manually_confirmed: true,
        resolved_at: new Date().toISOString(),
      }).eq("client_id", client_id);
      if (error) throw error;

      // Get resolution ID for mapping
      const { data: resData } = await sb.from("account_entity_resolutions").select("id").eq("client_id", client_id).single();

      // Upsert external source mapping
      const allMatches = additional_matches && Array.isArray(additional_matches)
        ? additional_matches
        : [{ cik: extIdentifier, name: extName, source_type: extSourceType }];

      for (const match of allMatches) {
        const matchSourceType = match.source_type || extSourceType;
        const matchIdentifier = match.cik || match.external_identifier || extIdentifier;
        const matchName = match.name || match.external_name || extName;

        await sb.from("external_source_mappings").upsert({
          client_id,
          resolution_id: resData?.id,
          external_source_type: matchSourceType,
          external_entity_name: matchName,
          external_identifier: matchIdentifier,
          confidence_score: 100,
          match_method: "manual",
          match_reasons: ["Manually confirmed by user"],
          manually_confirmed: true,
          confirmed_at: new Date().toISOString(),
        }, { onConflict: "client_id,external_source_type,external_identifier" });

        // Also store as alias
        const normName = normalizeSansLegal(matchName);
        const { data: existingAliases } = await sb.from("client_aliases").select("normalized_alias").eq("client_id", client_id).eq("alias_type", matchSourceType);
        const existingNorms = new Set((existingAliases || []).map((a: any) => a.normalized_alias));
        if (!existingNorms.has(normName)) {
          await sb.from("client_aliases").insert({ client_id, alias_name: matchName, normalized_alias: normName, alias_type: matchSourceType, source: "manual_confirmation" });
        }
      }

      return jsonResponse({ success: true, status: "manually_confirmed", mappings_stored: allMatches.length });
    }

    // ─── REJECT action ────────────────────────────────────────────
    if (action === "reject") {
      const { error } = await sb.from("account_entity_resolutions").update({
        resolution_status: "rejected",
        resolved_at: new Date().toISOString(),
      }).eq("client_id", client_id);
      if (error) throw error;
      return jsonResponse({ success: true, status: "rejected" });
    }

    // ─── RESOLVE action (default) — UNIVERSAL ─────────────────────
    const { data: client, error: cErr } = await sb.from("clients").select("name, normalized_name, client_type, primary_domain").eq("id", client_id).single();
    if (cErr || !client) throw new Error("Client not found");

    const sourceName = client.name;
    const entityType = classifyEntityType(client.client_type);
    const relevantSources = getSourceTypes(entityType);

    // 1. Check existing confirmed resolutions
    const { data: existingRes } = await sb.from("account_entity_resolutions").select("*").eq("client_id", client_id).single();
    if (existingRes?.resolution_status === "manually_confirmed") {
      return jsonResponse({ success: true, status: "already_confirmed", resolution: existingRes });
    }

    // 2. Get aliases
    const { data: aliases } = await sb.from("client_aliases").select("alias_name, alias_type").eq("client_id", client_id);
    const aliasNames = (aliases || []).map((a: any) => a.alias_name);

    // 3. Build search variations
    const searchVariations = new Set<string>();
    searchVariations.add(sourceName);
    searchVariations.add(normalizeSansLegal(sourceName));
    const coreName = normalizeCore(sourceName);
    if (coreName.length >= 3) searchVariations.add(coreName);
    for (const alias of aliasNames) { searchVariations.add(alias); searchVariations.add(normalizeSansLegal(alias)); }

    // 4. Determine which SEC form types to search based on entity type
    const formTypes = relevantSources.includes("sec_adviser")
      ? "13F-HR,13F-HR/A,ADV,ADV/A"
      : "10-K,10-Q,8-K,10-K/A,10-Q/A,20-F,S-1";

    // 5. Search across multiple sources
    const seenKeys = new Set<string>();
    const rawResults: any[] = [];

    const addResults = (hits: any[]) => {
      for (const hit of hits) {
        const key = `${(hit.source || "sec")}:${hit.cik || hit.name}`.toLowerCase();
        if (!seenKeys.has(key)) { seenKeys.add(key); rawResults.push(hit); }
      }
    };

    // 5a. Security master (fast, local DB)
    const smResults = await searchSecurityMaster(sb, searchVariations);
    addResults(smResults);

    // 5b. Insight Hub ticker lists
    const ihResults = await searchInsightHub(searchVariations);
    addResults(ihResults);

    // 5c. SEC EDGAR
    for (const term of searchVariations) {
      if (!term || term.length < 2) continue;
      const hits = await searchEDGAR(term, formTypes);
      addResults(hits.map(h => ({ ...h, source: "sec_edgar" })));
      await new Promise(r => setTimeout(r, 120));
    }

    // 5d. Web search fallback (only if <3 candidates so far)
    if (rawResults.length < 3) {
      const webResults = await searchWeb(sourceName);
      addResults(webResults);
    }

    logger.info("Search complete", { sources: { security_master: smResults.length, insight_hub: ihResults.length, sec: rawResults.length - smResults.length - ihResults.length, web: rawResults.length }, total: rawResults.length });

    // 6. Score candidates
    const candidates = rawResults.map(hit => {
      const { confidence, match_method, match_reasons } = scoreCandidate(sourceName, hit.name, aliasNames);
      return { name: hit.name, cik: hit.cik, filing_date: hit.filing_date, filing_type: hit.filing_type, confidence, match_method, match_reasons, source: hit.source || "sec_edgar" };
    });
    candidates.sort((a, b) => b.confidence - a.confidence);
    const topCandidates = candidates.slice(0, 8);

    // 7. Determine resolution status
    const bestMatch = topCandidates[0] || null;
    let resolutionStatus = "unresolved";
    let autoResolved = false;
    if (bestMatch) {
      const secondBest = topCandidates[1];
      const hasCompetitor = secondBest && secondBest.confidence >= bestMatch.confidence - 10 && secondBest.cik !== bestMatch.cik;
      if (bestMatch.confidence >= 88 && !hasCompetitor) { resolutionStatus = "auto_matched"; autoResolved = true; }
      else if (bestMatch.confidence >= 50) { resolutionStatus = "needs_review"; }
    }

    // 8. Upsert core resolution record
    const resolutionData = {
      client_id,
      source_name: sourceName,
      normalized_name: normalizeSansLegal(sourceName),
      canonical_name: autoResolved && bestMatch ? bestMatch.name : null,
      entity_type: entityType,
      sec_filer_name: autoResolved && bestMatch ? bestMatch.name : null,
      sec_cik: autoResolved && bestMatch ? bestMatch.cik : null,
      resolution_status: resolutionStatus,
      confidence_score: bestMatch?.confidence || 0,
      matched_by: bestMatch?.match_method || "none",
      manually_confirmed: false,
      match_candidates: topCandidates,
    };

    const { data: upserted, error: upsertErr } = await sb
      .from("account_entity_resolutions")
      .upsert(resolutionData, { onConflict: "client_id" })
      .select()
      .single();
    if (upsertErr) throw upsertErr;

    // 9. Create external source mappings for high-confidence matches
    const highConf = candidates.filter(c => c.confidence >= 80);
    const defaultSourceType = relevantSources.includes("sec_adviser") ? "sec_adviser" : "sec_issuer";

    const sourceTypeMap: Record<string, string> = {
      sec_edgar: defaultSourceType,
      security_master: "ticker",
      insight_hub: "ticker",
      web_search: "website_domain",
    };

    for (const cand of highConf) {
      try {
        const extSourceType = sourceTypeMap[(cand as any).source] || defaultSourceType;
        await sb.from("external_source_mappings").upsert({
          client_id,
          resolution_id: upserted?.id,
          external_source_type: extSourceType,
          external_entity_name: cand.name,
          external_identifier: cand.cik,
          confidence_score: cand.confidence,
          match_method: cand.match_method,
          match_reasons: cand.match_reasons,
          manually_confirmed: autoResolved && cand === highConf[0],
        }, { onConflict: "client_id,external_source_type,external_identifier" });
      } catch {} // ignore duplicates
    }

    // 10. Store aliases
    if (highConf.length > 0) {
      const firstSourceType = sourceTypeMap[(highConf[0] as any).source] || defaultSourceType;
      const { data: existingAliases } = await sb.from("client_aliases").select("normalized_alias").eq("client_id", client_id).eq("alias_type", firstSourceType);
      const existingNorms = new Set((existingAliases || []).map((a: any) => a.normalized_alias));
      for (const cand of highConf) {
        const normName = normalizeSansLegal(cand.name);
        if (!existingNorms.has(normName)) {
          const aliasType = sourceTypeMap[(cand as any).source] || defaultSourceType;
          await sb.from("client_aliases").insert({ client_id, alias_name: cand.name, normalized_alias: normName, alias_type: aliasType, source: "entity_resolution" });
          existingNorms.add(normName);
        }
      }
    }

    logger.info("Entity resolved", { client_id, sourceName, entityType, status: resolutionStatus, confidence: bestMatch?.confidence || 0, match: bestMatch?.name || "none" });

    return jsonResponse({
      success: true,
      status: resolutionStatus,
      resolution: upserted,
      candidates: topCandidates,
      auto_resolved: autoResolved,
      entity_type: entityType,
      relevant_sources: relevantSources,
    });

  } catch (e: any) {
    logger.error("Entity resolution failed", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});
