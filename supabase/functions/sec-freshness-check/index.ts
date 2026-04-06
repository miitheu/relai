import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("sec-freshness-check");

const SEC_HEADERS = {
  "User-Agent": "Relai CRM support@relai.com",
  Accept: "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Get client
    const { data: client } = await sb.from("clients").select("name, client_type").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    // Get last completed run with SEC data
    const { data: lastRuns } = await sb.from("fund_intelligence_runs")
      .select("id, filing_date, filing_cik, filing_url, created_at, playbook_type")
      .eq("client_id", client_id)
      .eq("run_status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastRun = lastRuns?.[0];
    const lastCik = lastRun?.filing_cik;
    const lastFilingDate = lastRun?.filing_date;

    if (!lastCik) {
      // No CIK found — try to discover one
      const searchName = client.name.replace(/[^a-zA-Z0-9\s]/g, "").trim();
      let discoveredCik: string | null = null;
      let latestFilingDate: string | null = null;

      try {
        const searchResp = await fetch(
          `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(searchName)}%22&forms=13F-HR&from=0&size=1`,
          { headers: SEC_HEADERS }
        );
        if (searchResp.ok) {
          const data = await searchResp.json();
          if (data.hits?.hits?.length > 0) {
            discoveredCik = data.hits.hits[0]._source?.ciks?.[0] || null;
            latestFilingDate = data.hits.hits[0]._source?.file_date || null;
          }
        }
      } catch {}

      return jsonResponse({
        has_sec_data: false,
        cik: discoveredCik,
        latest_filing_available: latestFilingDate ? { date: latestFilingDate, cik: discoveredCik } : null,
        last_processed_filing: null,
        new_filing_available: !!latestFilingDate,
        freshness_status: "no_data",
      });
    }

    // Check SEC for latest filing for this CIK
    const paddedCik = lastCik.padStart(10, "0");
    let latestFiling: any = null;

    try {
      const subResp = await fetch(
        `https://data.sec.gov/submissions/CIK${paddedCik}.json`,
        { headers: SEC_HEADERS }
      );
      if (subResp.ok) {
        const subData = await subResp.json();
        const recent = subData.filings?.recent;
        if (recent) {
          const idx = recent.form?.findIndex((f: string) => f === "13F-HR" || f === "13F-HR/A");
          if (idx >= 0) {
            const accession = recent.accessionNumber[idx].replace(/-/g, "");
            latestFiling = {
              date: recent.filingDate[idx],
              type: recent.form[idx],
              accession: recent.accessionNumber[idx],
              url: `https://www.sec.gov/Archives/edgar/data/${lastCik}/${accession}/${recent.primaryDocument[idx]}`,
            };
          }
        }
      }
    } catch (e) {
      logger.error("SEC check failed", { error: (e as Error).message });
    }

    const newFilingAvailable = latestFiling && lastFilingDate && latestFiling.date > lastFilingDate;
    const lastRunAge = lastRun ? Math.floor((Date.now() - new Date(lastRun.created_at).getTime()) / (1000 * 60 * 60 * 24)) : null;

    // Compute freshness
    let freshness_status = "fresh";
    if (newFilingAvailable) freshness_status = "new_source_available";
    else if (lastRunAge && lastRunAge > 90) freshness_status = "stale";
    else if (lastRunAge && lastRunAge > 30) freshness_status = "aging";

    // Update summary freshness
    const updateData: any = {
      freshness_status,
      freshness_checked_at: new Date().toISOString(),
    };
    if (newFilingAvailable && latestFiling) {
      updateData.new_source_available = true;
      updateData.new_source_metadata = {
        filing_date: latestFiling.date,
        filing_type: latestFiling.type,
        filing_url: latestFiling.url,
        detected_at: new Date().toISOString(),
      };
    }
    await sb.from("account_intelligence_summaries").update(updateData).eq("client_id", client_id);

    return jsonResponse({
      has_sec_data: true,
      cik: lastCik,
      last_processed_filing: {
        date: lastFilingDate,
        run_id: lastRun?.id,
        run_date: lastRun?.created_at,
      },
      latest_filing_available: latestFiling,
      new_filing_available: !!newFilingAvailable,
      freshness_status,
      days_since_last_run: lastRunAge,
    });

  } catch (e: any) {
    logger.error("SEC freshness check error", { error: e.message });
    return errorResponse("An internal error occurred", 400);
  }
});
