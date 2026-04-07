import { describe, it, expect } from 'vitest';
import { parseOrFilter } from '../filters';

describe('parseOrFilter', () => {
  it('parses simple OR condition', () => {
    const result = parseOrFilter('status.eq.active,status.eq.pending', 1);
    expect(result).not.toBeNull();
    expect(result!.clause).toContain('OR');
    expect(result!.values).toEqual(['active', 'pending']);
  });

  it('parses AND group within OR', () => {
    const result = parseOrFilter('and(visibility.eq.personal,owner_id.eq.abc123),visibility.eq.team', 1);
    expect(result).not.toBeNull();
    expect(result!.clause).toContain('AND');
    expect(result!.clause).toContain('OR');
  });

  it('handles is.null operator', () => {
    const result = parseOrFilter('name.is.null', 1);
    expect(result).not.toBeNull();
    expect(result!.clause).toContain('IS NULL');
    expect(result!.values).toEqual([]);
  });

  it('rejects invalid column names', () => {
    const result = parseOrFilter('DROP TABLE users--.eq.1', 1);
    expect(result).toBeNull();
  });

  it('rejects empty string', () => {
    const result = parseOrFilter('', 1);
    expect(result).toBeNull();
  });
});
