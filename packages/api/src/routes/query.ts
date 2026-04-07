import { Hono } from "hono";
import { sql } from "../db";
import type { QueryOptions, Filter, NotFilter, OrderBy } from "@relai/db";

const query = new Hono();

// Allowed tables (whitelist to prevent SQL injection)
const ALLOWED_TABLES = new Set([
  "account_action_items", "account_entity_resolutions", "account_intelligence_signals",
  "account_intelligence_sources", "account_intelligence_summaries", "account_merge_events",
  "action_dismissals", "activities", "admin_audit_log", "ai_usage_log",
  "approval_processes", "approval_requests", "approval_steps",
  "campaign_targets", "campaigns", "client_aliases", "client_provenance",
  "clients", "commission_ledger", "commission_plans",
  "contact_import_batches", "contact_import_staging", "contacts",
  "contract_amendments", "contract_line_items", "contracts",
  "crm_settings", "custom_field_definitions", "custom_fields", "customer_health_scores",
  "dataset_aliases", "datasets", "deliveries", "discovery_suggestions",
  "drive_links", "email_templates", "emails", "embeddings_store",
  "enrichment_results", "etf_constituent_snapshots", "external_source_mappings",
  "forecast_categories", "forecast_snapshots", "forecasts",
  "fund_effective_exposure", "fund_filings", "fund_holdings_snapshot",
  "fund_intelligence_results", "fund_intelligence_runs", "fund_reported_holdings",
  "integration_configs", "intelligence_run_steps", "invoices",
  "meetings", "notes", "notification_preferences", "notifications",
  "opportunities", "opportunity_import_batches", "opportunity_import_staging",
  "opportunity_products", "opportunity_stage_history", "organizations",
  "pricing_tiers", "product_fit_analyses", "profiles", "quota_attainment", "quotas",
  "renewals", "research_signals", "security_master", "sync_log",
  "tasks", "territories", "territory_assignments", "user_roles",
  "workflow_actions", "workflow_execution_log", "workflow_rules",
  "app_users", "app_sessions",
]);

function validateTable(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

// Build WHERE clause from filters
function buildWhere(filters?: Filter[], not?: NotFilter[], or?: string, userId?: string): { clause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  // Auto-inject org_id filter based on user's profile
  // (This is the app-level equivalent of RLS)
  if (userId) {
    conditions.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);
    values.push(userId);
    paramIdx++;
  }

  if (filters) {
    for (const f of filters) {
      switch (f.operator) {
        case "eq":
          conditions.push(`"${f.column}" = $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "neq":
          conditions.push(`"${f.column}" != $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "gt":
          conditions.push(`"${f.column}" > $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "gte":
          conditions.push(`"${f.column}" >= $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "lt":
          conditions.push(`"${f.column}" < $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "lte":
          conditions.push(`"${f.column}" <= $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "like":
          conditions.push(`"${f.column}" LIKE $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "ilike":
          conditions.push(`"${f.column}" ILIKE $${paramIdx}`);
          values.push(f.value);
          paramIdx++;
          break;
        case "is":
          if (f.value === null) conditions.push(`"${f.column}" IS NULL`);
          else {
            conditions.push(`"${f.column}" IS $${paramIdx}`);
            values.push(f.value);
            paramIdx++;
          }
          break;
        case "in":
          if (Array.isArray(f.value) && f.value.length > 0) {
            const placeholders = f.value.map(() => `$${paramIdx++}`).join(", ");
            conditions.push(`"${f.column}" IN (${placeholders})`);
            values.push(...f.value);
          }
          break;
      }
    }
  }

  if (not) {
    for (const n of not) {
      if (n.operator === "is" && n.value === null) {
        conditions.push(`"${n.column}" IS NOT NULL`);
      } else if (n.operator === "in") {
        conditions.push(`"${n.column}" NOT IN (${n.value})`);
      } else {
        conditions.push(`"${n.column}" != $${paramIdx}`);
        values.push(n.value);
        paramIdx++;
      }
    }
  }

  // Simple OR string pass-through (Supabase format: col.op.val,col2.op.val2)
  // For now, we pass it as-is in a comment — full parsing would be complex
  // In production, this would need a proper parser

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, values };
}

function buildOrderBy(order?: OrderBy[]): string {
  if (!order || order.length === 0) return "";
  const parts = order.map(
    (o) => `"${o.column}" ${o.ascending === false ? "DESC" : "ASC"}${o.nullsFirst ? " NULLS FIRST" : ""}`
  );
  return `ORDER BY ${parts.join(", ")}`;
}

// POST /api/query
query.post("/query", async (c) => {
  const userId = c.get("userId") as string;
  const { table, options } = (await c.req.json()) as { table: string; options?: QueryOptions };

  if (!validateTable(table)) {
    return c.json({ data: null, count: null, error: { message: `Invalid table: ${table}` } });
  }

  try {
    const selectCols = options?.select ?? "*";
    const { clause, values } = buildWhere(options?.filters, options?.not, options?.or, userId);
    const orderBy = buildOrderBy(options?.order);
    const limit = options?.limit ? `LIMIT ${options.limit}` : "";
    const offset = options?.range ? `OFFSET ${options.range[0]} LIMIT ${options.range[1] - options.range[0] + 1}` : (options?.offset ? `OFFSET ${options.offset}` : "");

    // Note: join syntax from select string (e.g. "*, clients(name)") is Supabase-specific.
    // For self-hosted, we only support simple column lists for now.
    // Join syntax would need a SQL builder.
    const simpleSelect = selectCols.includes("(") ? "*" : selectCols;

    if (options?.head) {
      const countResult = await sql.unsafe(`SELECT count(*)::int as total FROM "${table}" ${clause}`, values);
      return c.json({ data: [], count: countResult[0]?.total ?? 0, error: null });
    }

    const data = await sql.unsafe(
      `SELECT ${simpleSelect} FROM "${table}" ${clause} ${orderBy} ${limit} ${offset}`,
      values
    );

    let count = null;
    if (options?.count === "exact") {
      const countResult = await sql.unsafe(`SELECT count(*)::int as total FROM "${table}" ${clause}`, values);
      count = countResult[0]?.total ?? 0;
    }

    if (options?.single) {
      return c.json({ data: data[0] ?? null, error: null });
    }

    return c.json({ data, count, error: null });
  } catch (err: any) {
    return c.json({ data: null, count: null, error: { message: err.message } });
  }
});

// POST /api/insert
query.post("/insert", async (c) => {
  const userId = c.get("userId") as string;
  const { table, data: inputData } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: `Invalid table: ${table}` } });
  }

  try {
    const rows = Array.isArray(inputData) ? inputData : [inputData];
    // Inject org_id from user's profile
    const orgIdResult = await sql`SELECT org_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
    const orgId = orgIdResult[0]?.org_id;

    const results = [];
    for (const row of rows) {
      const dataWithOrg = orgId ? { ...row, org_id: orgId } : row;
      const cols = Object.keys(dataWithOrg);
      const vals = Object.values(dataWithOrg);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = cols.map((c) => `"${c}"`).join(", ");

      const result = await sql.unsafe(
        `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      results.push(result[0]);
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: { message: err.message } });
  }
});

// POST /api/update
query.post("/update", async (c) => {
  const userId = c.get("userId") as string;
  const { table, match, data: updateData } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: `Invalid table: ${table}` } });
  }

  try {
    const setCols = Object.keys(updateData);
    const setVals = Object.values(updateData);
    const matchCols = Object.keys(match);
    const matchVals = Object.values(match);

    let paramIdx = 1;
    const setParts = setCols.map((col) => `"${col}" = $${paramIdx++}`);
    const whereParts = matchCols.map((col) => `"${col}" = $${paramIdx++}`);

    // Add org_id check
    whereParts.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);

    const allVals = [...setVals, ...matchVals, userId];

    const result = await sql.unsafe(
      `UPDATE "${table}" SET ${setParts.join(", ")} WHERE ${whereParts.join(" AND ")} RETURNING *`,
      allVals
    );

    return c.json({ data: result, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: { message: err.message } });
  }
});

// POST /api/delete
query.post("/delete", async (c) => {
  const userId = c.get("userId") as string;
  const { table, match } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ error: { message: `Invalid table: ${table}` } });
  }

  try {
    const cols = Object.keys(match);
    const vals = Object.values(match);

    let paramIdx = 1;
    const whereParts = cols.map((col) => `"${col}" = $${paramIdx++}`);
    whereParts.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);
    vals.push(userId);

    await sql.unsafe(`DELETE FROM "${table}" WHERE ${whereParts.join(" AND ")}`, vals);
    return c.json({ error: null });
  } catch (err: any) {
    return c.json({ error: { message: err.message } });
  }
});

// POST /api/upsert
query.post("/upsert", async (c) => {
  const userId = c.get("userId") as string;
  const { table, data: inputData, options } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: `Invalid table: ${table}` } });
  }

  try {
    const rows = Array.isArray(inputData) ? inputData : [inputData];
    const orgIdResult = await sql`SELECT org_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
    const orgId = orgIdResult[0]?.org_id;

    const results = [];
    for (const row of rows) {
      const dataWithOrg = orgId ? { ...row, org_id: orgId } : row;
      const cols = Object.keys(dataWithOrg);
      const vals = Object.values(dataWithOrg);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = cols.map((c) => `"${c}"`).join(", ");
      const conflict = options?.onConflict ? `ON CONFLICT (${options.onConflict})` : "ON CONFLICT";
      const updateCols = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

      const result = await sql.unsafe(
        `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ${conflict} DO UPDATE SET ${updateCols} RETURNING *`,
        vals
      );
      results.push(result[0]);
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    return c.json({ data: null, error: { message: err.message } });
  }
});

export default query;
