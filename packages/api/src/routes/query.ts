import { Hono } from "hono";
import { sql } from "../db";
import type { QueryOptions, Filter, NotFilter, OrderBy } from "@relai/db";
import { buildJoinQuery } from "../joins";
import { parseOrFilter } from "../filters";

const query = new Hono();

// -----------------------------------------------------------------------
// Whitelists — prevent SQL injection via table/column names
// -----------------------------------------------------------------------

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

// Column names must be simple identifiers (letters, digits, underscores)
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

function validateTable(table: string): boolean {
  return ALLOWED_TABLES.has(table);
}

function validateColumn(col: string): boolean {
  return SAFE_IDENTIFIER.test(col);
}

function safeCol(col: string): string {
  if (!validateColumn(col)) throw new Error(`Invalid column name: ${col}`);
  return `"${col}"`;
}

// -----------------------------------------------------------------------
// Safe integer parsing for LIMIT/OFFSET
// -----------------------------------------------------------------------

function safeInt(val: unknown, min: number, max: number, fallback: number | null = null): number | null {
  if (val == null) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// -----------------------------------------------------------------------
// Build WHERE clause from filters — fully parameterized
// -----------------------------------------------------------------------

function buildWhere(
  filters?: Filter[],
  not?: NotFilter[],
  or?: string,
  userId?: string
): { clause: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  // Auto-inject org_id filter
  if (userId) {
    conditions.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);
    values.push(userId);
    paramIdx++;
  }

  if (filters) {
    for (const f of filters) {
      const col = safeCol(f.column);
      switch (f.operator) {
        case "eq":
          conditions.push(`${col} = $${paramIdx++}`);
          values.push(f.value);
          break;
        case "neq":
          conditions.push(`${col} != $${paramIdx++}`);
          values.push(f.value);
          break;
        case "gt":
          conditions.push(`${col} > $${paramIdx++}`);
          values.push(f.value);
          break;
        case "gte":
          conditions.push(`${col} >= $${paramIdx++}`);
          values.push(f.value);
          break;
        case "lt":
          conditions.push(`${col} < $${paramIdx++}`);
          values.push(f.value);
          break;
        case "lte":
          conditions.push(`${col} <= $${paramIdx++}`);
          values.push(f.value);
          break;
        case "like":
          conditions.push(`${col} LIKE $${paramIdx++}`);
          values.push(f.value);
          break;
        case "ilike":
          conditions.push(`${col} ILIKE $${paramIdx++}`);
          values.push(f.value);
          break;
        case "is":
          if (f.value === null) conditions.push(`${col} IS NULL`);
          else if (f.value === true) conditions.push(`${col} IS TRUE`);
          else if (f.value === false) conditions.push(`${col} IS FALSE`);
          break;
        case "in":
          if (Array.isArray(f.value) && f.value.length > 0) {
            const placeholders = f.value.map(() => `$${paramIdx++}`).join(", ");
            conditions.push(`${col} IN (${placeholders})`);
            values.push(...f.value);
          }
          break;
      }
    }
  }

  if (not) {
    for (const n of not) {
      const col = safeCol(n.column);
      if (n.operator === "is" && n.value === null) {
        conditions.push(`${col} IS NOT NULL`);
      } else if (n.operator === "in") {
        // FIX: parameterize NOT IN values instead of raw interpolation
        if (Array.isArray(n.value) && n.value.length > 0) {
          const placeholders = n.value.map(() => `$${paramIdx++}`).join(", ");
          conditions.push(`${col} NOT IN (${placeholders})`);
          values.push(...n.value);
        }
      } else {
        conditions.push(`${col} != $${paramIdx++}`);
        values.push(n.value);
        break;
      }
    }
  }

  // OR filter — parsed safely via parseOrFilter
  if (or) {
    const orResult = parseOrFilter(or, paramIdx);
    if (orResult) {
      conditions.push(orResult.clause);
      values.push(...orResult.values);
      paramIdx += orResult.values.length;
    }
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, values };
}

function buildOrderBy(order?: OrderBy[]): string {
  if (!order || order.length === 0) return "";
  const parts = order.map((o) => {
    const col = safeCol(o.column);
    return `${col} ${o.ascending === false ? "DESC" : "ASC"}${o.nullsFirst ? " NULLS FIRST" : ""}`;
  });
  return `ORDER BY ${parts.join(", ")}`;
}

// Validate select columns — only allow simple comma-separated identifiers or *
function safeSelect(selectStr: string): string {
  if (selectStr === "*") return "*";
  // If it contains join syntax like "clients(name)", fall back to *
  if (selectStr.includes("(")) return "*";
  // Validate each column
  const cols = selectStr.split(",").map((s) => s.trim());
  for (const col of cols) {
    if (col !== "*" && !validateColumn(col)) return "*";
  }
  return cols.map((c) => (c === "*" ? "*" : `"${c}"`)).join(", ");
}

// Sanitize error messages — don't leak SQL details to the client
function sanitizeError(err: any): { message: string } {
  const msg = err?.message || "Database error";
  // Strip SQL details, table names, etc
  if (msg.includes("relation") || msg.includes("syntax") || msg.includes("column")) {
    return { message: "Database query failed" };
  }
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return { message: "A record with that value already exists" };
  }
  if (msg.includes("violates foreign key")) {
    return { message: "Referenced record does not exist" };
  }
  return { message: "Database operation failed" };
}

// -----------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------

// POST /api/query
query.post("/query", async (c) => {
  const userId = c.get("userId") as string;
  const { table, options } = (await c.req.json()) as { table: string; options?: QueryOptions };

  if (!validateTable(table)) {
    return c.json({ data: null, count: null, error: { message: "Invalid table" } }, 400);
  }

  try {
    const { clause, values } = buildWhere(options?.filters, options?.not, options?.or, userId);
    const orderBy = buildOrderBy(options?.order);

    // Safe integer LIMIT/OFFSET — max 10000 rows per query
    const limit = safeInt(options?.limit, 1, 10000);
    const limitClause = limit != null ? `LIMIT ${limit}` : "";

    let offsetClause = "";
    if (options?.range) {
      const start = safeInt(options.range[0], 0, 1000000) ?? 0;
      const end = safeInt(options.range[1], start, start + 10000) ?? start + 50;
      offsetClause = `OFFSET ${start} LIMIT ${end - start + 1}`;
    } else if (options?.offset != null) {
      const off = safeInt(options.offset, 0, 1000000) ?? 0;
      offsetClause = `OFFSET ${off}`;
    }

    if (options?.head) {
      const countResult = await sql.unsafe(
        `SELECT count(*)::int as total FROM "${table}" ${clause}`,
        values
      );
      return c.json({ data: [], count: countResult[0]?.total ?? 0, error: null });
    }

    // Build query with join support — parses Supabase-style select strings
    const selectStr = options?.select ?? "*";
    const { sql: querySql, values: queryValues } = buildJoinQuery(
      table,
      selectStr,
      clause,
      values,
      orderBy,
      limitClause,
      offsetClause,
    );

    const data = await sql.unsafe(querySql, queryValues);

    let count = null;
    if (options?.count === "exact") {
      const countResult = await sql.unsafe(
        `SELECT count(*)::int as total FROM "${table}" ${clause}`,
        values
      );
      count = countResult[0]?.total ?? 0;
    }

    if (options?.single) {
      return c.json({ data: data[0] ?? null, error: null });
    }

    return c.json({ data, count, error: null });
  } catch (err: any) {
    console.error(`Query error [${table}]:`, err.message);
    return c.json({ data: null, count: null, error: sanitizeError(err) }, 500);
  }
});

// POST /api/insert
query.post("/insert", async (c) => {
  const userId = c.get("userId") as string;
  const { table, data: inputData } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: "Invalid table" } }, 400);
  }

  try {
    const rows = Array.isArray(inputData) ? inputData : [inputData];
    if (rows.length > 1000) {
      return c.json({ data: null, error: { message: "Batch insert limited to 1000 rows" } }, 400);
    }

    const orgIdResult = await sql`SELECT org_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
    const orgId = orgIdResult[0]?.org_id;

    const results = [];
    for (const row of rows) {
      const dataWithOrg = orgId ? { ...row, org_id: orgId } : row;
      const cols = Object.keys(dataWithOrg);
      const vals = Object.values(dataWithOrg);

      // Validate column names
      for (const col of cols) {
        if (!validateColumn(col)) {
          return c.json({ data: null, error: { message: `Invalid column: ${col}` } }, 400);
        }
      }

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
    console.error(`Insert error [${table}]:`, err.message);
    return c.json({ data: null, error: sanitizeError(err) }, 500);
  }
});

// POST /api/update
query.post("/update", async (c) => {
  const userId = c.get("userId") as string;
  const { table, match, data: updateData } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: "Invalid table" } }, 400);
  }

  try {
    const setCols = Object.keys(updateData);
    const setVals = Object.values(updateData);
    const matchCols = Object.keys(match);
    const matchVals = Object.values(match);

    // Validate all column names
    for (const col of [...setCols, ...matchCols]) {
      if (!validateColumn(col)) {
        return c.json({ data: null, error: { message: `Invalid column: ${col}` } }, 400);
      }
    }

    let paramIdx = 1;
    const setParts = setCols.map((col) => `"${col}" = $${paramIdx++}`);
    const whereParts = matchCols.map((col) => `"${col}" = $${paramIdx++}`);
    whereParts.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);

    const allVals = [...setVals, ...matchVals, userId];

    const result = await sql.unsafe(
      `UPDATE "${table}" SET ${setParts.join(", ")} WHERE ${whereParts.join(" AND ")} RETURNING *`,
      allVals
    );

    return c.json({ data: result, error: null });
  } catch (err: any) {
    console.error(`Update error [${table}]:`, err.message);
    return c.json({ data: null, error: sanitizeError(err) }, 500);
  }
});

// POST /api/delete
query.post("/delete", async (c) => {
  const userId = c.get("userId") as string;
  const { table, match } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ error: { message: "Invalid table" } }, 400);
  }

  try {
    const cols = Object.keys(match);
    const vals: unknown[] = Object.values(match);

    for (const col of cols) {
      if (!validateColumn(col)) {
        return c.json({ error: { message: `Invalid column: ${col}` } }, 400);
      }
    }

    let paramIdx = 1;
    const whereParts = cols.map((col) => `"${col}" = $${paramIdx++}`);
    whereParts.push(`org_id = (SELECT org_id FROM profiles WHERE user_id = $${paramIdx} LIMIT 1)`);
    vals.push(userId);

    await sql.unsafe(`DELETE FROM "${table}" WHERE ${whereParts.join(" AND ")}`, vals);
    return c.json({ error: null });
  } catch (err: any) {
    console.error(`Delete error [${table}]:`, err.message);
    return c.json({ error: sanitizeError(err) }, 500);
  }
});

// POST /api/upsert
query.post("/upsert", async (c) => {
  const userId = c.get("userId") as string;
  const { table, data: inputData, options } = await c.req.json();

  if (!validateTable(table)) {
    return c.json({ data: null, error: { message: "Invalid table" } }, 400);
  }

  try {
    const rows = Array.isArray(inputData) ? inputData : [inputData];
    if (rows.length > 1000) {
      return c.json({ data: null, error: { message: "Batch upsert limited to 1000 rows" } }, 400);
    }

    const orgIdResult = await sql`SELECT org_id FROM profiles WHERE user_id = ${userId} LIMIT 1`;
    const orgId = orgIdResult[0]?.org_id;

    // FIX: validate onConflict — must be comma-separated column names
    let conflictClause = "ON CONFLICT";
    if (options?.onConflict) {
      const conflictCols = options.onConflict.split(",").map((s: string) => s.trim());
      for (const col of conflictCols) {
        if (!validateColumn(col)) {
          return c.json({ data: null, error: { message: `Invalid conflict column: ${col}` } }, 400);
        }
      }
      conflictClause = `ON CONFLICT (${conflictCols.map((c: string) => `"${c}"`).join(", ")})`;
    }

    const results = [];
    for (const row of rows) {
      const dataWithOrg = orgId ? { ...row, org_id: orgId } : row;
      const cols = Object.keys(dataWithOrg);
      const vals = Object.values(dataWithOrg);

      for (const col of cols) {
        if (!validateColumn(col)) {
          return c.json({ data: null, error: { message: `Invalid column: ${col}` } }, 400);
        }
      }

      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const colNames = cols.map((c) => `"${c}"`).join(", ");
      const updateCols = cols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");

      const result = await sql.unsafe(
        `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ${conflictClause} DO UPDATE SET ${updateCols} RETURNING *`,
        vals
      );
      results.push(result[0]);
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error(`Upsert error [${table}]:`, err.message);
    return c.json({ data: null, error: sanitizeError(err) }, 500);
  }
});

export default query;
