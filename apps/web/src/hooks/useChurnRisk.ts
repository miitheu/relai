import { useState } from 'react';
import { useDb } from '@relai/db/react';

interface ChurnAnalysis {
  churn_risk_score: number;
  risk_level: string;
  key_risk_indicators: string[];
  positive_signals: string[];
  engagement_trend: string;
  recommended_actions: string[];
  summary: string;
}

interface ChurnRiskResult {
  client_id: string;
  analysis: ChurnAnalysis;
  health_score: number;
  engagement_metrics: {
    activities_30d: number;
    activities_60d: number;
    activities_90d: number;
    days_since_last_activity: number;
    days_to_renewal: number | null;
    active_contracts: number;
  };
}

export function useChurnRisk() {
  const db = useDb();
  const [result, setResult] = useState<ChurnRiskResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (clientId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await db.invoke(
        'churn-risk',
        { client_id: clientId },
      );
      if (fnError) throw fnError;
      setResult(data);
      return data;
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
      setResult(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { result, isLoading, error, analyze };
}
