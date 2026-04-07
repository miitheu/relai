import { useState } from 'react';
import { useDb } from '@relai/db/react';

interface MeetingBrief {
  executive_summary: string;
  talking_points: string[];
  questions_to_ask: string[];
  product_recommendations: Array<{ product: string; rationale: string }>;
  risk_factors: string[];
  relationship_insights: string;
  next_steps: string[];
}

interface MeetingPrepResult {
  client_id: string;
  opportunity_id: string | null;
  brief: MeetingBrief;
  data_summary: {
    contacts_count: number;
    opportunities_count: number;
    activities_count: number;
    intelligence_count: number;
  };
}

export function useMeetingPrep() {
  const db = useDb();
  const [result, setResult] = useState<MeetingPrepResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateBrief = async (
    clientId: string,
    opportunityId?: string,
    meetingContext?: string,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await db.invoke(
        'meeting-prep',
        { client_id: clientId, opportunity_id: opportunityId, meeting_context: meetingContext },
      );
      if (fnError) throw fnError;
      setResult(data);
      return data;
    } catch (e: any) {
      setError(e.message || 'Failed to generate brief');
      setResult(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { result, isLoading, error, generateBrief };
}
