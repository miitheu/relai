import type { FunctionContext } from "./utils";

const SEC_HEADERS = { "User-Agent": "Relai CRM support@relai.com", Accept: "application/json" };

// ── Normalization ──
const LEGAL_SUFFIXES = ["llc", "lp", "ltd", "limited", "inc", "incorporated", "corp", "corporation", "plc", "gmbh", "sa", "ag", "nv", "bv", "llp", "co", "company"];
const LEGAL_SUFFIX_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\.?\\s*$`, "gi");
const LEGAL_SUFFIX_INLINE_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\.?\\b`, "gi");
const BUSINESS_WORDS = ["management", "advisors", "adviser", "advisory", "capital", "holdings", "partners", "investments", "asset management", "group", "fund", "funds", "global", "international", "associates", "financial", "securities", "investment"];
const BUSINESS_WORD_RE = new RegExp(`\\b(${BUSINESS_WORDS.join("|")})\\b`, "gi");

function normalizeBasic(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[.,''"""\-()\/\\]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeSansLegal(name: string): string {
  let n = normalizeBasic(name); let prev = "";
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
  const setB = new Set(bb); let inter = 0; for (const bg of ba) if (setB.has(bg)) inter++;
  return (2 * inter) / (ba.length + bb.length);
}
function tokenContainment(query: string, candidate: string): number {
  const tq = tokens(query); const tc = new Set(tokens(candidate));
  if (tq.length === 0) return 0; let c = 0; for (const t of tq) if (tc.has(t)) c++;
  return c / tq.length;
}
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(tokens(a)); const tb = new Set(tokens(b));
  if (ta.size === 0 && tb.size === 0) return 0;
  let o = 0; for (const t of ta) if (tb.has(t)) o++;
  return o / Math.max(ta.size, tb.size);
}

function scoreCandidate(sourceName: string, candidateName: string, aliasNames: string[]): { confidence: number; match_method: string; match_reasons: string[] } {
  const reasons: string[] = []; let confidence = 0; let method = "none";
  const srcBasic = normalizeBasic(sourceName); const srcSL = normalizeSansLegal(sourceName); const srcCore = normalizeCore(sourceName);
  const candBasic = normalizeBasic(candidateName); const candSL = normalizeSansLegal(candidateName); const candCore = normalizeCore(candidateName);
  if (srcBasic === candBasic) return { confidence: 98, match_method: "exact", match_reasons: ["Exact name match"] };
  if (srcSL === candSL && srcSL.length > 2) return { confidence: 95, match_method: "exact_sans_legal", match_reasons: ["Exact after removing legal suffixes"] };
  if (srcCore === candCore && srcCore.length > 2) { confidence = 88; method = "core_match"; reasons.push(`Core name match: "${srcCore}"`); }
  const srcToks = tokens(srcSL);
  if (tokenContainment(srcSL, candSL) === 1.0 && srcToks.length >= 2) { const b = srcToks.length >= 3 ? 92 : 90; if (b > confidence) { confidence = b; method = "token_containment"; reasons.push("All source tokens in candidate"); } }
  const ol = tokenOverlap(srcSL, candSL);
  if (ol >= 0.8) { const s = Math.round(75 + ol * 20); if (s > confidence) { confidence = s; method = "token_overlap"; reasons.push(`Token overlap: ${Math.round(ol * 100)}%`); } }
  const dSL = diceCoefficient(srcSL, candSL);
  if (dSL > 0.7) { const s = Math.round(60 + dSL * 35); if (s > confidence) { confidence = s; method = "fuzzy_sans_legal"; reasons.push(`Fuzzy: ${Math.round(dSL * 100)}%`); } }
  for (const alias of aliasNames) {
    const aN = normalizeSansLegal(alias);
    if (aN === candSL) { reasons.push(`Alias: "${alias}"`); if (confidence < 95) { confidence = 95; method = "alias_match"; } }
    else { const ad = diceCoefficient(aN, candSL); if (ad > 0.8 && confidence < 85) { reasons.push(`Fuzzy alias`); confidence = Math.round(70 + ad * 20); method = "alias_fuzzy"; } }
  }
  if (confidence === 0) { const bd = diceCoefficient(srcBasic, candBasic); confidence = Math.round(bd * 60); method = bd > 0.5 ? "fuzzy_low" : "weak"; }
  return { confidence: Math.min(confidence, 98), match_method: method, match_reasons: reasons };
}

function classifyEntityType(clientType: string): string {
  const ct = (clientType || "").toLowerCase();
  if (ct.includes("hedge fund")) return "hedge_fund";
  if (ct.includes("asset manager") || ct.includes("investment")) return "asset_manager";
  if (ct.includes("bank")) return "bank";
  if (ct.includes("vendor") || ct.includes("data provider")) return "data_vendor";
  if (ct.includes("fund") || ct.includes("mutual") || ct.includes("etf")) return "asset_manager";
  return "corporate";
}

async function searchEDGAR(searchTerm: string, formTypes: string): Promise<any[]> {
  const results: any[] = [];
  const clean = searchTerm.replace(/[^a-zA-Z0-9\s]/g, "").trim();
  if (!clean || clean.length < 2) return results;
  try {
    const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(clean)}%22&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
    if (r.ok) { const d = await r.json(); for (const h of (d.hits?.hits || [])) { const s = h._source || {}; const n = s.display_names?.[0] || s.entity_name || ""; const c = s.ciks?.[0] || ""; if (c && n && !results.some((x: any) => x.cik === c)) results.push({ name: n, cik: c, filing_date: s.file_date, filing_type: s.form_type }); } }
  } catch {}
  await new Promise(r => setTimeout(r, 120));
  if (results.length < 3) {
    try {
      const r = await fetch(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(clean)}&forms=${formTypes}&from=0&size=10`, { headers: SEC_HEADERS });
      if (r.ok) { const d = await r.json(); for (const h of (d.hits?.hits || [])) { const s = h._source || {}; const n = s.display_names?.[0] || s.entity_name || ""; const c = s.ciks?.[0] || ""; if (c && n && !results.some((x: any) => x.cik === c)) results.push({ name: n, cik: c, filing_date: s.file_date, filing_type: s.form_type }); } }
    } catch {}
  }
  return results;
}

// ── Resolve Entity ──
export async function resolveEntity(ctx: FunctionContext) {
  const { sql, body } = ctx;
  const { client_id, action, sec_cik, sec_filer_name, additional_matches, source_type, external_identifier, external_name } = body;
  if (!client_id) return { data: null, error: { message: "client_id required" } };

  // Confirm action
  if (action === "confirm") {
    const extSourceType = source_type || "sec_adviser";
    const extIdentifier = external_identifier || sec_cik;
    const extName = external_name || sec_filer_name;
    if (!extIdentifier || !extName) return { data: null, error: { message: "external identifier and name required" } };

    await sql`UPDATE account_entity_resolutions SET sec_cik = ${sec_cik || extIdentifier}, sec_filer_name = ${sec_filer_name || extName}, canonical_name = ${extName}, resolution_status = 'manually_confirmed', confidence_score = 100, matched_by = 'manual', manually_confirmed = true, resolved_at = now() WHERE client_id = ${client_id}`;
    const resData = await sql`SELECT id FROM account_entity_resolutions WHERE client_id = ${client_id} LIMIT 1`;
    const allMatches = additional_matches && Array.isArray(additional_matches) ? additional_matches : [{ cik: extIdentifier, name: extName, source_type: extSourceType }];

    for (const match of allMatches) {
      const mst = match.source_type || extSourceType;
      const mid = match.cik || match.external_identifier || extIdentifier;
      const mname = match.name || match.external_name || extName;
      await sql`INSERT INTO external_source_mappings (client_id, resolution_id, external_source_type, external_entity_name, external_identifier, confidence_score, match_method, match_reasons, manually_confirmed, confirmed_at) VALUES (${client_id}, ${resData[0]?.id}, ${mst}, ${mname}, ${mid}, 100, 'manual', ${JSON.stringify(["Manually confirmed"])}::jsonb, true, now()) ON CONFLICT (client_id, external_source_type, external_identifier) DO UPDATE SET confidence_score = 100, manually_confirmed = true, confirmed_at = now()`;
    }
    return { data: { success: true, status: "manually_confirmed", mappings_stored: allMatches.length } };
  }

  // Reject action
  if (action === "reject") {
    await sql`UPDATE account_entity_resolutions SET resolution_status = 'rejected', resolved_at = now() WHERE client_id = ${client_id}`;
    return { data: { success: true, status: "rejected" } };
  }

  // Default: Resolve
  const clientRows = await sql`SELECT name, normalized_name, client_type, primary_domain FROM clients WHERE id = ${client_id} LIMIT 1`;
  if (clientRows.length === 0) return { data: null, error: { message: "Client not found" } };
  const client = clientRows[0];
  const sourceName = client.name;
  const entityType = classifyEntityType(client.client_type);
  const isFund = entityType === "hedge_fund" || entityType === "asset_manager";
  const formTypes = isFund ? "13F-HR,13F-HR/A,ADV,ADV/A" : "10-K,10-Q,8-K";
  const primarySourceType = isFund ? "sec_adviser" : "sec_issuer";

  // Check existing
  const existingRes = await sql`SELECT * FROM account_entity_resolutions WHERE client_id = ${client_id} LIMIT 1`;
  if (existingRes[0]?.resolution_status === "manually_confirmed") return { data: { success: true, status: "already_confirmed", resolution: existingRes[0] } };

  // Get aliases
  const aliases = await sql`SELECT alias_name FROM client_aliases WHERE client_id = ${client_id}`;
  const aliasNames = aliases.map((a: any) => a.alias_name);

  // Search EDGAR
  const searchVars = new Set<string>([sourceName, normalizeSansLegal(sourceName)]);
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

  // Score candidates
  const candidates = rawResults.map(hit => {
    const { confidence, match_method, match_reasons } = scoreCandidate(sourceName, hit.name, aliasNames);
    return { name: hit.name, cik: hit.cik, filing_date: hit.filing_date, filing_type: hit.filing_type, confidence, match_method, match_reasons, source: "sec_edgar" };
  });
  candidates.sort((a, b) => b.confidence - a.confidence);
  const topCandidates = candidates.slice(0, 8);

  const bestMatch = topCandidates[0] || null;
  let resolutionStatus = "unresolved";
  let autoResolved = false;
  if (bestMatch) {
    const secondBest = topCandidates[1];
    const hasCompetitor = secondBest && secondBest.confidence >= bestMatch.confidence - 10 && secondBest.cik !== bestMatch.cik;
    if (bestMatch.confidence >= 88 && !hasCompetitor) { resolutionStatus = "auto_matched"; autoResolved = true; }
    else if (bestMatch.confidence >= 50) resolutionStatus = "needs_review";
  }

  // Upsert resolution
  const resolutionData = {
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
    match_candidates: JSON.stringify(topCandidates),
  };

  const upserted = await sql`
    INSERT INTO account_entity_resolutions (client_id, source_name, normalized_name, canonical_name, entity_type, sec_filer_name, sec_cik, resolution_status, confidence_score, matched_by, manually_confirmed, match_candidates)
    VALUES (${client_id}, ${resolutionData.source_name}, ${resolutionData.normalized_name}, ${resolutionData.canonical_name}, ${resolutionData.entity_type}, ${resolutionData.sec_filer_name}, ${resolutionData.sec_cik}, ${resolutionData.resolution_status}, ${resolutionData.confidence_score}, ${resolutionData.matched_by}, false, ${resolutionData.match_candidates}::jsonb)
    ON CONFLICT (client_id) DO UPDATE SET source_name = EXCLUDED.source_name, normalized_name = EXCLUDED.normalized_name, canonical_name = EXCLUDED.canonical_name, entity_type = EXCLUDED.entity_type, sec_filer_name = EXCLUDED.sec_filer_name, sec_cik = EXCLUDED.sec_cik, resolution_status = EXCLUDED.resolution_status, confidence_score = EXCLUDED.confidence_score, matched_by = EXCLUDED.matched_by, match_candidates = EXCLUDED.match_candidates
    RETURNING *
  `;

  // Store high-confidence mappings
  const highConf = candidates.filter(c => c.confidence >= 80);
  for (const cand of highConf) {
    try {
      await sql`INSERT INTO external_source_mappings (client_id, resolution_id, external_source_type, external_entity_name, external_identifier, confidence_score, match_method, match_reasons, manually_confirmed) VALUES (${client_id}, ${upserted[0]?.id}, ${primarySourceType}, ${cand.name}, ${cand.cik}, ${cand.confidence}, ${cand.match_method}, ${JSON.stringify(cand.match_reasons)}::jsonb, ${autoResolved && cand === highConf[0]}) ON CONFLICT (client_id, external_source_type, external_identifier) DO NOTHING`;
    } catch {}
  }

  return {
    data: {
      success: true, status: resolutionStatus, resolution: upserted[0],
      candidates: topCandidates, auto_resolved: autoResolved,
      entity_type: entityType,
    },
  };
}

// ── Batch Resolve ──
export async function batchResolveEntities(ctx: FunctionContext) {
  const { sql, body } = ctx;
  const batchSize = body.batch_size || 10;

  // Get existing resolutions
  const existingRes = await sql`SELECT client_id FROM account_entity_resolutions`;
  const resolvedIds = new Set(existingRes.map((r: any) => r.client_id));

  const allClients = await sql`SELECT id, name, client_type FROM clients ORDER BY name`;
  const candidates = allClients.filter((c: any) => !resolvedIds.has(c.id));
  const batch = candidates.slice(0, batchSize);
  const results: any[] = [];

  for (const client of batch) {
    // Resolve each client individually using the same entity resolution logic
    const result = await resolveEntity({ ...ctx, body: { client_id: client.id } });
    results.push({
      client_id: client.id,
      name: client.name,
      status: result.data?.status || "error",
      confidence: result.data?.resolution?.confidence_score || 0,
    });
  }

  return {
    data: {
      success: true,
      processed: results.length,
      remaining: candidates.length - batch.length,
      total_candidates: candidates.length,
      results,
    },
  };
}
