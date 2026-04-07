// ---------------------------------------------------------------------------
// joins.ts — FK map, Supabase-style select parser, and JOIN query builder
// ---------------------------------------------------------------------------

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

function validateColumn(col: string): boolean {
  return SAFE_IDENTIFIER.test(col);
}

function safeCol(col: string): string {
  if (!validateColumn(col)) throw new Error(`Invalid column name: ${col}`);
  return `"${col}"`;
}

// ---------------------------------------------------------------------------
// FK_MAP — sourceTable -> { fkColumn -> { table, joinColumn } }
// ---------------------------------------------------------------------------

export const FK_MAP: Record<string, Record<string, { table: string; joinColumn: string }>> = {
  contacts: { client_id: { table: 'clients', joinColumn: 'id' } },
  opportunities: {
    client_id: { table: 'clients', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
    owner_id: { table: 'profiles', joinColumn: 'user_id' },
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  tasks: {
    client_id: { table: 'clients', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    user_id: { table: 'profiles', joinColumn: 'user_id' },
  },
  activities: {
    client_id: { table: 'clients', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  notes: {
    client_id: { table: 'clients', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  meetings: {
    client_id: { table: 'clients', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
  },
  emails: {
    client_id: { table: 'clients', joinColumn: 'id' },
    contact_id: { table: 'contacts', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
  },
  deliveries: {
    client_id: { table: 'clients', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  contracts: {
    client_id: { table: 'clients', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
  },
  renewals: {
    client_id: { table: 'clients', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    contract_id: { table: 'contracts', joinColumn: 'id' },
    owner_id: { table: 'profiles', joinColumn: 'user_id' },
  },
  invoices: {
    client_id: { table: 'clients', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    contract_id: { table: 'contracts', joinColumn: 'id' },
  },
  campaigns: {
    owner_id: { table: 'profiles', joinColumn: 'user_id' },
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  campaign_targets: {
    client_id: { table: 'clients', joinColumn: 'id' },
    campaign_id: { table: 'campaigns', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
  },
  opportunity_products: {
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
  },
  opportunity_stage_history: {
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    changed_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  contract_line_items: {
    contract_id: { table: 'contracts', joinColumn: 'id' },
    dataset_id: { table: 'datasets', joinColumn: 'id' },
  },
  contract_amendments: {
    contract_id: { table: 'contracts', joinColumn: 'id' },
  },
  territories: {},
  territory_assignments: {
    territory_id: { table: 'territories', joinColumn: 'id' },
    user_id: { table: 'profiles', joinColumn: 'user_id' },
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  quotas: {
    user_id: { table: 'profiles', joinColumn: 'user_id' },
  },
  forecasts: {
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    category_id: { table: 'forecast_categories', joinColumn: 'id' },
  },
  commission_ledger: {
    user_id: { table: 'profiles', joinColumn: 'user_id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
    plan_id: { table: 'commission_plans', joinColumn: 'id' },
  },
  custom_fields: {
    definition_id: { table: 'custom_field_definitions', joinColumn: 'id' },
  },
  approval_requests: {
    process_id: { table: 'approval_processes', joinColumn: 'id' },
    requested_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  approval_steps: {
    request_id: { table: 'approval_requests', joinColumn: 'id' },
    approver_id: { table: 'profiles', joinColumn: 'user_id' },
  },
  workflow_actions: {
    rule_id: { table: 'workflow_rules', joinColumn: 'id' },
  },
  fund_intelligence_runs: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  intelligence_run_steps: {
    run_id: { table: 'fund_intelligence_runs', joinColumn: 'id' },
  },
  product_fit_analyses: {
    client_id: { table: 'clients', joinColumn: 'id' },
    product_id: { table: 'datasets', joinColumn: 'id' },
  },
  fund_effective_exposure: {
    fund_id: { table: 'clients', joinColumn: 'id' },
    security_id: { table: 'security_master', joinColumn: 'id' },
  },
  fund_reported_holdings: {
    fund_id: { table: 'clients', joinColumn: 'id' },
    security_id: { table: 'security_master', joinColumn: 'id' },
  },
  discovery_suggestions: {
    seed_client_id: { table: 'clients', joinColumn: 'id' },
  },
  account_action_items: {
    client_id: { table: 'clients', joinColumn: 'id' },
    opportunity_id: { table: 'opportunities', joinColumn: 'id' },
  },
  account_entity_resolutions: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  contact_import_batches: {
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  contact_import_staging: {
    batch_id: { table: 'contact_import_batches', joinColumn: 'id' },
    matched_client_id: { table: 'clients', joinColumn: 'id' },
    resolved_client_id: { table: 'clients', joinColumn: 'id' },
    matched_contact_id: { table: 'contacts', joinColumn: 'id' },
    imported_contact_id: { table: 'contacts', joinColumn: 'id' },
  },
  opportunity_import_batches: {
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
  opportunity_import_staging: {
    batch_id: { table: 'opportunity_import_batches', joinColumn: 'id' },
    matched_client_id: { table: 'clients', joinColumn: 'id' },
    matched_dataset_id: { table: 'datasets', joinColumn: 'id' },
  },
  drive_links: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  research_signals: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  customer_health_scores: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  enrichment_results: {
    client_id: { table: 'clients', joinColumn: 'id' },
  },
  notification_preferences: {
    user_id: { table: 'profiles', joinColumn: 'user_id' },
  },
  email_templates: {
    created_by: { table: 'profiles', joinColumn: 'user_id' },
  },
};

// ---------------------------------------------------------------------------
// JoinSpec — parsed representation of a join
// ---------------------------------------------------------------------------

export interface JoinSpec {
  alias: string;       // key name in the result object
  table: string;       // actual table to join
  fkColumn: string;    // column in source table
  joinColumn: string;  // column in target table
  columns: string[];   // columns to select from joined table, or ['*']
  nested?: JoinSpec[]; // nested joins (one-to-many children)
}

// ---------------------------------------------------------------------------
// Select string tokenizer — splits top-level segments respecting parens
// ---------------------------------------------------------------------------

/**
 * Split a string by commas, but only at the top level (not inside parentheses).
 */
function splitTopLevel(str: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of str) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      segments.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last) segments.push(last);
  return segments;
}

// ---------------------------------------------------------------------------
// Determine if a join is one-to-many by checking if the FK lives on the
// *target* table rather than the source table.
// ---------------------------------------------------------------------------

/**
 * Returns true if the joined table has an FK pointing back to the source,
 * meaning the relationship is one-to-many from the source's perspective.
 */
function isOneToMany(sourceTable: string, joinSpec: JoinSpec): boolean {
  // If the fkColumn exists in the source table's FK_MAP, it's many-to-one
  // (the source has the FK). Otherwise check if the target has an FK back.
  const sourceFks = FK_MAP[sourceTable] ?? {};
  if (sourceFks[joinSpec.fkColumn]) return false;

  // The FK lives on the joined table — one-to-many
  return true;
}

// ---------------------------------------------------------------------------
// Parse a single join segment like "clients(name)" or "profiles:owner_id(full_name)"
// ---------------------------------------------------------------------------

function parseJoinSegment(segment: string, sourceTable: string): JoinSpec | null {
  // Match: optional_alias:name_or_fk  OR  name!constraint  followed by (columns)
  const match = segment.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-zA-Z_][a-zA-Z0-9_]*))?(?:!([a-zA-Z_][a-zA-Z0-9_]*))?\((.+)\)$/
  );
  if (!match) return null;

  const [, firstName, secondName, _constraint, innerStr] = match;

  // Validate identifiers
  if (!validateColumn(firstName)) return null;
  if (secondName && !validateColumn(secondName)) return null;

  // Parse inner columns (may contain nested joins)
  const innerSegments = splitTopLevel(innerStr);
  const columns: string[] = [];
  const nested: JoinSpec[] = [];

  for (const seg of innerSegments) {
    if (seg.includes('(')) {
      // This is a nested join — parse it recursively (we need to determine
      // the parent table to resolve FKs; that will be the joined table)
      // We'll resolve the parent table after we know what we're joining.
      // For now, collect raw nested segments.
      nested.push(seg as any); // placeholder — resolved below
    } else {
      const col = seg.trim();
      if (col === '*') {
        columns.push('*');
      } else if (validateColumn(col)) {
        columns.push(col);
      } else {
        return null; // invalid column
      }
    }
  }

  const sourceFks = FK_MAP[sourceTable] ?? {};

  let alias: string;
  let table: string;
  let fkColumn: string;
  let joinColumn: string;

  if (secondName) {
    // Format: alias:fk_column(cols) — e.g. "profiles:owner_id(full_name)"
    // OR seed_client:seed_client_id(name)
    alias = firstName;
    fkColumn = secondName;

    const fkEntry = sourceFks[fkColumn];
    if (fkEntry) {
      table = fkEntry.table;
      joinColumn = fkEntry.joinColumn;
    } else {
      // The fk_column might be on the target table (one-to-many)
      // Try: firstName is the target table, secondName is the FK on that table
      const targetFks = FK_MAP[firstName] ?? {};
      const reverseEntry = Object.entries(targetFks).find(
        ([fk, info]) => fk === secondName && info.table === sourceTable
      );
      if (reverseEntry) {
        table = firstName;
        fkColumn = secondName;
        joinColumn = reverseEntry[1].joinColumn;
      } else {
        return null;
      }
    }
  } else {
    // Format: table_name(cols) — e.g. "clients(name)"
    // Find which FK column points to this table
    alias = firstName;

    // First, check if any FK in the source points to a table named firstName
    const fkEntry = Object.entries(sourceFks).find(
      ([, info]) => info.table === firstName
    );

    if (fkEntry) {
      // Many-to-one: source has FK to this table
      fkColumn = fkEntry[0];
      table = fkEntry[1].table;
      joinColumn = fkEntry[1].joinColumn;
    } else {
      // One-to-many: the target table has an FK pointing back to source
      const targetFks = FK_MAP[firstName] ?? {};
      const reverseEntry = Object.entries(targetFks).find(
        ([, info]) => info.table === sourceTable
      );

      if (reverseEntry) {
        table = firstName;
        fkColumn = reverseEntry[0]; // FK column on the target table
        joinColumn = reverseEntry[1].joinColumn;
      } else {
        return null; // no FK relationship found
      }
    }
  }

  // Now resolve nested joins against the joined table
  const resolvedNested: JoinSpec[] = [];
  for (const n of nested) {
    if (typeof n === 'string') {
      const nestedSpec = parseJoinSegment(n, table);
      if (nestedSpec) resolvedNested.push(nestedSpec);
    } else {
      resolvedNested.push(n);
    }
  }

  // Ensure the join column is included in selected columns for joins to work
  if (columns.length > 0 && !columns.includes('*') && !columns.includes(joinColumn)) {
    columns.push(joinColumn);
  }

  return {
    alias,
    table,
    fkColumn,
    joinColumn,
    columns: columns.length > 0 ? columns : ['*'],
    ...(resolvedNested.length > 0 ? { nested: resolvedNested } : {}),
  };
}

// ---------------------------------------------------------------------------
// Parse a full select string into base columns and join specs
// ---------------------------------------------------------------------------

export function parseSelect(
  selectStr: string,
  sourceTable: string,
): { baseColumns: string[]; joins: JoinSpec[] } {
  const segments = splitTopLevel(selectStr);
  const baseColumns: string[] = [];
  const joins: JoinSpec[] = [];

  for (const seg of segments) {
    if (seg.includes('(')) {
      const joinSpec = parseJoinSegment(seg, sourceTable);
      if (joinSpec) {
        joins.push(joinSpec);
      }
      // If parse fails, silently skip the join (defensive)
    } else {
      const col = seg.trim();
      if (col === '*') {
        baseColumns.push('*');
      } else if (validateColumn(col)) {
        baseColumns.push(col);
      }
      // Invalid columns are silently dropped
    }
  }

  // Default to * if no base columns specified
  if (baseColumns.length === 0 && joins.length > 0) {
    baseColumns.push('*');
  }

  return { baseColumns, joins };
}

// ---------------------------------------------------------------------------
// SQL generation helpers
// ---------------------------------------------------------------------------

function buildColumnList(columns: string[], tableAlias: string): string {
  if (columns.includes('*')) return `${tableAlias}.*`;
  return columns.map((c) => `${tableAlias}.${safeCol(c)}`).join(', ');
}

/**
 * Build a nested subquery for one-to-many joins with optional nested joins.
 */
function buildNestedSubquery(
  spec: JoinSpec,
  sourceAlias: string,
  sourceTable: string,
): string {
  const subAlias = `sub_${spec.alias}`;

  // Determine the join condition
  const sourceFks = FK_MAP[sourceTable] ?? {};
  const isManyToOne = !!sourceFks[spec.fkColumn];

  let onCondition: string;
  if (isManyToOne) {
    // source.fk = target.joinColumn — but for subquery this means it's not
    // actually one-to-many, so this path shouldn't be hit. Just in case:
    onCondition = `${subAlias}.${safeCol(spec.joinColumn)} = ${sourceAlias}.${safeCol(spec.fkColumn)}`;
  } else {
    // target.fk = source.joinColumn (one-to-many)
    onCondition = `${subAlias}.${safeCol(spec.fkColumn)} = ${sourceAlias}.${safeCol(spec.joinColumn)}`;
  }

  if (!spec.nested || spec.nested.length === 0) {
    // Simple one-to-many subquery
    const cols = buildColumnList(spec.columns, subAlias);
    return `COALESCE((SELECT json_agg(row_to_json(${subAlias})) FROM (SELECT ${cols} FROM "${spec.table}" ${subAlias} WHERE ${onCondition}) ${subAlias}), '[]'::json)`;
  }

  // With nested joins: build a more complex subquery
  const innerAlias = `inner_${spec.alias}`;
  const baseCols = spec.columns.includes('*')
    ? `${innerAlias}.*`
    : spec.columns.map((c) => `${innerAlias}.${safeCol(c)}`).join(', ');

  const nestedSelects: string[] = [];
  const nestedJoins: string[] = [];

  spec.nested.forEach((nested, idx) => {
    const jAlias = `nj_${spec.alias}_${idx}`;
    const nestedFks = FK_MAP[spec.table] ?? {};
    const nestedIsManyToOne = !!nestedFks[nested.fkColumn];

    if (nestedIsManyToOne) {
      const nestedCols = nested.columns.includes('*')
        ? `${jAlias}.*`
        : nested.columns.map((c) => `${jAlias}.${safeCol(c)}`).join(', ');
      nestedSelects.push(`row_to_json(${jAlias}.*) as "${nested.alias}"`);
      nestedJoins.push(
        `LEFT JOIN (SELECT ${nestedCols} FROM "${nested.table}") ${jAlias} ON ${innerAlias}.${safeCol(nested.fkColumn)} = ${jAlias}.${safeCol(nested.joinColumn)}`
      );
    } else {
      // nested one-to-many inside a one-to-many
      const nestedSub = buildNestedSubquery(nested, innerAlias, spec.table);
      nestedSelects.push(`${nestedSub} as "${nested.alias}"`);
    }
  });

  const allSelects = [baseCols, ...nestedSelects].join(', ');

  return `COALESCE((SELECT json_agg(row_to_json(${subAlias})) FROM (SELECT ${allSelects} FROM "${spec.table}" ${innerAlias} ${nestedJoins.join(' ')} WHERE ${onCondition.replace(subAlias, innerAlias)}) ${subAlias}), '[]'::json)`;
}

// ---------------------------------------------------------------------------
// buildJoinQuery — main exported function
// ---------------------------------------------------------------------------

export function buildJoinQuery(
  table: string,
  selectStr: string,
  whereClause: string,
  whereValues: unknown[],
  orderBy: string,
  limitClause: string,
  offsetClause: string,
): { sql: string; values: unknown[] } {
  // If no join syntax, return a simple query
  if (!selectStr.includes('(')) {
    const cols = selectStr === '*'
      ? '*'
      : selectStr
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s === '*' || validateColumn(s))
          .map((s) => (s === '*' ? '*' : `"${s}"`))
          .join(', ') || '*';

    return {
      sql: `SELECT ${cols} FROM "${table}" ${whereClause} ${orderBy} ${limitClause} ${offsetClause}`.replace(/\s+/g, ' ').trim(),
      values: whereValues,
    };
  }

  const { baseColumns, joins } = parseSelect(selectStr, table);

  if (joins.length === 0) {
    // No valid joins parsed — fall back to simple query
    const cols = baseColumns.includes('*')
      ? '*'
      : baseColumns.map((c) => `"${c}"`).join(', ') || '*';

    return {
      sql: `SELECT ${cols} FROM "${table}" ${whereClause} ${orderBy} ${limitClause} ${offsetClause}`.replace(/\s+/g, ' ').trim(),
      values: whereValues,
    };
  }

  // Build the query with joins
  const selectParts: string[] = [];
  const joinClauses: string[] = [];
  let joinIdx = 0;

  // Base columns
  if (baseColumns.includes('*')) {
    selectParts.push('t.*');
  } else {
    selectParts.push(...baseColumns.map((c) => `t.${safeCol(c)}`));
  }

  const sourceFks = FK_MAP[table] ?? {};

  for (const spec of joins) {
    const isManyToOne = !!sourceFks[spec.fkColumn];

    if (isManyToOne) {
      // Many-to-one: use LEFT JOIN with row_to_json
      const jAlias = `j${joinIdx}`;
      joinIdx++;

      if (!spec.nested || spec.nested.length === 0) {
        // Simple many-to-one join
        const cols = spec.columns.includes('*')
          ? '*'
          : spec.columns.map((c) => safeCol(c)).join(', ');

        selectParts.push(`row_to_json(${jAlias}.*) as "${spec.alias}"`);
        joinClauses.push(
          `LEFT JOIN (SELECT ${cols} FROM "${spec.table}") ${jAlias} ON t.${safeCol(spec.fkColumn)} = ${jAlias}.${safeCol(spec.joinColumn)}`
        );
      } else {
        // Many-to-one with nested joins
        const innerAlias = `${jAlias}_inner`;
        const nestedSelectParts: string[] = [];
        const nestedJoinClauses: string[] = [];

        // Base columns from the joined table
        if (spec.columns.includes('*')) {
          nestedSelectParts.push(`${innerAlias}.*`);
        } else {
          nestedSelectParts.push(...spec.columns.map((c) => `${innerAlias}.${safeCol(c)}`));
        }

        const joinedTableFks = FK_MAP[spec.table] ?? {};

        spec.nested.forEach((nested, nIdx) => {
          const nAlias = `${jAlias}_n${nIdx}`;
          const nestedIsManyToOne = !!joinedTableFks[nested.fkColumn];

          if (nestedIsManyToOne) {
            const nCols = nested.columns.includes('*')
              ? '*'
              : nested.columns.map((c) => safeCol(c)).join(', ');
            nestedSelectParts.push(`row_to_json(${nAlias}.*) as "${nested.alias}"`);
            nestedJoinClauses.push(
              `LEFT JOIN (SELECT ${nCols} FROM "${nested.table}") ${nAlias} ON ${innerAlias}.${safeCol(nested.fkColumn)} = ${nAlias}.${safeCol(nested.joinColumn)}`
            );
          } else {
            const nestedSub = buildNestedSubquery(nested, innerAlias, spec.table);
            nestedSelectParts.push(`${nestedSub} as "${nested.alias}"`);
          }
        });

        selectParts.push(`row_to_json(${jAlias}.*) as "${spec.alias}"`);
        joinClauses.push(
          `LEFT JOIN (SELECT ${nestedSelectParts.join(', ')} FROM "${spec.table}" ${innerAlias} ${nestedJoinClauses.join(' ')}) ${jAlias} ON t.${safeCol(spec.fkColumn)} = ${jAlias}.${safeCol(spec.joinColumn)}`
        );
      }
    } else {
      // One-to-many: use correlated subquery with json_agg
      const sub = buildNestedSubquery(spec, 't', table);
      selectParts.push(`${sub} as "${spec.alias}"`);
    }
  }

  const selectSQL = selectParts.join(', ');
  const joinSQL = joinClauses.join(' ');

  const sql = `SELECT ${selectSQL} FROM "${table}" t ${joinSQL} ${whereClause} ${orderBy} ${limitClause} ${offsetClause}`
    .replace(/\s+/g, ' ')
    .trim();

  return { sql, values: whereValues };
}
