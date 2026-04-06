import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface EnrichmentResult {
  type: string;
  status: string;
  id?: string;
  data?: Record<string, unknown>;
  error?: string;
}

interface AutoEnrichResult {
  client_id: string;
  results: EnrichmentResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export function useAutoEnrich() {
  const [result, setResult] = useState<AutoEnrichResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrich = async (clientId: string, enrichmentTypes?: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'auto-enrich',
        {
          body: {
            client_id: clientId,
            enrichment_types: enrichmentTypes,
          },
        },
      );
      if (fnError) throw fnError;
      setResult(data);
      return data;
    } catch (e: any) {
      setError(e.message || 'Enrichment failed');
      setResult(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { result, isLoading, error, enrich };
}
