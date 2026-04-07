import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useCampaigns() {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['campaigns', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db.query('campaigns', { or: `and(visibility.eq.personal,owner_id.eq.${user!.id}),visibility.eq.team`, order: [{ column: 'created_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useUserCampaignTargets() {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-campaign-targets', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: campaigns } = await db.query('campaigns', { select: 'id, name, target_product_ids', filters: [{ column: 'owner_id', operator: 'eq', value: user!.id }, { column: 'status', operator: 'eq', value: 'active' }] });
      if (!campaigns || campaigns.length === 0) return [];
      const campaignIds = campaigns.map((c: any) => c.id);
      const { data: targets, error } = await db.query('campaign_targets', { select: '*, clients(name, client_type), campaigns(name)', filters: [{ column: 'campaign_id', operator: 'in', value: campaignIds }, { column: 'status', operator: 'in', value: ['not_started', 'outreach_ready'] }], order: [{ column: 'fit_score', ascending: false }], limit: 50 });
      if (error) throw new Error(error.message);
      return (targets || []).map((t: any) => ({ ...t, _campaigns: campaigns }));
    },
  });
}

export function useCampaign(id?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['campaigns', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('campaigns', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCampaignTargets(campaignId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['campaign_targets', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await db.query('campaign_targets', { select: '*, clients(id, name, client_type, relationship_status, headquarters_country)', filters: [{ column: 'campaign_id', operator: 'eq', value: campaignId! }], order: [{ column: 'fit_score', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateCampaign() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; campaign_type?: string; target_product_ids?: string[]; target_account_types?: string[]; target_segments?: string[]; target_geographies?: string[]; include_existing_clients?: boolean; include_prospects?: boolean; focus?: string; max_targets?: number; }) => {
      const { data, error } = await db.insert('campaigns', { ...values, created_by: user!.id, owner_id: user!.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('campaigns', { id }, { ...values, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaigns', data.id] });
    },
  });
}

export function useDeleteCampaign() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('campaigns', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useCreateCampaignTarget() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { campaign_id: string; client_id?: string; prospect_name?: string; prospect_type?: string; is_existing_client?: boolean; fit_score?: number; fit_rationale?: any; recommended_approach?: string; recommended_messaging?: string; owner_id?: string; }) => {
      const { data, error } = await db.insert('campaign_targets', values);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['campaign_targets', vars.campaign_id] }),
  });
}

export interface CampaignOverlap { client_id: string; client_name: string; campaign_id: string; campaign_name: string; campaign_owner: string; overlapping_products: string[]; status: string; }

export function useCampaignOverlaps(campaignId?: string, productIds?: string[]) {
  const db = useDb();
  return useQuery({
    queryKey: ['campaign-overlaps', campaignId, productIds],
    enabled: !!campaignId && !!productIds && productIds.length > 0,
    queryFn: async () => {
      const { data: otherCampaigns, error: cErr } = await db.query('campaigns', {
        select: 'id, name, owner_id, target_product_ids, profiles:owner_id(full_name)',
        filters: [{ column: 'id', operator: 'neq', value: campaignId! }, { column: 'status', operator: 'in', value: ['draft', 'active'] }],
      });
      if (cErr) throw new Error(cErr.message);
      const overlappingCampaigns = (otherCampaigns || []).filter((c: any) => {
        const cProducts = c.target_product_ids || [];
        return cProducts.some((p: string) => productIds!.includes(p));
      });
      if (overlappingCampaigns.length === 0) return [];
      const campaignIds = overlappingCampaigns.map((c: any) => c.id);
      const { data: targets, error: tErr } = await db.query('campaign_targets', {
        select: 'client_id, campaign_id, status, clients(name)',
        filters: [{ column: 'campaign_id', operator: 'in', value: campaignIds }],
        not: [{ column: 'client_id', operator: 'is', value: null }],
      });
      if (tErr) throw new Error(tErr.message);
      const campaignMap = new Map(overlappingCampaigns.map((c: any) => [c.id, c]));
      return (targets || []).map((t: any) => {
        const campaign = campaignMap.get(t.campaign_id) as any;
        return {
          client_id: t.client_id, client_name: (t.clients as any)?.name || 'Unknown',
          campaign_id: t.campaign_id, campaign_name: campaign?.name || 'Unknown',
          campaign_owner: (campaign?.profiles as any)?.full_name || 'Unknown',
          overlapping_products: (campaign?.target_product_ids || []).filter((p: string) => productIds!.includes(p)),
          status: t.status,
        } as CampaignOverlap;
      });
    },
    staleTime: 30000,
  });
}

export function useUpdateCampaignTarget() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id, ...values }: { id: string; campaign_id: string; [key: string]: any }) => {
      const { data, error } = await db.update('campaign_targets', { id }, { ...values, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['campaign_targets', vars.campaign_id] }),
  });
}
