// ---------------------------------------------------------------------------
// filters.ts — OR filter parser for Supabase PostgREST-style filter strings
// ---------------------------------------------------------------------------

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

function validateColumn(col: string): boolean {
  return SAFE_IDENTIFIER.test(col);
}

// Supported operators and their SQL equivalents
const OPERATOR_MAP: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
  is: 'IS',
};

// ---------------------------------------------------------------------------
// Split the OR string by commas at the top level (not inside `and()` groups)
// ---------------------------------------------------------------------------

function splitOrSegments(orStr: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of orStr) {
    if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) segments.push(trimmed);
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
// Parse a single condition like "col.op.val"
// ---------------------------------------------------------------------------

function parseCondition(
  cond: string,
  paramIdx: number,
): { sql: string; value: unknown; nextIdx: number } | null {
  // Format: column.operator.value
  // We split on '.' but value may contain dots, so split into at most 3 parts
  const firstDot = cond.indexOf('.');
  if (firstDot === -1) return null;

  const column = cond.substring(0, firstDot);
  const rest = cond.substring(firstDot + 1);

  const secondDot = rest.indexOf('.');
  if (secondDot === -1) return null;

  const operator = rest.substring(0, secondDot);
  const rawValue = rest.substring(secondDot + 1);

  // Validate column name
  if (!validateColumn(column)) return null;

  // Validate operator
  const sqlOp = OPERATOR_MAP[operator];
  if (!sqlOp) return null;

  const quotedCol = `"${column}"`;

  // Handle IS operator specially (null, true, false)
  if (operator === 'is') {
    const lower = rawValue.toLowerCase();
    if (lower === 'null') {
      return { sql: `${quotedCol} IS NULL`, value: undefined, nextIdx: paramIdx };
    }
    if (lower === 'true') {
      return { sql: `${quotedCol} IS TRUE`, value: undefined, nextIdx: paramIdx };
    }
    if (lower === 'false') {
      return { sql: `${quotedCol} IS FALSE`, value: undefined, nextIdx: paramIdx };
    }
    return null; // Invalid IS value
  }

  // For all other operators, parameterize the value
  return {
    sql: `${quotedCol} ${sqlOp} $${paramIdx}`,
    value: rawValue,
    nextIdx: paramIdx + 1,
  };
}

// ---------------------------------------------------------------------------
// Parse an `and(...)` group
// ---------------------------------------------------------------------------

function parseAndGroup(
  inner: string,
  paramIdx: number,
): { sql: string; values: unknown[]; nextIdx: number } | null {
  const conditions = splitOrSegments(inner);
  if (conditions.length === 0) return null;

  const parts: string[] = [];
  const values: unknown[] = [];
  let idx = paramIdx;

  for (const cond of conditions) {
    const parsed = parseCondition(cond, idx);
    if (!parsed) return null;
    parts.push(parsed.sql);
    if (parsed.value !== undefined) {
      values.push(parsed.value);
    }
    idx = parsed.nextIdx;
  }

  return {
    sql: parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`,
    values,
    nextIdx: idx,
  };
}

// ---------------------------------------------------------------------------
// parseOrFilter — main exported function
// ---------------------------------------------------------------------------

/**
 * Parse a Supabase PostgREST OR format string into parameterized SQL.
 *
 * Format: `and(col1.op.val1,col2.op.val2),col3.op.val3`
 * Meaning: `(col1 op val1 AND col2 op val2) OR (col3 op val3)`
 *
 * @param orStr       The OR filter string
 * @param startParamIdx The starting $N parameter index
 * @returns Parsed clause and values, or null if invalid
 */
export function parseOrFilter(
  orStr: string,
  startParamIdx: number,
): { clause: string; values: unknown[] } | null {
  if (!orStr || typeof orStr !== 'string') return null;

  const trimmed = orStr.trim();
  if (!trimmed) return null;

  const segments = splitOrSegments(trimmed);
  if (segments.length === 0) return null;

  const orParts: string[] = [];
  const allValues: unknown[] = [];
  let paramIdx = startParamIdx;

  for (const segment of segments) {
    // Check if this is an and() group
    const andMatch = segment.match(/^and\((.+)\)$/);
    if (andMatch) {
      const parsed = parseAndGroup(andMatch[1], paramIdx);
      if (!parsed) return null;
      orParts.push(parsed.sql);
      allValues.push(...parsed.values);
      paramIdx = parsed.nextIdx;
    } else {
      // Single condition
      const parsed = parseCondition(segment, paramIdx);
      if (!parsed) return null;
      orParts.push(parsed.sql);
      if (parsed.value !== undefined) {
        allValues.push(parsed.value);
      }
      paramIdx = parsed.nextIdx;
    }
  }

  if (orParts.length === 0) return null;

  const clause = orParts.length === 1
    ? orParts[0]
    : `(${orParts.join(' OR ')})`;

  return { clause, values: allValues };
}
