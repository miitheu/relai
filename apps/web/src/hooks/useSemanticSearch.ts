import { useState } from 'react';
import { useDb } from '@relai/db/react';

interface SearchResult {
  id: string;
  entity_type: string;
  entity_id: string;
  content_preview: string;
  metadata_json: Record<string, unknown>;
  similarity: number;
}

export function useSemanticSearch() {
  const db = useDb();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (
    query: string,
    entityType?: string,
    matchCount?: number,
  ) => {
    setIsSearching(true);
    setError(null);
    try {
      const { data, error: fnError } = await db.invoke(
        'semantic-search',
        { query, entity_type: entityType, match_count: matchCount || 10 },
      );
      if (fnError) throw fnError;
      setResults(data?.results || []);
      return data?.results || [];
    } catch (e: any) {
      setError(e.message || 'Search failed');
      setResults([]);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  return { results, isSearching, error, search };
}
