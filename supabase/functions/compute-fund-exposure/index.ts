import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("compute-fund-exposure");

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
    const { fund_id, report_date } = await req.json();

    // If fund_id provided, compute for that fund only; otherwise compute for all
    let fundsToProcess: { fund_id: string; report_date: string }[] = [];

    if (fund_id && report_date) {
      fundsToProcess = [{ fund_id, report_date }];
    } else {
      // Get latest report_date per fund
      const { data: latestFilings, error } = await sb
        .from("fund_reported_holdings")
        .select("fund_id, report_date")
        .order("report_date", { ascending: false });

      if (error) throw error;

      const seen = new Set<string>();
      for (const row of latestFilings || []) {
        const key = row.fund_id;
        if (!seen.has(key)) {
          seen.add(key);
          fundsToProcess.push({ fund_id: row.fund_id, report_date: row.report_date });
        }
      }
    }

    logger.info(`Computing exposure for ${fundsToProcess.length} fund(s)`);

    let totalInserted = 0;

    for (const { fund_id: fid, report_date: rd } of fundsToProcess) {
      // 1. Delete existing exposure for this fund+date
      await sb
        .from("fund_effective_exposure")
        .delete()
        .eq("fund_id", fid)
        .eq("report_date", rd);

      // 2. Get all non-ETF holdings (direct exposure)
      const { data: directHoldings } = await sb
        .from("fund_reported_holdings")
        .select("security_id, weight_pct")
        .eq("fund_id", fid)
        .eq("report_date", rd)
        .eq("is_etf", false)
        .not("security_id", "is", null);

      // Aggregate by security
      const directMap = new Map<string, number>();
      for (const h of directHoldings || []) {
        directMap.set(h.security_id, (directMap.get(h.security_id) || 0) + (h.weight_pct || 0));
      }

      // 3. Get ETF holdings for this fund
      const { data: etfHoldings } = await sb
        .from("fund_reported_holdings")
        .select("security_id, weight_pct")
        .eq("fund_id", fid)
        .eq("report_date", rd)
        .eq("is_etf", true)
        .not("security_id", "is", null);

      // 4. For each ETF holding, look up constituents and compute implied exposure
      const impliedMap = new Map<string, { weight: number; sources: any[] }>();

      for (const etf of etfHoldings || []) {
        const etfWeight = etf.weight_pct || 0;
        if (etfWeight === 0) continue;

        // Get latest constituent snapshot for this ETF
        const { data: constituents } = await sb
          .from("etf_constituent_snapshots")
          .select("constituent_security_id, weight_pct, as_of_date")
          .eq("etf_security_id", etf.security_id)
          .order("as_of_date", { ascending: false })
          .limit(500);

        if (!constituents || constituents.length === 0) continue;

        // Use only the latest snapshot date
        const latestDate = constituents[0].as_of_date;
        const latestConstituents = constituents.filter(c => c.as_of_date === latestDate);

        // Get ETF name for source breakdown
        const { data: etfSecurity } = await sb
          .from("security_master")
          .select("issuer_name, ticker")
          .eq("id", etf.security_id)
          .single();

        for (const c of latestConstituents) {
          const impliedWeight = (etfWeight / 100) * (c.weight_pct || 0);
          const existing = impliedMap.get(c.constituent_security_id) || { weight: 0, sources: [] };
          existing.weight += impliedWeight;
          existing.sources.push({
            type: "etf_lookthrough",
            etf_name: etfSecurity?.issuer_name || "Unknown ETF",
            etf_ticker: etfSecurity?.ticker,
            etf_weight_pct: etfWeight,
            constituent_weight_in_etf: c.weight_pct,
            implied_weight_pct: impliedWeight,
          });
          impliedMap.set(c.constituent_security_id, existing);
        }
      }

      // 5. Merge direct + implied into exposure rows
      const allSecurities = new Set([...directMap.keys(), ...impliedMap.keys()]);
      const rows: any[] = [];

      for (const secId of allSecurities) {
        const directPct = directMap.get(secId) || 0;
        const implied = impliedMap.get(secId) || { weight: 0, sources: [] };
        const sources: any[] = [];
        if (directPct > 0) {
          sources.push({ type: "direct", weight_pct: directPct });
        }
        sources.push(...implied.sources);

        rows.push({
          fund_id: fid,
          report_date: rd,
          security_id: secId,
          direct_weight_pct: directPct,
          implied_etf_weight_pct: implied.weight,
          source_breakdown_json: sources,
        });
      }

      // 6. Batch insert
      if (rows.length > 0) {
        const batchSize = 500;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error: insertErr } = await sb
            .from("fund_effective_exposure")
            .insert(batch);
          if (insertErr) {
            logger.error(`Insert error for fund ${fid}`, { error: insertErr.message });
          }
        }
        totalInserted += rows.length;
      }

      logger.info(`Fund ${fid}: ${rows.length} exposure rows`, { direct: directMap.size, viaETF: impliedMap.size });
    }

    return jsonResponse({
      success: true,
      funds_processed: fundsToProcess.length,
      total_exposure_rows: totalInserted,
    });
  } catch (e: any) {
    logger.error("Exposure computation error", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});
