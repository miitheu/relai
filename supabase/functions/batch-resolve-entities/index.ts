import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("batch-resolve-entities");

const SEC_HEADERS = {
  "User-Agent": "Relai CRM support@relai.com",
  Accept: "application/json",
};

// ─── NORMALIZATION (shared logic) ───────────────────────────────────
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
  let c = 0; for (const t of tq) if (tc.has(t)) c++;
  return c / tq.length;
}
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a)); const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let o = 0; for (const t of ta) if (tb.has(t)) o++;
  return o / Math.max(ta.size, tb.size);
}

function scoreCandidate(sourceName: string, candidateName: string, aliasNames: string[]): { confidence: number; match_method: string; match_reasons: string[] } {
  const reasons: string[] = [];
  let confidence = 0, method = "none";
  const srcBasic = normalizeBasic(sourceName), srcSL = normalizeSansLegal(sourceName), srcCore = normalizeCore(sourceName);
  const candBasic = normalizeBasic(candidateName), candSL = normalizeSansLegal(candidateName), candCore = normalizeCore(candidateName);

  if (srcBasic === candBasic) return { confidence: 98, match_method: "exact", match_reasons: ["Exact name match"] };
  if (srcSL === candSL && srcSL.length > 2) return { confidence: 95, match_method: "exact_sans_legal", match_reasons: [`Exact after removing legal suffixes`] };
  if (srcCore === candCore && srcCore.length > 2) { confidence = 88; method = "core_match"; reasons.push(`Core name match: "${srcCore}"`); }

  const srcToks = tokens(srcSL);
  if (tokenContainment(srcSL, candSL) === 1.0 && srcToks.length >= 2) {
    const b = srcToks.length >= 3 ? 92 : 90;
    if (b > confidence) { confidence = b; method = "token_containment"; reasons.push("All source tokens in candidate"); }
  }
  const ol = tokenOverlap(srcSL, candSL);
  if (ol >= 0.8) { const s = Math.round(75 + ol * 20); if (s > confidence) { confidence = s; method = "token_overlap"; reasons.push(`Token overlap: ${Math.round(ol * 100)}%`); } }
  const dSL = diceCoefficient(srcSL, candSL);
  if (dSL > 0.7) { const s = Math.round(60 + dSL * 35); if (s > confidence) { confidence = s; method = "fuzzy_sans_legal"; reasons.push(`Fuzzy: ${Math.round(dSL * 100)}%`); } }
  const dC = diceCoefficient(srcCore, candCore);
  if (dC > 0.7) { const s = Math.round(55 + dC * 35); if (s > confidence) { confidence = s; method = "fuzzy_core"; reasons.push(`Fuzzy (core): ${Math.round(dC * 100)}%`); } }

  for (const alias of aliasNames) {
    const aN = normalizeSansLegal(alias);
    if (aN === candSL) { reasons.push(`Alias: "${alias}"`); if (confidence < 95) { confidence = 95; method = "alias_match"; } }
    else { const ad = diceCoefficient(aN, candSL); if (ad > 0.8 && confidence < 85) { reasons.push(`Fuzzy alias: "${alias}"`); confidence = Math.round(70 + ad * 20); method = "alias_fuzzy"; } }
  }

  if (confidence === 0) {
    const bd = diceCoefficient(srcBasic, candBasic);
    confidence = Math.round(bd * 60); method = bd > 0.5 ? "fuzzy_low" : "weak";
  }
  return { confidence: Math.min(confidence, 98), match_method: method, match_reasons: reasons };
}

function classifyEntityType(clientType: string): string {
  const ct = (clientType || "").toLowerCase();
  if (ct.includes("hedge fund")) return "hedge_fund";
  if (ct.includes("asset manager") || ct.includes("investment")) return "asset_manager";
  if (ct.includes("bank") || ct.includes("financial")) return "bank";
  if (ct.includes("vendor") || ct.includes("data provider")) return "data_vendor";
  if (ct.includes("fund") || ct.includes("mutual") || ct.includes("etf")) return "asset_manager";
  return "corporate";
}

function getFormTypes(entityType: string): string {
  if (entityType === "hedge_fund" || entityType === "asset_manager") return "13F-HR,13F-HR/A,ADV,ADV/A";
  return "10-K,10-Q,8-K,10-K/A,10-Q/A,20-F,S-1";
}

function getPrimarySourceType(entityType: string): string {
  if (entityType === "hedge_fund" || entityType === "asset_manager") return "sec_adviser";
  return "sec_issuer";
}

async function searchEDGAR(searchTerm: string, formTypes: string): Promise<any[]> {
  const results: any[] = [];
  const clean = searchTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  if (!clean || clean.length < 2) return results;
  try {
    const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(clean)}%22&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
    if (r.ok) { const d = await r.json(); for (const h of (d.hits?.hits || [])) { const s = h._source || {}; const n = s.display_names?.[0] || s.entity_name || ""; const c = s.ciks?.[0] || ""; if (c && n && !results.some((x: any) => x.cik === c)) results.push({ name: n, cik: c, filing_date: s.file_date || null, filing_type: s.form_type || null }); } }
  } catch {}
  await new Promise(r => setTimeout(r, 120));
  if (results.length < 3) {
    try {
      const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(clean)}&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
      if (r.ok) { const d = await r.json(); for (const h of (d.hits?.hits || [])) { const s = h._source || {}; const n = s.display_names?.[0] || s.entity_name || ""; const c = s.ciks?.[0] || ""; if (c && n && !results.some((x: any) => x.cik === c)) results.push({ name: n, cik: c, filing_date: s.file_date || null, filing_type: s.form_type || null }); } }
    } catch {}
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 10;
    const onlySEC = body.only_sec === true; // now default false for universal
    const entityTypeFilter = body.entity_type_filter || null; // optional filter

    // Get existing resolutions
    const { data: existingRes } = await sb.from("account_entity_resolutions").select("client_id");
    const resolvedIds = new Set((existingRes || []).map((r: any) => r.client_id));

    // Fetch ALL clients
    let allClients: any[] = [];
    let page = 0;
    while (true) {
      const { data: chunk, error: cErr } = await sb.from("clients").select("id, name, client_type, primary_domain, normalized_name").order("name").range(page * 1000, (page + 1) * 1000 - 1);
      if (cErr) throw cErr;
      if (!chunk || chunk.length === 0) break;
      allClients = allClients.concat(chunk);
      if (chunk.length < 1000) break;
      page++;
    }

    // Filter to unresolved
    const candidates = allClients.filter((c: any) => {
      if (resolvedIds.has(c.id)) return false;
      if (entityTypeFilter) {
        const et = classifyEntityType(c.client_type);
        if (et !== entityTypeFilter) return false;
      }
      if (onlySEC) {
        const et = classifyEntityType(c.client_type);
        if (et === "data_vendor") return false; // skip non-SEC types
      }
      return true;
    });

    const batch = candidates.slice(0, batchSize);
    const results: any[] = [];

    for (const client of batch) {
      const sourceName = client.name;
      const entityType = classifyEntityType(client.client_type);
      const formTypes = getFormTypes(entityType);
      const primarySourceType = getPrimarySourceType(entityType);

      const { data: aliases } = await sb.from("client_aliases").select("alias_name, alias_type").eq("client_id", client.id);
      const aliasNames = (aliases || []).map((a: any) => a.alias_name);

      const searchVars = new Set<string>();
      searchVars.add(sourceName);
      searchVars.add(normalizeSansLegal(sourceName));
      const core = normalizeCore(sourceName);
      if (core.length >= 3) searchVars.add(core);
      for (const a of aliasNames) searchVars.add(a);

      const seenCiks = new Set<string>();
      const rawResults: any[] = [];
      for (const term of searchVars) {
        if (!term || term.length < 2) continue;
        const hits = await searchEDGAR(term, formTypes);
        for (const h of hits) { if (!seenCiks.has(h.cik)) { seenCiks.add(h.cik); rawResults.push(h); } }
        await new Promise(r => setTimeout(r, 120));
      }

      const edgarCandidates = rawResults.map(h => {
        const { confidence, match_method, match_reasons } = scoreCandidate(sourceName, h.name, aliasNames);
        return { name: h.name, cik: h.cik, filing_date: h.filing_date, filing_type: h.filing_type, confidence, match_method, match_reasons };
      });
      edgarCandidates.sort((a: any, b: any) => b.confidence - a.confidence);
      const topCands = edgarCandidates.slice(0, 8);
      const best = topCands[0] || null;

      let status = "unresolved";
      let autoResolved = false;
      if (best) {
        const second = topCands[1];
        const competitor = second && second.confidence >= best.confidence - 10 && second.cik !== best.cik;
        if (best.confidence >= 88 && !competitor) { status = "auto_matched"; autoResolved = true; }
        else if (best.confidence >= 50) { status = "needs_review"; }
      }

      const { data: upserted } = await sb.from("account_entity_resolutions").upsert({
        client_id: client.id,
        source_name: sourceName,
        normalized_name: normalizeSansLegal(sourceName),
        canonical_name: autoResolved && best ? best.name : null,
        entity_type: entityType,
        sec_filer_name: autoResolved && best ? best.name : null,
        sec_cik: autoResolved && best ? best.cik : null,
        resolution_status: status,
        confidence_score: best?.confidence || 0,
        matched_by: best?.match_method || "none",
        manually_confirmed: false,
        match_candidates: topCands,
      }, { onConflict: "client_id" }).select("id").single();

      // Create external source mappings
      const highConf = edgarCandidates.filter((c: any) => c.confidence >= 80);
      for (const cand of highConf) {
        try {
          await sb.from("external_source_mappings").upsert({
            client_id: client.id,
            resolution_id: upserted?.id,
            external_source_type: primarySourceType,
            external_entity_name: cand.name,
            external_identifier: cand.cik,
            confidence_score: cand.confidence,
            match_method: cand.match_method,
            match_reasons: cand.match_reasons,
            manually_confirmed: autoResolved && cand === highConf[0],
          }, { onConflict: "client_id,external_source_type,external_identifier" });
        } catch {}
      }

      // Store aliases
      if (highConf.length > 0) {
        const { data: ea } = await sb.from("client_aliases").select("normalized_alias").eq("client_id", client.id).eq("alias_type", primarySourceType);
        const en = new Set((ea || []).map((a: any) => a.normalized_alias));
        for (const c of highConf) {
          const nm = normalizeSansLegal(c.name);
          if (!en.has(nm)) { await sb.from("client_aliases").insert({ client_id: client.id, alias_name: c.name, normalized_alias: nm, alias_type: primarySourceType, source: "batch_entity_resolution" }); en.add(nm); }
        }
      }

      results.push({
        client_id: client.id, name: sourceName, entity_type: entityType,
        status, confidence: best?.confidence || 0,
        sec_name: autoResolved ? best?.name : null, cik: autoResolved ? best?.cik : null,
        match_method: best?.match_method || "none",
      });

      logger.info(`Resolved entity`, { sourceName, entityType, status, confidence: best?.confidence || 0, matchedName: best?.name || "none" });
    }

    return jsonResponse({
      success: true, processed: results.length, remaining: candidates.length - batch.length,
      total_candidates: candidates.length, results,
    });

  } catch (e: any) {
    logger.error("Batch resolve error", { error: e.message, stack: e.stack });
    return errorResponse("An internal error occurred", 400);
  }
});
