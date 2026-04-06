import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { callAIWithRetry } from "../_shared/ai.ts";
import { webSearch, fetchPageText, batchWebSearch } from "../_shared/web-search.ts";
import { searchSECFiler, fetchSubmissions } from "../_shared/sec-search.ts";

const log = createLogger("web-enrich");

const ENRICHMENT_STEPS = [
  "account_classification",
  "sec_data_collection",
  "web_search_company",
  "web_search_news",
  "web_search_contacts",
  "web_search_tech_funding",
  "ai_synthesis",
  "store_results",
];

// ─── Step helpers ─────────────────────────────────────────────────
async function updateStep(sb: any, stepId: string, update: Record<string, any>) {
  await sb.from("intelligence_run_steps").update({ ...update, updated_at: new Date().toISOString() }).eq("id", stepId);
}

async function updateRunProgress(sb: any, runId: string, currentStep: string, completedSteps: number) {
  await sb.from("fund_intelligence_runs").update({
    current_step: currentStep,
    completed_steps: completedSteps,
    updated_at: new Date().toISOString(),
  }).eq("id", runId);
}

// ─── Main handler ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  const auth = await verifyAuth(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { client_id, enrichment_types } = await req.json();
    if (!client_id) return errorResponse("client_id is required", 400);

    // Fetch client
    const { data: client, error: clientErr } = await sb
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();
    if (clientErr || !client) return errorResponse("Client not found", 404);

    log.info(`Starting web enrichment for: ${client.name}`);

    // Create run record
    const { data: run, error: runErr } = await sb.from("fund_intelligence_runs").insert({
      client_id,
      filing_source: "Web Search + SEC",
      filing_type: "web_enrichment",
      playbook_type: "web_enrichment",
      run_status: "processing",
      run_reason: "manual",
      triggered_by: auth.userId,
      generated_by: auth.userId,
      total_steps: ENRICHMENT_STEPS.length,
      completed_steps: 0,
      current_step: ENRICHMENT_STEPS[0],
    }).select().single();

    if (runErr) throw new Error(`Failed to create run: ${runErr.message}`);

    // Create step records
    const stepRecords = ENRICHMENT_STEPS.map((name, i) => ({
      run_id: run.id,
      step_name: name,
      step_order: i + 1,
      step_status: "pending",
    }));
    const { data: steps } = await sb.from("intelligence_run_steps").insert(stepRecords).select();
    const stepMap: Record<string, string> = {};
    for (const s of (steps || [])) stepMap[s.step_name] = s.id;

    try {
      let completedCount = 0;
      const webData: Record<string, any> = {};

      // ═══ STEP 1: Account Classification ═══
      const classStepId = stepMap["account_classification"];
      await updateStep(sb, classStepId, { step_status: "running", started_at: new Date().toISOString() });

      const clientType = client.client_type || "Other";
      const isFundType = /hedge fund|asset manager|investment|fund|mutual|etf/i.test(clientType);

      // Check for existing SEC CIK
      const { data: existingMappings } = await sb
        .from("external_source_mappings")
        .select("external_identifier")
        .eq("client_id", client_id)
        .in("external_source_type", ["sec_adviser", "sec_issuer"])
        .limit(1);
      const existingCik = existingMappings?.[0]?.external_identifier || null;

      await updateStep(sb, classStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `${clientType} — ${isFundType ? "SEC-relevant" : "non-SEC"}, CIK: ${existingCik || "none"}`,
        output_json: { client_type: clientType, is_fund: isFundType, existing_cik: existingCik },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 2: SEC Data Collection ═══
      const secStepId = stepMap["sec_data_collection"];
      await updateStep(sb, secStepId, { step_status: "running", started_at: new Date().toISOString() });

      if (isFundType) {
        let cik = existingCik;
        if (!cik) {
          const filer = await searchSECFiler(client.name);
          cik = filer?.cik || null;
        }

        if (cik) {
          const submissions = await fetchSubmissions(cik);
          if (submissions) {
            webData.sec = {
              name: submissions.name,
              sic: submissions.sic,
              sicDescription: submissions.sicDescription,
              stateOfIncorporation: submissions.stateOfIncorporation,
              addresses: submissions.addresses,
              filingCount: submissions.filings?.recent?.form?.length || 0,
            };
          }
        }

        await updateStep(sb, secStepId, {
          step_status: "completed",
          completed_at: new Date().toISOString(),
          output_summary: webData.sec ? `SEC data found: ${webData.sec.name}` : "No SEC data found",
          output_json: webData.sec || {},
        });
      } else {
        await updateStep(sb, secStepId, {
          step_status: "completed",
          completed_at: new Date().toISOString(),
          output_summary: "Skipped — not a fund/investment entity",
          output_json: { skipped: true },
        });
      }
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 3: Web Search — Company Profile ═══
      const compStepId = stepMap["web_search_company"];
      await updateStep(sb, compStepId, { step_status: "running", started_at: new Date().toISOString() });

      const companySearches = await batchWebSearch([
        `"${client.name}" company profile about`,
        `"${client.name}" ${clientType} headquarters founded`,
      ]);

      // Try to fetch the top result's page for more context
      const topUrl = companySearches[0]?.results?.[0]?.url;
      let aboutPageText = "";
      if (topUrl) {
        aboutPageText = await fetchPageText(topUrl, 3000);
      }

      webData.company = {
        searchResults: companySearches.flatMap(s => s.results),
        aboutPageText,
        sourceUrls: companySearches.flatMap(s => s.results.map(r => r.url)).slice(0, 5),
      };

      await updateStep(sb, compStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Found ${webData.company.searchResults.length} results, scraped ${aboutPageText.length > 0 ? "1 page" : "0 pages"}`,
        output_json: { result_count: webData.company.searchResults.length, has_about_page: aboutPageText.length > 0 },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 4: Web Search — News ═══
      const newsStepId = stepMap["web_search_news"];
      await updateStep(sb, newsStepId, { step_status: "running", started_at: new Date().toISOString() });

      const newsSearch = await webSearch(`"${client.name}" news 2025 2026`, { count: 8, freshness: "py" });
      webData.news = {
        searchResults: newsSearch.results,
        sourceUrls: newsSearch.results.map(r => r.url).slice(0, 5),
      };

      await updateStep(sb, newsStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Found ${newsSearch.results.length} news results`,
        output_json: { result_count: newsSearch.results.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 5: Web Search — Contacts ═══
      const contactStepId = stepMap["web_search_contacts"];
      await updateStep(sb, contactStepId, { step_status: "running", started_at: new Date().toISOString() });

      const contactSearch = await webSearch(`"${client.name}" team leadership CEO CIO "portfolio manager"`, { count: 5 });
      webData.contacts = {
        searchResults: contactSearch.results,
        sourceUrls: contactSearch.results.map(r => r.url).slice(0, 3),
      };

      await updateStep(sb, contactStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Found ${contactSearch.results.length} contact results`,
        output_json: { result_count: contactSearch.results.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 6: Web Search — Tech & Funding (non-fund only) ═══
      const techStepId = stepMap["web_search_tech_funding"];
      await updateStep(sb, techStepId, { step_status: "running", started_at: new Date().toISOString() });

      if (!isFundType) {
        const techSearch = await webSearch(`"${client.name}" technology funding series`, { count: 5 });
        webData.techFunding = {
          searchResults: techSearch.results,
          sourceUrls: techSearch.results.map(r => r.url).slice(0, 3),
        };
        await updateStep(sb, techStepId, {
          step_status: "completed",
          completed_at: new Date().toISOString(),
          output_summary: `Found ${techSearch.results.length} tech/funding results`,
          output_json: { result_count: techSearch.results.length },
        });
      } else {
        webData.techFunding = { searchResults: [], sourceUrls: [] };
        await updateStep(sb, techStepId, {
          step_status: "completed",
          completed_at: new Date().toISOString(),
          output_summary: "Skipped — fund entity",
          output_json: { skipped: true },
        });
      }
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 7: AI Synthesis ═══
      const synthStepId = stepMap["ai_synthesis"];
      await updateStep(sb, synthStepId, { step_status: "running", started_at: new Date().toISOString() });

      // Build context from all web data
      const searchContext = [
        "=== COMPANY SEARCH RESULTS ===",
        ...(webData.company?.searchResults || []).slice(0, 5).map((r: any) => `- ${r.title}: ${r.description} (${r.url})`),
        webData.company?.aboutPageText ? `\n=== ABOUT PAGE TEXT ===\n${webData.company.aboutPageText}` : "",
        "\n=== NEWS RESULTS ===",
        ...(webData.news?.searchResults || []).slice(0, 8).map((r: any) => `- ${r.title}: ${r.description} (${r.url})`),
        "\n=== CONTACTS/LEADERSHIP RESULTS ===",
        ...(webData.contacts?.searchResults || []).slice(0, 5).map((r: any) => `- ${r.title}: ${r.description} (${r.url})`),
        !isFundType ? "\n=== TECHNOLOGY & FUNDING RESULTS ===" : "",
        ...(!isFundType ? (webData.techFunding?.searchResults || []).slice(0, 5).map((r: any) => `- ${r.title}: ${r.description} (${r.url})`) : []),
        webData.sec ? `\n=== SEC DATA ===\nRegistered name: ${webData.sec.name}\nSIC: ${webData.sec.sicDescription}\nState: ${webData.sec.stateOfIncorporation}` : "",
      ].filter(Boolean).join("\n");

      const allSourceUrls = [
        ...(webData.company?.sourceUrls || []),
        ...(webData.news?.sourceUrls || []),
        ...(webData.contacts?.sourceUrls || []),
        ...(webData.techFunding?.sourceUrls || []),
      ];

      const aiResponse = await callAIWithRetry(sb, {
        model: "gemini-2.0-flash",
        messages: [
          {
            role: "system",
            content: `You are a research analyst enriching a CRM record for a sales team at an alternative data vendor.
CRITICAL: You must ONLY use information found in the provided search results. Do NOT hallucinate or make up facts.
If information is not available in the search results, set the field to null.
Return valid JSON matching the exact schema requested.`,
          },
          {
            role: "user",
            content: `Enrich the following account using ONLY the web search results provided below.

ACCOUNT: ${client.name}
TYPE: ${clientType}
COUNTRY: ${client.headquarters_country || "Unknown"}
AUM: ${client.aum || "Unknown"}

WEB SEARCH DATA:
${searchContext}

Return JSON with this EXACT structure:
{
  "company_profile": {
    "description": "<1-2 sentences from search results, or null>",
    "founded_year": <number or null>,
    "headquarters": "<city, country or null>",
    "employee_count": "<range or null>",
    "website": "<domain or null>",
    "regulatory_status": "<registered/unregulated/unknown>",
    "aum_estimate": "<string or null>"
  },
  "recent_news": [
    { "date": "<YYYY-MM or approximate>", "headline": "<from search results>", "source_url": "<url>", "significance": "<brief impact>" }
  ],
  "key_contacts": [
    { "name": "<from search results>", "title": "<title>", "source_url": "<url>", "relevance": "<why they matter for data sales>" }
  ],
  "technology_and_funding": {
    "tech_stack": ["<only if found in results>"],
    "last_funding": "<string or null>",
    "funding_total": "<string or null>"
  },
  "competitive_landscape": {
    "competitors": ["<from search results>"],
    "market_position": "<from search results or null>"
  },
  "data_source_urls": [<list of source URLs>],
  "confidence": <0.0 to 1.0>
}

Respond with ONLY valid JSON, no markdown.`,
          },
        ],
        max_tokens: 2500,
        temperature: 0.2,
        userId: auth.userId,
        functionName: "web-enrich",
        response_format: { type: "json_object" },
      });

      const responseText = aiResponse.choices?.[0]?.message?.content || "{}";
      let enrichment: any;
      try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        enrichment = JSON.parse(jsonMatch[1].trim());
      } catch {
        throw new Error("Failed to parse AI enrichment response");
      }

      // Ensure source URLs are included
      enrichment.data_source_urls = [...new Set([
        ...(enrichment.data_source_urls || []),
        ...allSourceUrls,
      ])].slice(0, 10);

      await updateStep(sb, synthStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Synthesized enrichment with confidence ${Math.round((enrichment.confidence || 0.5) * 100)}%`,
        output_json: { confidence: enrichment.confidence, news_count: enrichment.recent_news?.length, contacts_count: enrichment.key_contacts?.length },
      });
      completedCount++;
      await updateRunProgress(sb, run.id, ENRICHMENT_STEPS[completedCount], completedCount);

      // ═══ STEP 8: Store Results ═══
      const storeStepId = stepMap["store_results"];
      await updateStep(sb, storeStepId, { step_status: "running", started_at: new Date().toISOString() });

      // Store each enrichment category
      const enrichTypes = [
        { type: "company_profile", data: enrichment.company_profile },
        { type: "recent_news", data: { events: enrichment.recent_news || [] } },
        { type: "key_contacts", data: { contacts: enrichment.key_contacts || [] } },
        { type: "technology_funding", data: enrichment.technology_and_funding },
        { type: "competitive_landscape", data: enrichment.competitive_landscape },
      ];

      let storedCount = 0;
      for (const et of enrichTypes) {
        if (!et.data) continue;
        await sb.from("enrichment_results").insert({
          entity_type: "client",
          entity_id: client_id,
          source: "web_enrichment",
          enrichment_type: et.type,
          data_json: { ...et.data, source_urls: enrichment.data_source_urls },
          confidence: enrichment.confidence || 0.7,
        });
        storedCount++;
      }

      await updateStep(sb, storeStepId, {
        step_status: "completed",
        completed_at: new Date().toISOString(),
        output_summary: `Stored ${storedCount} enrichment records`,
        output_json: { stored_count: storedCount, types: enrichTypes.map(e => e.type) },
      });
      completedCount++;

      // Mark run complete
      await sb.from("fund_intelligence_runs").update({
        run_status: "completed",
        generated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        completed_steps: completedCount,
        current_step: null,
      }).eq("id", run.id);

      log.info("Web enrichment completed", { client_id, stored: storedCount, confidence: enrichment.confidence });

      return jsonResponse({
        success: true,
        run_id: run.id,
        enrichment,
        summary: { stored_count: storedCount, confidence: enrichment.confidence },
      });

    } catch (processingError: any) {
      const { data: runningSteps } = await sb.from("intelligence_run_steps").select("id").eq("run_id", run.id).eq("step_status", "running");
      for (const s of (runningSteps || [])) {
        await updateStep(sb, s.id, { step_status: "failed", error_message: processingError.message, completed_at: new Date().toISOString() });
      }
      await sb.from("fund_intelligence_runs").update({ run_status: "failed", error_message: processingError.message }).eq("id", run.id);
      log.error("Processing error", { detail: processingError.message, run_id: run.id });
      return errorResponse("An internal error occurred. Please try again.");
    }

  } catch (error: any) {
    log.error("Web enrich error", { detail: error.message });
    return errorResponse("An internal error occurred. Please try again.");
  }
});
