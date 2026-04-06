import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("merge-accounts");

// All tables with a client_id FK that need reassignment
const CLIENT_FK_TABLES = [
  "contacts",
  "opportunities",
  "contracts",
  "deliveries",
  "notes",
  "activities",
  "emails",
  "meetings",
  "campaign_targets",
  "fund_intelligence_runs",
  "fund_intelligence_results",
  "fund_holdings_snapshot", // via run_id, handled separately
  "account_intelligence_signals",
  "account_intelligence_sources",
  "account_intelligence_summaries",
  "account_entity_resolutions",
  "external_source_mappings",
  "client_aliases",
  "action_dismissals", // no client_id FK, skip
];

const DIRECT_CLIENT_FK_TABLES = [
  "contacts",
  "opportunities",
  "contracts",
  "deliveries",
  "notes",
  "activities",
  "emails",
  "meetings",
  "campaign_targets",
  "fund_intelligence_runs",
  "fund_intelligence_results",
  "account_intelligence_signals",
  "account_intelligence_sources",
  "account_intelligence_summaries",
  "external_source_mappings",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, supabaseKey);

  try {
    const auth = await verifyAuth(req);
    if (!auth) {
      return errorResponse("Unauthorized", 401);
    }

    const { primary_account_id, secondary_account_id } = await req.json();
    if (!primary_account_id || !secondary_account_id) throw new Error("primary_account_id and secondary_account_id required");
    if (primary_account_id === secondary_account_id) throw new Error("Cannot merge an account into itself");

    // 1. Fetch both accounts
    const [{ data: primary }, { data: secondary }] = await Promise.all([
      sb.from("clients").select("*").eq("id", primary_account_id).single(),
      sb.from("clients").select("*").eq("id", secondary_account_id).single(),
    ]);
    if (!primary) throw new Error("Primary account not found");
    if (!secondary) throw new Error("Secondary account not found");
    if (secondary.is_merged) throw new Error("Secondary account is already merged");

    logger.info(`Merging accounts`, { secondary: secondary.name, secondaryId: secondary_account_id, primary: primary.name, primaryId: primary_account_id });

    // 2. Count linked records for impact summary
    const summary: Record<string, number> = {};
    for (const table of DIRECT_CLIENT_FK_TABLES) {
      try {
        const { count } = await sb.from(table).select("id", { count: "exact", head: true }).eq("client_id", secondary_account_id);
        summary[table] = count || 0;
      } catch { summary[table] = 0; }
    }

    // 3. Reassign all linked records
    const movedCounts: Record<string, number> = {};
    for (const table of DIRECT_CLIENT_FK_TABLES) {
      if (summary[table] === 0) continue;
      try {
        const { data } = await sb.from(table).update({ client_id: primary_account_id }).eq("client_id", secondary_account_id).select("id");
        movedCounts[table] = data?.length || 0;
        logger.info(`Moved ${movedCounts[table]} ${table} records`);
      } catch (e: any) {
        logger.error(`Failed to move ${table}`, { error: e.message });
        movedCounts[table] = 0;
      }
    }

    // 4. Handle entity resolution — move or merge
    try {
      // If primary doesn't have a resolution but secondary does, move it
      const { data: primaryRes } = await sb.from("account_entity_resolutions").select("id").eq("client_id", primary_account_id).single();
      const { data: secondaryRes } = await sb.from("account_entity_resolutions").select("id").eq("client_id", secondary_account_id).single();
      
      if (!primaryRes && secondaryRes) {
        await sb.from("account_entity_resolutions").update({ client_id: primary_account_id }).eq("client_id", secondary_account_id);
        movedCounts["account_entity_resolutions"] = 1;
      } else if (primaryRes && secondaryRes) {
        // Both exist — delete secondary's resolution (data already moved via external_source_mappings)
        await sb.from("account_entity_resolutions").delete().eq("client_id", secondary_account_id);
        movedCounts["account_entity_resolutions_deleted"] = 1;
      }
    } catch {}

    // 5. Merge aliases — add secondary name + its aliases to primary
    const secondaryNorm = (secondary.normalized_name || secondary.name).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const { data: existingAliases } = await sb.from("client_aliases").select("normalized_alias").eq("client_id", primary_account_id);
    const existingNorms = new Set((existingAliases || []).map((a: any) => a.normalized_alias));

    // Add secondary's CRM name as alias
    if (!existingNorms.has(secondaryNorm)) {
      await sb.from("client_aliases").insert({
        client_id: primary_account_id,
        alias_name: secondary.name,
        normalized_alias: secondaryNorm,
        alias_type: "merged_name",
        source: "account_merge",
      });
      existingNorms.add(secondaryNorm);
    }

    // Move secondary's aliases to primary (update client_id)
    const { data: secAliases } = await sb.from("client_aliases").select("*").eq("client_id", secondary_account_id);
    for (const alias of (secAliases || [])) {
      if (!existingNorms.has(alias.normalized_alias)) {
        await sb.from("client_aliases").update({ client_id: primary_account_id }).eq("id", alias.id);
        existingNorms.add(alias.normalized_alias);
      } else {
        // Duplicate alias — delete it
        await sb.from("client_aliases").delete().eq("id", alias.id);
      }
    }
    movedCounts["client_aliases"] = (secAliases || []).length;

    // 6. Mark secondary account as merged
    await sb.from("clients").update({
      is_merged: true,
      merged_into_client_id: primary_account_id,
      relationship_status: "Merged",
    }).eq("id", secondary_account_id);

    // 7. Create merge audit event
    const mergeSummary = {
      primary_name: primary.name,
      secondary_name: secondary.name,
      records_moved: movedCounts,
      total_records_moved: Object.values(movedCounts).reduce((a, b) => a + b, 0),
    };

    await sb.from("account_merge_events").insert({
      primary_account_id,
      secondary_account_id,
      merged_by: auth.userId,
      merge_summary_json: mergeSummary,
    });

    // 8. Log to admin audit
    await sb.from("admin_audit_log").insert({
      action: "account_merge",
      entity_type: "client",
      entity_id: primary_account_id,
      performed_by: auth.userId,
      details: mergeSummary,
    });

    logger.info(`Merge complete`, { secondary: secondary.name, primary: primary.name });

    return jsonResponse({
      success: true,
      primary_account_id,
      secondary_account_id,
      summary: mergeSummary,
    });

  } catch (e: any) {
    logger.error("Merge error", { error: e.message, stack: e.stack });
    return errorResponse("An internal error occurred", 400);
  }
});
