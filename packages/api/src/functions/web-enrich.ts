import { callAI } from "../ai/provider";
import type { FunctionContext } from "./utils";
import { safeParseJSON, AI_NOT_CONFIGURED_ERROR } from "./utils";

// Web enrichment — simplified version for self-hosted (no Brave Search API).
// Uses AI knowledge base instead of live web search. For full web search,
// set BRAVE_SEARCH_API_KEY in env and extend this handler.

const SEC_HEADERS = { "User-Agent": "Relai CRM support@relai.com", Accept: "application/json" };

const ENRICHMENT_STEPS = ["account_classification", "sec_data_collection", "ai_synthesis", "store_results"];

async function updateStep(sql: any, stepId: string, update: Record<string, any>) {
  const json = update.output_json ? JSON.stringify(update.output_json) : null;
  await sql`UPDATE intelligence_run_steps SET step_status = ${update.step_status}, output_summary = COALESCE(${update.output_summary || null}, output_summary), output_json = COALESCE(${json}::jsonb, output_json), started_at = COALESCE(${update.started_at || null}::timestamptz, started_at), completed_at = COALESCE(${update.completed_at || null}::timestamptz, completed_at), updated_at = now() WHERE id = ${stepId}`;
}

export default async function webEnrich(ctx: FunctionContext) {
  const { sql, userId, body, aiConfig } = ctx;
  if (!aiConfig) return AI_NOT_CONFIGURED_ERROR;

  const { client_id } = body;
  if (!client_id) return { data: null, error: { message: "client_id is required" } };

  const clients = await sql`SELECT * FROM clients WHERE id = ${client_id} LIMIT 1`;
  const client = clients[0];
  if (!client) return { data: null, error: { message: "Client not found" } };

  // Create run
  const runRows = await sql`
    INSERT INTO fund_intelligence_runs (client_id, filing_source, filing_type, playbook_type, run_status, run_reason, triggered_by, generated_by, total_steps, completed_steps, current_step)
    VALUES (${client_id}, 'AI Analysis', 'web_enrichment', 'web_enrichment', 'processing', 'manual', ${userId}, ${userId}, ${ENRICHMENT_STEPS.length}, 0, ${ENRICHMENT_STEPS[0]})
    RETURNING *
  `;
  const run = runRows[0];

  const stepMap: Record<string, string> = {};
  for (let i = 0; i < ENRICHMENT_STEPS.length; i++) {
    const rows = await sql`INSERT INTO intelligence_run_steps (run_id, step_name, step_order, step_status) VALUES (${run.id}, ${ENRICHMENT_STEPS[i]}, ${i + 1}, 'pending') RETURNING id`;
    stepMap[ENRICHMENT_STEPS[i]] = rows[0].id;
  }

  try {
    let completedCount = 0;
    const clientType = client.client_type || "Other";
    const isFundType = /hedge fund|asset manager|investment|fund/i.test(clientType);

    // Step 1: Classification
    await updateStep(sql, stepMap["account_classification"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `${clientType} — ${isFundType ? "SEC-relevant" : "non-SEC"}` });
    completedCount++;

    // Step 2: SEC data (if applicable)
    await updateStep(sql, stepMap["sec_data_collection"], { step_status: "running", started_at: new Date().toISOString() });
    let secData: any = null;
    if (isFundType) {
      const mappings = await sql`SELECT external_identifier FROM external_source_mappings WHERE client_id = ${client_id} AND external_source_type IN ('sec_adviser','sec_issuer') LIMIT 1`;
      const cik = mappings[0]?.external_identifier;
      if (cik) {
        try {
          const paddedCik = cik.padStart(10, "0");
          const resp = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, { headers: SEC_HEADERS });
          if (resp.ok) {
            const data = await resp.json();
            secData = { name: data.name, sic: data.sic, sicDescription: data.sicDescription, stateOfIncorporation: data.stateOfIncorporation };
          }
        } catch {}
      }
    }
    await updateStep(sql, stepMap["sec_data_collection"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: secData ? `SEC: ${secData.name}` : "No SEC data" });
    completedCount++;

    // Step 3: AI synthesis
    await updateStep(sql, stepMap["ai_synthesis"], { step_status: "running", started_at: new Date().toISOString() });
    const aiResponse = await callAI(aiConfig, {
      system: "You are a research analyst enriching a CRM record. Only use information you are confident about. Set fields to null if unsure. Return valid JSON.",
      messages: [{ role: "user", content: `Enrich this account using your knowledge.

ACCOUNT: ${client.name}
TYPE: ${clientType}
COUNTRY: ${client.headquarters_country || "Unknown"}
AUM: ${client.aum || "Unknown"}
${secData ? `SEC DATA: ${JSON.stringify(secData)}` : ""}

Return JSON:
{
  "company_profile": {"description":"<1-2 sentences or null>","founded_year":<number or null>,"headquarters":"<city, country or null>","employee_count":"<range or null>","website":"<domain or null>","regulatory_status":"<registered/unregulated/unknown>","aum_estimate":"<or null>"},
  "recent_news": [{"date":"<YYYY-MM>","headline":"<headline>","significance":"<impact>"}],
  "key_contacts": [{"name":"<name>","title":"<title>","relevance":"<why they matter>"}],
  "technology_and_funding": {"tech_stack":[],"last_funding":null,"funding_total":null},
  "competitive_landscape": {"competitors":[],"market_position":null},
  "confidence": <0.0-1.0>
}` }],
      maxTokens: 2500,
      temperature: 0.2,
    });

    const enrichment = safeParseJSON(aiResponse.content, { confidence: 0.5 });
    await updateStep(sql, stepMap["ai_synthesis"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Confidence: ${Math.round((enrichment.confidence || 0.5) * 100)}%` });
    completedCount++;

    // Step 4: Store results
    await updateStep(sql, stepMap["store_results"], { step_status: "running", started_at: new Date().toISOString() });
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
      await sql`INSERT INTO enrichment_results (entity_type, entity_id, source, enrichment_type, data_json, confidence) VALUES ('client', ${client_id}, 'web_enrichment', ${et.type}, ${JSON.stringify(et.data)}::jsonb, ${enrichment.confidence || 0.7})`;
      storedCount++;
    }

    await updateStep(sql, stepMap["store_results"], { step_status: "completed", completed_at: new Date().toISOString(), output_summary: `Stored ${storedCount} records` });
    completedCount++;

    await sql`UPDATE fund_intelligence_runs SET run_status = 'completed', generated_at = now(), completed_at = now(), completed_steps = ${completedCount}, current_step = null WHERE id = ${run.id}`;

    return { data: { success: true, run_id: run.id, enrichment, summary: { stored_count: storedCount, confidence: enrichment.confidence } } };
  } catch (e: unknown) {
    await sql`UPDATE fund_intelligence_runs SET run_status = 'failed', error_message = ${e instanceof Error ? e.message : "Unknown"} WHERE id = ${run.id}`;
    return { data: null, error: { message: "An internal error occurred. Please try again." } };
  }
}
