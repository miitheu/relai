import { describe, it, expect } from 'vitest';
import { buildJoinQuery } from '../joins';

describe('buildJoinQuery', () => {
  it('returns simple SELECT for no join syntax', () => {
    const { sql } = buildJoinQuery('clients', '*', '', [], '', '', '');
    expect(sql.trim()).toBe('SELECT * FROM "clients"');
  });

  it('generates LEFT JOIN for simple relation', () => {
    const { sql } = buildJoinQuery('contacts', '*, clients(name)', '', [], '', '', '');
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('"clients"');
    expect(sql).toContain('row_to_json');
  });

  it('passes through WHERE clause and values', () => {
    const { sql, values } = buildJoinQuery(
      'clients',
      '*',
      'WHERE "id" = $1',
      ['abc123'],
      'ORDER BY "name" ASC',
      'LIMIT 50',
      ''
    );
    expect(sql).toContain('WHERE "id" = $1');
    expect(sql).toContain('ORDER BY "name" ASC');
    expect(sql).toContain('LIMIT 50');
    expect(values).toEqual(['abc123']);
  });

  it('handles aliased joins like profiles:owner_id(full_name)', () => {
    const { sql } = buildJoinQuery('campaigns', '*, profiles:owner_id(full_name)', '', [], '', '', '');
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('"profiles"');
  });

  it('falls back to * for unknown tables', () => {
    const { sql } = buildJoinQuery('unknown_table', '*, foo(bar)', '', [], '', '', '');
    expect(sql).toContain('SELECT *');
  });
});
