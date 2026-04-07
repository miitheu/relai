import type { FunctionContext } from "./utils";

// ── Normalization helpers (ported from edge function) ────────────────

const LEGAL_SUFFIXES = [
  "llc", "lp", "ltd", "limited", "inc", "incorporated", "corp", "corporation",
  "plc", "gmbh", "sa", "ag", "nv", "bv", "llp", "co", "company",
];
const LEGAL_RE = new RegExp(`\\b(${LEGAL_SUFFIXES.join("|")})\\.?\\s*$`, "gi");
const BUSINESS_WORDS = new Set([
  "holdings", "management", "capital", "partners", "advisors", "advisory",
  "asset", "group", "global", "international", "investments", "investment",
  "fund", "funds", "financial", "services", "solutions", "associates",
  "resources", "strategies", "consulting", "ventures", "equity", "securities",
]);
const ABBREV_MAP: Record<string, string> = {
  intl: "international", mgt: "management", mgmt: "management", adv: "advisors",
  svcs: "services", svc: "service", assoc: "associates", grp: "group", hldgs: "holdings",
  inv: "investment", tech: "technology", fin: "financial", natl: "national",
  amer: "american", euro: "european", sys: "systems", dev: "development",
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[''`]/g, "").replace(/&/g, " and ").replace(/[.,"""\-()\/\\:;!?#@]/g, " ").replace(/\s+/g, " ").trim();
}
function normSansLegal(name: string): string {
  let n = normalize(name); let prev = "";
  while (prev !== n) { prev = n; n = n.replace(LEGAL_RE, "").trim(); }
  return n;
}
function tokenize(normalized: string): string[] { return normalized.split(/\s+/).filter(t => t.length > 0); }
function expandAbbreviations(tokens: string[]): string[] { return tokens.map(t => ABBREV_MAP[t] || t); }
function coreTokens(tokens: string[]): string[] {
  const expanded = expandAbbreviations(tokens);
  const core = expanded.filter(t => !BUSINESS_WORDS.has(t) && !LEGAL_SUFFIXES.includes(t));
  return core.length > 0 ? core : expanded;
}
function makeAcronym(tokens: string[]): string {
  const skip = new Set(["and", "the", "of", "for", "in", "a", "an", "or"]);
  return tokens.filter(t => !skip.has(t) && t.length > 0).map(t => t[0]).join("");
}
function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string) => { const arr: string[] = []; for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2)); return arr; };
  const ba = bigrams(a); const bb = bigrams(b);
  if (ba.length + bb.length === 0) return 0;
  const setB = new Set(bb); let inter = 0;
  for (const bg of ba) if (setB.has(bg)) inter++;
  return (2 * inter) / (ba.length + bb.length);
}
function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b); let inter = 0;
  for (const t of a) if (setB.has(t)) inter++;
  return inter / Math.min(a.length, b.length);
}

interface AccountRec {
  id: string; name: string; normalized: string; sansLegal: string;
  tokens: string[]; coreTokens: string[]; expandedTokens: string[];
  acronym: string; coreAcronym: string;
}

function buildRec(c: { id: string; name: string }): AccountRec {
  const normalized = normalize(c.name);
  const sansLegal = normSansLegal(c.name);
  const toks = tokenize(sansLegal);
  const expanded = expandAbbreviations(toks);
  const core = coreTokens(toks);
  return { id: c.id, name: c.name, normalized, sansLegal, tokens: toks, coreTokens: core, expandedTokens: expanded, acronym: makeAcronym(expanded), coreAcronym: makeAcronym(core) };
}

interface PairResult { idA: string; idB: string; match_type: string; confidence: number; match_reasons: string[]; }

function scorePair(a: AccountRec, b: AccountRec): PairResult | null {
  const reasons: string[] = []; let maxConf = 0; let matchType = "fuzzy";

  if (a.normalized === b.normalized && a.normalized.length >= 2) { reasons.push("Exact normalized name match"); maxConf = Math.max(maxConf, 98); matchType = "exact"; }
  if (a.sansLegal === b.sansLegal && a.sansLegal.length >= 2 && a.normalized !== b.normalized) { reasons.push("Match after removing legal suffixes"); maxConf = Math.max(maxConf, 92); if (maxConf <= 92) matchType = "exact_sans_legal"; }

  if (a.coreTokens.length >= 1 && b.coreTokens.length >= 1) {
    const overlap = tokenOverlap(a.coreTokens, b.coreTokens);
    if (overlap >= 0.8 && a.coreTokens.length + b.coreTokens.length >= 3) { reasons.push(`Core token overlap: ${Math.round(overlap * 100)}%`); maxConf = Math.max(maxConf, Math.round(60 + overlap * 30)); }
  }

  if (a.sansLegal.length >= 3 && b.sansLegal.length >= 3) {
    const dice = diceCoefficient(a.sansLegal, b.sansLegal);
    if (dice >= 0.65) { reasons.push(`Fuzzy similarity: ${Math.round(dice * 100)}%`); maxConf = Math.max(maxConf, Math.round(50 + dice * 40)); if (matchType === "fuzzy" && dice >= 0.8) matchType = "strong_fuzzy"; }
  }

  const aStrip = a.sansLegal.replace(/\s+/g, ""); const bStrip = b.sansLegal.replace(/\s+/g, "");
  if (aStrip === bStrip && aStrip.length >= 2 && a.sansLegal !== b.sansLegal) { reasons.push("Spacing/punctuation variant"); maxConf = Math.max(maxConf, 90); matchType = "punctuation_variant"; }

  if (reasons.length === 0 || maxConf < 50) return null;
  return { idA: a.id, idB: b.id, match_type: matchType, confidence: maxConf, match_reasons: reasons };
}

// Union-Find
class UnionFind {
  parent: Map<string, string> = new Map();
  rank: Map<string, number> = new Map();
  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    let root = x; while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let curr = x; while (curr !== root) { const next = this.parent.get(curr)!; this.parent.set(curr, root); curr = next; }
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a); const rb = this.find(b); if (ra === rb) return;
    const rA = this.rank.get(ra)!; const rB = this.rank.get(rb)!;
    if (rA < rB) this.parent.set(ra, rb); else if (rA > rB) this.parent.set(rb, ra);
    else { this.parent.set(rb, ra); this.rank.set(ra, rA + 1); }
  }
}

export default async function detectDuplicates(ctx: FunctionContext) {
  const { sql, body } = ctx;
  const { min_confidence = 50, limit = 500 } = body || {};

  // Fetch all non-merged clients
  const allClients = await sql`SELECT id, name FROM clients WHERE is_merged = false`;

  // Fetch aliases and external mappings for extra signal
  const aliases = await sql`SELECT client_id, alias_name, normalized_alias FROM client_aliases`;
  const aliasMap = new Map<string, { clientId: string; aliasName: string }[]>();
  for (const a of aliases) {
    const norm = a.normalized_alias;
    if (!aliasMap.has(norm)) aliasMap.set(norm, []);
    aliasMap.get(norm)!.push({ clientId: a.client_id, aliasName: a.alias_name });
  }

  const extMappings = await sql`SELECT client_id, external_identifier, external_source_type FROM external_source_mappings`;
  const extByIdentifier = new Map<string, string[]>();
  for (const m of extMappings) {
    if (!m.external_identifier) continue;
    const key = `${m.external_source_type}:${m.external_identifier}`;
    if (!extByIdentifier.has(key)) extByIdentifier.set(key, []);
    extByIdentifier.get(key)!.push(m.client_id);
  }
  const sharedExtPairs = new Set<string>();
  for (const [, clientIdsArr] of extByIdentifier) {
    if (clientIdsArr.length < 2) continue;
    for (let i = 0; i < clientIdsArr.length; i++)
      for (let j = i + 1; j < clientIdsArr.length; j++)
        sharedExtPairs.add([clientIdsArr[i], clientIdsArr[j]].sort().join(":"));
  }

  // Build records and blocking index
  const recs = allClients.map(buildRec);
  const recById = new Map<string, AccountRec>();
  for (const r of recs) recById.set(r.id, r);

  const blocks = new Map<string, number[]>();
  const addToBlock = (key: string, idx: number) => { if (!key || key.length < 1) return; if (!blocks.has(key)) blocks.set(key, []); blocks.get(key)!.push(idx); };
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.sansLegal.length >= 2) addToBlock(r.sansLegal.slice(0, 2), i);
    if (r.sansLegal.length >= 3) addToBlock(r.sansLegal.slice(0, 3), i);
    if (r.acronym.length >= 2) addToBlock(r.acronym, i);
    if (r.coreAcronym.length >= 2) addToBlock(r.coreAcronym, i);
    if (r.coreTokens.length > 0) addToBlock(r.coreTokens[0], i);
  }

  // Score candidate pairs
  const edges = new Map<string, PairResult>();
  const seenPairs = new Set<string>();

  for (const [, indices] of blocks) {
    if (indices.length < 2 || indices.length > 200) continue;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = recs[indices[i]]; const b = recs[indices[j]];
        const key = [a.id, b.id].sort().join(":");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const result = scorePair(a, b);
        if (!result) continue;
        if (sharedExtPairs.has(key)) { result.confidence = Math.min(99, result.confidence + 10); result.match_reasons.push("Shared external mapping"); }
        if (result.confidence >= min_confidence) edges.set(key, result);
      }
    }
  }

  // Alias-based matching
  for (const r of recs) {
    const aliasMatches = aliasMap.get(r.sansLegal) || [];
    for (const ma of aliasMatches) {
      if (ma.clientId === r.id) continue;
      const key = [r.id, ma.clientId].sort().join(":");
      if (edges.has(key)) { edges.get(key)!.match_reasons.push(`Alias "${ma.aliasName}" matches`); edges.get(key)!.confidence = Math.max(edges.get(key)!.confidence, 90); continue; }
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      edges.set(key, { idA: r.id, idB: ma.clientId, match_type: "alias", confidence: 90, match_reasons: [`Alias "${ma.aliasName}" matches`] });
    }
  }

  // Cluster with union-find
  const uf = new UnionFind();
  for (const [, edge] of edges) uf.union(edge.idA, edge.idB);

  const clusterMap = new Map<string, Set<string>>();
  for (const [, edge] of edges) {
    const root = uf.find(edge.idA);
    if (!clusterMap.has(root)) clusterMap.set(root, new Set());
    clusterMap.get(root)!.add(edge.idA);
    clusterMap.get(root)!.add(edge.idB);
  }

  const clusters: any[] = [];
  for (const [root, memberIds] of clusterMap) {
    if (memberIds.size < 2) continue;
    const clusterEdges: any[] = [];
    let maxConf = 0; let totalConf = 0; let edgeCount = 0;
    const matchTypes = new Set<string>(); const allReasons = new Set<string>();
    const memberReasons = new Map<string, Set<string>>(); const memberMaxConf = new Map<string, number>();
    for (const mid of memberIds) { memberReasons.set(mid, new Set()); memberMaxConf.set(mid, 0); }

    for (const [, edge] of edges) {
      if (uf.find(edge.idA) !== root) continue;
      clusterEdges.push({ id_a: edge.idA, id_b: edge.idB, confidence: edge.confidence, match_type: edge.match_type, reasons: edge.match_reasons });
      matchTypes.add(edge.match_type); for (const r of edge.match_reasons) allReasons.add(r);
      totalConf += edge.confidence; edgeCount++; maxConf = Math.max(maxConf, edge.confidence);
      for (const r of edge.match_reasons) { memberReasons.get(edge.idA)?.add(r); memberReasons.get(edge.idB)?.add(r); }
      memberMaxConf.set(edge.idA, Math.max(memberMaxConf.get(edge.idA) || 0, edge.confidence));
      memberMaxConf.set(edge.idB, Math.max(memberMaxConf.get(edge.idB) || 0, edge.confidence));
    }

    const members = Array.from(memberIds).map(mid => ({
      id: mid, name: recById.get(mid)?.name || mid,
      match_reasons: Array.from(memberReasons.get(mid) || []),
      member_confidence: memberMaxConf.get(mid) || 0,
    })).sort((a, b) => b.member_confidence - a.member_confidence);

    clusters.push({
      cluster_id: root, members, max_confidence: maxConf,
      avg_confidence: edgeCount > 0 ? Math.round(totalConf / edgeCount) : 0,
      match_types: Array.from(matchTypes), all_reasons: Array.from(allReasons),
      member_count: members.length, edges: clusterEdges,
    });
  }

  clusters.sort((a, b) => b.max_confidence - a.max_confidence);

  return {
    data: {
      success: true,
      total_accounts: allClients.length,
      cluster_count: Math.min(clusters.length, limit),
      total_edges: edges.size,
      clusters: clusters.slice(0, limit),
    },
  };
}
