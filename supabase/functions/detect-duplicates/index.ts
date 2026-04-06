import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("detect-duplicates");

// ─── Normalization helpers ─────────────────────────────────────────

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
  "intl": "international", "mgt": "management", "mgmt": "management",
  "adv": "advisors", "svcs": "services", "svc": "service",
  "assoc": "associates", "grp": "group", "hldgs": "holdings",
  "inv": "investment", "tech": "technology", "fin": "financial",
  "natl": "national", "amer": "american", "euro": "european",
  "sys": "systems", "dev": "development",
};

function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.,"""\-\(\)\/\\:;!?#@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normSansLegal(name: string): string {
  let n = normalize(name);
  let prev = "";
  while (prev !== n) { prev = n; n = n.replace(LEGAL_RE, "").trim(); }
  return n;
}

function tokenize(normalized: string): string[] {
  return normalized.split(/\s+/).filter(t => t.length > 0);
}

function expandAbbreviations(tokens: string[]): string[] {
  return tokens.map(t => ABBREV_MAP[t] || t);
}

function coreTokens(tokens: string[]): string[] {
  const expanded = expandAbbreviations(tokens);
  const core = expanded.filter(t => !BUSINESS_WORDS.has(t) && !LEGAL_SUFFIXES.includes(t));
  return core.length > 0 ? core : expanded;
}

function makeAcronym(tokens: string[]): string {
  const skipWords = new Set(["and", "the", "of", "for", "in", "a", "an", "or"]);
  return tokens.filter(t => !skipWords.has(t) && t.length > 0).map(t => t[0]).join("");
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

// ─── Account record ────────────────────────────────────────────────

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
  return { id: c.id, name: c.name, normalized, sansLegal, tokens: toks,
    coreTokens: core, expandedTokens: expanded,
    acronym: makeAcronym(expanded), coreAcronym: makeAcronym(core) };
}

// ─── Pairwise scoring ──────────────────────────────────────────────

interface PairResult {
  idA: string; idB: string;
  match_type: string; confidence: number; match_reasons: string[];
}

function scorePair(a: AccountRec, b: AccountRec): PairResult | null {
  const reasons: string[] = [];
  let maxConfidence = 0;
  let matchType = "fuzzy";

  if (a.normalized === b.normalized && a.normalized.length >= 2) {
    reasons.push("Exact normalized name match");
    maxConfidence = Math.max(maxConfidence, 98); matchType = "exact";
  }
  if (a.sansLegal === b.sansLegal && a.sansLegal.length >= 2 && a.normalized !== b.normalized) {
    reasons.push("Match after removing legal suffixes");
    maxConfidence = Math.max(maxConfidence, 92);
    if (maxConfidence <= 92) matchType = "exact_sans_legal";
  }
  if (a.acronym.length >= 2 && b.acronym.length >= 2) {
    const aClean = a.sansLegal.replace(/\s+/g, "");
    const bClean = b.sansLegal.replace(/\s+/g, "");
    if (aClean === b.acronym || aClean === b.coreAcronym) {
      reasons.push(`Abbreviation: "${a.name}" matches acronym of "${b.name}"`);
      maxConfidence = Math.max(maxConfidence, 82); matchType = "abbreviation";
    }
    if (bClean === a.acronym || bClean === a.coreAcronym) {
      reasons.push(`Abbreviation: "${b.name}" matches acronym of "${a.name}"`);
      maxConfidence = Math.max(maxConfidence, 82); matchType = "abbreviation";
    }
  }
  if (a.coreTokens.length >= 1 && b.coreTokens.length >= 1) {
    const overlap = tokenOverlap(a.coreTokens, b.coreTokens);
    if (overlap >= 0.8 && a.coreTokens.length + b.coreTokens.length >= 3) {
      reasons.push(`Core token overlap: ${Math.round(overlap * 100)}%`);
      maxConfidence = Math.max(maxConfidence, Math.round(60 + overlap * 30));
    }
  }
  if (a.expandedTokens.length >= 1 && b.expandedTokens.length >= 1) {
    const overlap = tokenOverlap(a.expandedTokens, b.expandedTokens);
    if (overlap >= 0.7 && a.expandedTokens.length + b.expandedTokens.length >= 3) {
      if (!reasons.some(r => r.includes("Core token"))) {
        reasons.push(`Expanded token overlap: ${Math.round(overlap * 100)}%`);
        maxConfidence = Math.max(maxConfidence, Math.round(55 + overlap * 30));
      }
    }
  }
  if (a.sansLegal.length >= 3 && b.sansLegal.length >= 3) {
    const dice = diceCoefficient(a.sansLegal, b.sansLegal);
    if (dice >= 0.65) {
      reasons.push(`Fuzzy similarity: ${Math.round(dice * 100)}%`);
      maxConfidence = Math.max(maxConfidence, Math.round(50 + dice * 40));
      if (matchType === "fuzzy" && dice >= 0.8) matchType = "strong_fuzzy";
    }
  }
  {
    const aStrip = a.sansLegal.replace(/\s+/g, "");
    const bStrip = b.sansLegal.replace(/\s+/g, "");
    if (aStrip === bStrip && aStrip.length >= 2 && a.sansLegal !== b.sansLegal) {
      reasons.push("Spacing/punctuation variant");
      maxConfidence = Math.max(maxConfidence, 90); matchType = "punctuation_variant";
    }
  }
  if (reasons.length === 0 || maxConfidence < 50) return null;
  return { idA: a.id, idB: b.id, match_type: matchType, confidence: maxConfidence, match_reasons: reasons };
}

// ─── Union-Find for clustering ─────────────────────────────────────

class UnionFind {
  parent: Map<string, string> = new Map();
  rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let curr = x;
    while (curr !== root) { const next = this.parent.get(curr)!; this.parent.set(curr, root); curr = next; }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a); const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!; const rankB = this.rank.get(rb)!;
    if (rankA < rankB) this.parent.set(ra, rb);
    else if (rankA > rankB) this.parent.set(rb, ra);
    else { this.parent.set(rb, ra); this.rank.set(ra, rankA + 1); }
  }
}

// ─── Serve ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { min_confidence = 50, limit = 500 } = await req.json().catch(() => ({}));

    // 1. Fetch all non-merged accounts (paginated)
    const allClients: { id: string; name: string }[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await sb.from("clients").select("id, name")
        .eq("is_merged", false).range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allClients.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // 2. Fetch aliases
    const { data: aliases } = await sb.from("client_aliases").select("client_id, alias_name, normalized_alias");
    const aliasMap = new Map<string, { clientId: string; aliasName: string }[]>();
    for (const a of (aliases || [])) {
      const norm = a.normalized_alias;
      if (!aliasMap.has(norm)) aliasMap.set(norm, []);
      aliasMap.get(norm)!.push({ clientId: a.client_id, aliasName: a.alias_name });
    }

    // 3. Fetch shared external mappings
    const { data: extMappings } = await sb.from("external_source_mappings")
      .select("client_id, external_identifier, external_source_type");
    const extByIdentifier = new Map<string, string[]>();
    for (const m of (extMappings || [])) {
      if (!m.external_identifier) continue;
      const key = `${m.external_source_type}:${m.external_identifier}`;
      if (!extByIdentifier.has(key)) extByIdentifier.set(key, []);
      extByIdentifier.get(key)!.push(m.client_id);
    }
    const sharedExtPairs = new Set<string>();
    for (const [, clientIds] of extByIdentifier) {
      if (clientIds.length < 2) continue;
      for (let i = 0; i < clientIds.length; i++)
        for (let j = i + 1; j < clientIds.length; j++)
          sharedExtPairs.add([clientIds[i], clientIds[j]].sort().join(":"));
    }

    // 4. Precompute records & blocking index
    const recs = allClients.map(buildRec);
    const recById = new Map<string, AccountRec>();
    for (const r of recs) recById.set(r.id, r);

    const blocks = new Map<string, number[]>();
    const addToBlock = (key: string, idx: number) => {
      if (!key || key.length < 1) return;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key)!.push(idx);
    };
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.sansLegal.length >= 2) addToBlock(r.sansLegal.slice(0, 2), i);
      if (r.sansLegal.length >= 3) addToBlock(r.sansLegal.slice(0, 3), i);
      if (r.acronym.length >= 2) addToBlock(r.acronym, i);
      if (r.coreAcronym.length >= 2) addToBlock(r.coreAcronym, i);
      if (r.coreTokens.length > 0) addToBlock(r.coreTokens[0], i);
      const stripped = r.sansLegal.replace(/\s+/g, "");
      if (stripped.length >= 2) addToBlock(stripped.slice(0, 3), i);
    }

    // 5. Score candidate pairs & collect edges
    // edges: Map<pairKey, PairResult>
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
          if (sharedExtPairs.has(key)) {
            result.confidence = Math.min(99, result.confidence + 10);
            result.match_reasons.push("Shared external mapping (SEC/other)");
          }
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
        if (edges.has(key)) {
          edges.get(key)!.match_reasons.push(`Alias "${ma.aliasName}" matches account name`);
          edges.get(key)!.confidence = Math.max(edges.get(key)!.confidence, 90);
          continue;
        }
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        edges.set(key, {
          idA: r.id, idB: ma.clientId, match_type: "alias", confidence: 90,
          match_reasons: [`Alias "${ma.aliasName}" matches account name`],
        });
      }
    }

    // External mapping pairs not yet seen
    for (const pairKey of sharedExtPairs) {
      if (edges.has(pairKey)) continue;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const [idA, idB] = pairKey.split(":");
      if (recById.has(idA) && recById.has(idB)) {
        edges.set(pairKey, {
          idA, idB, match_type: "shared_mapping", confidence: 75,
          match_reasons: ["Shared external identifier (SEC/other)"],
        });
      }
    }

    // 6. Build clusters using union-find on edges with confidence >= min_confidence
    const uf = new UnionFind();
    for (const [, edge] of edges) {
      uf.union(edge.idA, edge.idB);
    }

    // Group account IDs by cluster root
    const clusterMap = new Map<string, Set<string>>();
    for (const [, edge] of edges) {
      const root = uf.find(edge.idA);
      if (!clusterMap.has(root)) clusterMap.set(root, new Set());
      clusterMap.get(root)!.add(edge.idA);
      clusterMap.get(root)!.add(edge.idB);
    }

    // 7. Build cluster response objects
    interface ClusterMember {
      id: string;
      name: string;
      match_reasons: string[];
      member_confidence: number;
    }
    interface DuplicateCluster {
      cluster_id: string;
      members: ClusterMember[];
      max_confidence: number;
      avg_confidence: number;
      match_types: string[];
      all_reasons: string[];
      member_count: number;
      edges: { id_a: string; id_b: string; confidence: number; match_type: string; reasons: string[] }[];
    }

    const clusters: DuplicateCluster[] = [];

    for (const [root, memberIds] of clusterMap) {
      if (memberIds.size < 2) continue;

      // Collect edges for this cluster
      const clusterEdges: DuplicateCluster["edges"] = [];
      const matchTypes = new Set<string>();
      const allReasons = new Set<string>();
      let totalConf = 0; let edgeCount = 0;
      let maxConf = 0;

      // Per-member: aggregate reasons and max confidence from edges
      const memberReasons = new Map<string, Set<string>>();
      const memberMaxConf = new Map<string, number>();
      for (const mid of memberIds) {
        memberReasons.set(mid, new Set());
        memberMaxConf.set(mid, 0);
      }

      for (const [key, edge] of edges) {
        if (uf.find(edge.idA) !== root) continue;
        clusterEdges.push({
          id_a: edge.idA, id_b: edge.idB, confidence: edge.confidence,
          match_type: edge.match_type, reasons: edge.match_reasons,
        });
        matchTypes.add(edge.match_type);
        for (const r of edge.match_reasons) allReasons.add(r);
        totalConf += edge.confidence; edgeCount++;
        maxConf = Math.max(maxConf, edge.confidence);

        // Attribute reasons to members
        for (const r of edge.match_reasons) {
          memberReasons.get(edge.idA)?.add(r);
          memberReasons.get(edge.idB)?.add(r);
        }
        memberMaxConf.set(edge.idA, Math.max(memberMaxConf.get(edge.idA) || 0, edge.confidence));
        memberMaxConf.set(edge.idB, Math.max(memberMaxConf.get(edge.idB) || 0, edge.confidence));
      }

      const members: ClusterMember[] = Array.from(memberIds).map(mid => {
        const rec = recById.get(mid);
        return {
          id: mid,
          name: rec?.name || mid,
          match_reasons: Array.from(memberReasons.get(mid) || []),
          member_confidence: memberMaxConf.get(mid) || 0,
        };
      }).sort((a, b) => b.member_confidence - a.member_confidence);

      clusters.push({
        cluster_id: root,
        members,
        max_confidence: maxConf,
        avg_confidence: edgeCount > 0 ? Math.round(totalConf / edgeCount) : 0,
        match_types: Array.from(matchTypes),
        all_reasons: Array.from(allReasons),
        member_count: members.length,
        edges: clusterEdges,
      });
    }

    // Sort clusters by max confidence descending
    clusters.sort((a, b) => b.max_confidence - a.max_confidence);
    const limited = clusters.slice(0, limit);

    logger.info("Duplicate detection completed", { total_accounts: allClients.length, cluster_count: limited.length, total_edges: edges.size, pairs_checked: seenPairs.size });

    return jsonResponse({
      success: true,
      total_accounts: allClients.length,
      cluster_count: limited.length,
      total_edges: edges.size,
      clusters: limited,
    });

  } catch (e: any) {
    logger.error("Duplicate detection failed", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});
