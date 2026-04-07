import { useState, useRef } from 'react';
import { useDb } from '@relai/db/react';
import { useIntelligenceSummary, useProductFitAnalyses } from '@/hooks/useFundIntelligence';
import { useContacts } from '@/hooks/useContacts';
import { useDatasets } from '@/hooks/useDatasets';
import { differenceInDays } from 'date-fns';

export type EmailDraftTrigger = 'creation' | 'stage_change' | 'stale' | 'manual';
export interface EmailDraftVariant { tone: string; subject: string; body: string; }
export interface EmailDraft { subject: string; body: string; }

export function useOpportunityEmailDraft(opportunity: any) {
  const db = useDb();
  const clientId = opportunity?.client_id;
  const { data: summary } = useIntelligenceSummary(clientId);
  const { data: productFits = [] } = useProductFitAnalyses(clientId);
  const { data: contacts = [] } = useContacts(clientId);
  const { data: allDatasets = [] } = useDatasets();
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [variants, setVariants] = useState<EmailDraftVariant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const generate = async (trigger: EmailDraftTrigger, userContext?: string, selectedContact?: any) => {
    if (!opportunity) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setEmailDraft(null);
    setVariants([]);
    setError(null);

    try {
      const bestContact = selectedContact || contacts.find((c: any) => c.influence_level === 'Decision Maker') || contacts[0];
      const oppDatasetId = opportunity.dataset_id;
      const oppProductIds = (opportunity.opportunity_products || []).map((p: any) => p.dataset_id).filter(Boolean);
      const topFit = productFits.find((pf: any) => pf.product_id === oppDatasetId) || productFits.find((pf: any) => oppProductIds.includes(pf.product_id)) || productFits[0];
      const now = new Date();
      const daysInStage = opportunity.stage_entered_at ? differenceInDays(now, new Date(opportunity.stage_entered_at)) : 0;
      const daysSinceActivity = opportunity.last_activity_at ? differenceInDays(now, new Date(opportunity.last_activity_at)) : opportunity.updated_at ? differenceInDays(now, new Date(opportunity.updated_at)) : 0;
      const products = (opportunity.opportunity_products || []).map((p: any) => p.datasets?.name || p.name).filter(Boolean);
      const primaryDatasetId = opportunity.dataset_id || oppProductIds[0];
      const primaryDataset = primaryDatasetId ? allDatasets.find((d: any) => d.id === primaryDatasetId) : null;

      const { data, error } = await db.invoke('campaign-email-draft', {
        mode: 'opportunity_email', opportunity_name: opportunity.name, stage: opportunity.stage, trigger,
        client_name: opportunity.clients?.name || '', client_type: opportunity.clients?.client_type || '',
        dataset_name: opportunity.datasets?.name || null, products, days_in_stage: daysInStage, days_since_activity: daysSinceActivity,
        strategy_summary: summary?.strategy_summary || null, suggested_messaging: summary?.suggested_messaging || null,
        recommended_approach: summary?.recommended_approach || null, fit_score: topFit?.fit_score || null,
        evidence_summary: topFit?.evidence_summary || null, best_contact_name: bestContact?.name || null,
        best_contact_title: bestContact?.title || null, user_context: userContext || null,
        dataset_id: primaryDatasetId || null, dataset_description: primaryDataset?.description || null,
        dataset_coverage: primaryDataset?.coverage || null, dataset_use_cases: primaryDataset?.example_use_cases || null,
        dataset_live_stats: primaryDataset?.live_stats_json || null,
      });

      if (error) throw error;
      if (currentRequestId !== requestIdRef.current) return;

      if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
        setVariants(data.variants);
        setEmailDraft({ subject: data.variants[0].subject || '', body: data.variants[0].body || '' });
      } else {
        setEmailDraft({ subject: data.subject || '', body: data.body || '' });
        setVariants([]);
      }
    } catch (err: any) {
      if (currentRequestId !== requestIdRef.current) return;
      console.error('Email draft generation failed:', err);
      setError(err?.message || 'Failed to generate email draft');
      setEmailDraft(null);
    } finally {
      if (currentRequestId === requestIdRef.current) setIsLoading(false);
    }
  };

  const reset = () => { requestIdRef.current++; setEmailDraft(null); setVariants([]); setIsLoading(false); setError(null); };
  return { generate, emailDraft, variants, isLoading, error, reset, contacts };
}
