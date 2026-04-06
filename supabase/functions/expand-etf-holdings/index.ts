import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("expand-etf-holdings");

const SEC_UA = "Relai CRM admin@relai.com";

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
let lastReqTime = 0;

async function secFetch(url: string): Promise<Response> {
  const now = Date.now();
  if (now - lastReqTime < 200) await delay(200 - (now - lastReqTime));
  lastReqTime = Date.now();
  return fetch(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json" } });
}

async function secFetchText(url: string): Promise<string> {
  const res = await secFetch(url);
  if (!res.ok) throw new Error(`SEC fetch ${res.status}: ${url}`);
  return res.text();
}

/**
 * Expand ETF Holdings via SEC EDGAR N-PORT filings.
 *
 * Strategy:
 * 1. For each ETF CUSIP, find the trust's CIK via submissions API
 * 2. Get the trust's latest N-PORT filing
 * 3. Parse the XML for the series matching our CUSIP
 * 4. Extract holdings (securities, weights, values)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const { etf_security_id, fund_id } = body;

    // 1. Determine which ETFs need expansion
    let etfIds: string[] = [];

    if (etf_security_id) {
      etfIds = [etf_security_id];
    } else {
      let query = sb
        .from("fund_reported_holdings")
        .select("security_id")
        .eq("is_etf", true)
        .not("security_id", "is", null);

      if (fund_id) query = query.eq("fund_id", fund_id);

      const { data: heldEtfs } = await query;
      const uniqueEtfIds = [...new Set((heldEtfs || []).map(h => h.security_id))];

      const existingSet = new Set<string>();
      for (let i = 0; i < uniqueEtfIds.length; i += 200) {
        const batch = uniqueEtfIds.slice(i, i + 200);
        const { data: existing } = await sb
          .from("etf_constituent_snapshots")
          .select("etf_security_id")
          .in("etf_security_id", batch);
        for (const e of (existing || [])) existingSet.add(e.etf_security_id);
      }
      etfIds = uniqueEtfIds.filter(id => !existingSet.has(id));
    }

    if (etfIds.length === 0) {
      return jsonResponse({ success: true, message: "No ETFs need expansion", expanded: 0 });
    }

    const batchLimit = body.batch_limit || 10; // Limit per invocation for timeout safety
    const { data: etfSecurities } = await sb
      .from("security_master")
      .select("id, issuer_name, cusip, ticker")
      .in("id", etfIds.slice(0, batchLimit));

    if (!etfSecurities?.length) {
      return jsonResponse({ success: true, message: "No ETF securities found", expanded: 0 });
    }

    logger.info(`Expanding ${etfSecurities.length} ETFs via SEC EDGAR N-PORT`);

    // Load company_tickers.json for ticker → CIK lookup (needed for fallback)
    // This is cached per invocation
    let tickerToCik: Map<string, string> | null = null;

    async function getTickerToCik(): Promise<Map<string, string>> {
      if (tickerToCik) return tickerToCik;
      const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
      if (!res.ok) throw new Error("Failed to fetch company_tickers.json");
      const data = await res.json();
      tickerToCik = new Map();
      for (const key of Object.keys(data)) {
        const e = data[key];
        if (e.ticker) tickerToCik.set(e.ticker.toUpperCase(), String(e.cik_str));
      }
      return tickerToCik;
    }

    let totalConstituents = 0;
    const results: any[] = [];

    for (const etf of etfSecurities) {
      try {
        // Step 1: Find the ETF trust's CIK
        const cik = await findEtfCik(etf.cusip, etf.issuer_name, etf.ticker, getTickerToCik);

        if (!cik) {
          logger.warn(`${etf.issuer_name} (${etf.cusip}): Could not find CIK`);
          // Insert a placeholder so this ETF isn't retried forever
          await sb.from("etf_constituent_snapshots").insert({
            etf_security_id: etf.id, as_of_date: new Date().toISOString().slice(0, 10),
            constituent_security_id: etf.id, weight_pct: 0,
            source_type: "failed_lookup", source_reference: "cik_not_found",
          });
          results.push({ etf: etf.issuer_name, cusip: etf.cusip, status: "cik_not_found" });
          continue;
        }

        logger.info(`${etf.issuer_name}: Found CIK ${cik}`);

        // Step 2: Get the trust's latest N-PORT filing
        const nportFiling = await findLatestNport(cik);

        if (!nportFiling) {
          logger.warn(`${etf.issuer_name}: No N-PORT filings found`);
          await sb.from("etf_constituent_snapshots").insert({
            etf_security_id: etf.id, as_of_date: new Date().toISOString().slice(0, 10),
            constituent_security_id: etf.id, weight_pct: 0,
            source_type: "failed_lookup", source_reference: `no_nport_cik_${cik}`,
          });
          results.push({ etf: etf.issuer_name, cusip: etf.cusip, status: "no_nport_filing", cik });
          continue;
        }

        // Step 3: Download and parse the N-PORT XML
        const holdings = await fetchNportHoldings(nportFiling, etf.cusip);

        if (!holdings.length) {
          logger.warn(`${etf.issuer_name}: No holdings parsed from N-PORT`);
          await sb.from("etf_constituent_snapshots").insert({
            etf_security_id: etf.id, as_of_date: new Date().toISOString().slice(0, 10),
            constituent_security_id: etf.id, weight_pct: 0,
            source_type: "failed_lookup", source_reference: `no_holdings_${nportFiling.accessionNumber}`,
          });
          results.push({ etf: etf.issuer_name, cusip: etf.cusip, status: "no_holdings_parsed", cik });
          continue;
        }

        // Step 4: Store constituents
        const top = holdings.slice(0, 100);
        let stored = 0;

        for (const h of top) {
          let secId = await findOrCreateSecurity(sb, h);
          if (!secId) continue;

          const { error } = await sb
            .from("etf_constituent_snapshots")
            .insert({
              etf_security_id: etf.id,
              as_of_date: h.report_date,
              constituent_security_id: secId,
              weight_pct: h.weight_pct,
              source_type: "sec_nport",
              source_reference: `nport/${nportFiling.accessionNumber}`,
            });

          if (!error) stored++;
        }

        totalConstituents += stored;
        logger.info(`${etf.issuer_name}: ${stored} constituents stored from N-PORT`);
        results.push({ etf: etf.issuer_name, cusip: etf.cusip, status: "expanded", constituents: stored, cik });
      } catch (e: any) {
        logger.error(`Error expanding ${etf.issuer_name}`, { error: e.message });
        results.push({ etf: etf.issuer_name, cusip: etf.cusip, status: `error: ${e.message}` });
      }
    }

    return jsonResponse({ success: true, etfs_processed: etfSecurities.length, total_constituents_stored: totalConstituents, details: results });
  } catch (e: any) {
    logger.error("ETF expansion error", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});

// ─── CIK Lookup ───────────────────────────────────────────────────

// Well-known ETF trust CIK mappings for families that share a single trust
const KNOWN_TRUST_CIKS: Record<string, string> = {
  "ISHARES": "1100663",
  "ISHARES TR": "1100663",
  "ISHARES INC": "88053",
  "VANGUARD": "102909",
  "VANGUARD INDEX": "36405",
  "VANGUARD INTL": "932190",
  "SPDR": "884394",
  "SPDR S&P": "884394",
  "SPDR SERIES": "1064642",
  "SELECT SECTOR SPDR": "1064642",
  "PROSHARES TR": "1174610",
  "PROSHARES": "1174610",
  "SCHWAB STRATEGIC": "1352641",
  "WISDOMTREE": "880859",
  "FIRST TR": "1364089",
  "FIRST TRUST": "1364089",
  "GLOBAL X": "1432353",
  "ARK ETF TR": "1593538",
  "DIREXION": "1424958",
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function findEtfCik(
  cusip: string,
  issuerName: string,
  ticker: string | null,
  getTickerMap: () => Promise<Map<string, string>>
): Promise<string | null> {
  const decodedName = decodeHtmlEntities(issuerName);

  // Strategy 1: If we have a ticker, use company_tickers.json
  if (ticker) {
    const map = await getTickerMap();
    const cik = map.get(ticker.toUpperCase());
    if (cik) return cik;
  }

  // Strategy 2: Check known trust CIK mappings
  const nameUpper = decodedName.toUpperCase().trim();
  for (const [prefix, cik] of Object.entries(KNOWN_TRUST_CIKS)) {
    if (nameUpper.startsWith(prefix.toUpperCase())) {
      return cik;
    }
  }

  // Strategy 3: Search EDGAR by decoded company name
  try {
    // Clean name: remove trailing suffixes, decode entities
    let cleanName = decodedName.replace(/\s+(TR|TRUST|INC|CORP|LLC)\.?\s*$/gi, "").trim();
    // Also try removing "ETF" from the end
    cleanName = cleanName.replace(/\s+ETF\s*$/gi, "").trim();

    const browseUrl = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(cleanName)}&CIK=&type=NPORT-P&dateb=&owner=include&count=5&search_text=&action=getcompany&output=atom`;
    const res = await secFetch(browseUrl);
    if (res.ok) {
      const text = await res.text();
      const cikMatch = text.match(/<CIK>(\d+)<\/CIK>/i) || text.match(/CIK=0*(\d+)/);
      if (cikMatch) return cikMatch[1];
    }
  } catch { /* continue */ }

  // Strategy 4: Try full original name (with "TRUST" expanded)
  try {
    const fullName = decodedName.replace(/\bTR\b/g, "TRUST").trim();
    const browseUrl = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(fullName)}&CIK=&type=NPORT-P&dateb=&owner=include&count=5&search_text=&action=getcompany&output=atom`;
    const res = await secFetch(browseUrl);
    if (res.ok) {
      const text = await res.text();
      const cikMatch = text.match(/<CIK>(\d+)<\/CIK>/i) || text.match(/CIK=0*(\d+)/);
      if (cikMatch) return cikMatch[1];
    }
  } catch { /* give up */ }

  return null;
}

// ─── N-PORT Filing Discovery ──────────────────────────────────────

interface NportFilingRef {
  accessionNumber: string;
  filingDate: string;
  periodEnding: string;
  cik: string;
}

async function findLatestNport(cik: string): Promise<NportFilingRef | null> {
  const paddedCik = cik.padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  const res = await secFetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent) return null;

  // Find the most recent N-PORT filing
  for (let i = 0; i < (recent.form || []).length; i++) {
    const form = recent.form[i];
    if (form === "NPORT-P" || form === "NPORT-P/A") {
      return {
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        periodEnding: recent.reportDate?.[i] || recent.filingDate[i],
        cik,
      };
    }
  }

  return null;
}

// ─── N-PORT XML Fetching & Parsing ────────────────────────────────

interface ParsedHolding {
  issuer_name: string;
  cusip: string | null;
  ticker: string | null;
  asset_type: string;
  weight_pct: number;
  value_usd: number;
  shares: number;
  report_date: string;
}

async function fetchNportHoldings(filing: NportFilingRef, etfCusip: string): Promise<ParsedHolding[]> {
  // Strip leading zeros from CIK for archive URLs
  const cikNum = filing.cik.replace(/^0+/, "");
  const accClean = filing.accessionNumber.replace(/-/g, "");

  // N-PORT filings always have primary_doc.xml as the main document
  const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accClean}/primary_doc.xml`;
  logger.info(`Fetching N-PORT XML: ${xmlUrl}`);

  const xmlText = await secFetchText(xmlUrl);
  logger.info(`XML size: ${xmlText.length} bytes`);

  return parseNportXml(xmlText, filing.periodEnding, etfCusip);
}

function parseNportXml(xml: string, reportDate: string, etfCusip: string): ParsedHolding[] {
  const holdings: ParsedHolding[] = [];

  // Extract report period date
  const repDateMatch = xml.match(/<(?:\w+:)?repPdDate[^>]*>([^<]+)<\/(?:\w+:)?repPdDate>/);
  const actualDate = repDateMatch?.[1] || reportDate;

  // N-PORT XML has <invstOrSec> elements for each holding
  // Handle both namespaced and non-namespaced variants
  const invstPattern = /<(?:\w+:)?invstOrSec>([\s\S]*?)<\/(?:\w+:)?invstOrSec>/g;
  let match;

  while ((match = invstPattern.exec(xml)) !== null) {
    const block = match[1];

    const name = xval(block, "name");
    const cusip = xval(block, "cusip");
    const balance = parseFloat(xval(block, "balance") || "0");
    const valUSD = parseFloat(xval(block, "valUSD") || "0");
    const pctVal = parseFloat(xval(block, "pctVal") || "0");
    const assetCat = xval(block, "assetCat");

    if (!name || pctVal <= 0) continue;
    if (cusip === etfCusip) continue; // skip self-reference

    const tickerMatch = block.match(/<(?:\w+:)?ticker[^>]*>([^<]+)<\/(?:\w+:)?ticker>/);

    holdings.push({
      issuer_name: name,
      cusip: cusip || null,
      ticker: tickerMatch?.[1]?.trim() || null,
      asset_type: mapAssetCat(assetCat),
      weight_pct: pctVal,
      value_usd: valUSD,
      shares: balance,
      report_date: actualDate,
    });
  }

  holdings.sort((a, b) => b.weight_pct - a.weight_pct);
  return holdings;
}

function xval(block: string, tag: string): string {
  const m = block.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)<\\/(?:\\w+:)?${tag}>`, "i"));
  return m?.[1]?.trim() || "";
}

function mapAssetCat(cat: string): string {
  const c = (cat || "").toUpperCase();
  if (c === "EC" || c === "EP") return "equity";
  if (c === "DBT" || c === "DT") return "debt";
  if (c === "ABS") return "abs";
  if (c === "MBS") return "mbs";
  if (c === "STIV") return "short_term";
  return "equity";
}

// ─── Security Master Helpers ──────────────────────────────────────

async function findOrCreateSecurity(sb: any, h: ParsedHolding): Promise<string | null> {
  // Try CUSIP match first
  if (h.cusip) {
    const { data } = await sb.from("security_master").select("id").eq("cusip", h.cusip).limit(1).single();
    if (data) return data.id;
  }

  // Try ticker match
  if (h.ticker) {
    const { data } = await sb.from("security_master").select("id").eq("ticker", h.ticker).limit(1).single();
    if (data) return data.id;
  }

  // Create new security
  const { data: newSec, error } = await sb
    .from("security_master")
    .insert({
      ticker: h.ticker || null,
      issuer_name: h.issuer_name,
      cusip: h.cusip || null,
      security_type: h.asset_type,
      is_etf: false,
    })
    .select("id")
    .single();

  if (error) {
    logger.error(`Failed to create security for ${h.issuer_name}`, { error: error.message });
    return null;
  }
  return newSec.id;
}
