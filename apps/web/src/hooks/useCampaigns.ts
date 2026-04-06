import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useCampaigns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['campaigns', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Fetch personal campaigns owned by user + all team (legacy) campaigns
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .or(`and(visibility.eq.personal,owner_id.eq.${user!.id}),visibility.eq.team`)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useUserCampaignTargets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['user-campaign-targets', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Get outreach-ready targets from user's active campaigns
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, name, target_product_ids')
        .eq('owner_id', user!.id)
        .eq('status', 'active');

      if (!campaigns || campaigns.length === 0) return [];

      const campaignIds = campaigns.map(c => c.id);
      const { data: targets, error } = await supabase
        .from('campaign_targets')
        .select('*, clients(name, client_type), campaigns(name)')
        .in('campaign_id', campaignIds)
        .in('status', ['not_started', 'outreach_ready'])
        .order('fit_score', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (targets || []).map((t: any) => ({ ...t, _campaigns: campaigns }));
    },
  });
}

export function useCampaign(id?: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCampaignTargets(campaignId?: string) {
  return useQuery({
    queryKey: ['campaign_targets', campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_targets')
        .select('*, clients(id, name, client_type, relationship_status, headquarters_country)')
        .eq('campaign_id', campaignId!)
        .order('fit_score', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      description?: string;
      campaign_type?: string;
      target_product_ids?: string[];
      target_account_types?: string[];
      target_segments?: string[];
      target_geographies?: string[];
      include_existing_clients?: boolean;
      include_prospects?: boolean;
      focus?: string;
      max_targets?: number;
    }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .insert({ ...values, created_by: user!.id, owner_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('campaigns')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['campaigns', data.id] });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useCreateCampaignTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      campaign_id: string;
      client_id?: string;
      prospect_name?: string;
      prospect_type?: string;
      is_existing_client?: boolean;
      fit_score?: number;
      fit_rationale?: any;
      recommended_approach?: string;
      recommended_messaging?: string;
      owner_id?: string;
    }) => {
      const { data, error } = await supabase
        .from('campaign_targets')
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['campaign_targets', vars.campaign_id] }),
  });
}

export interface CampaignOverlap {
  client_id: string;
  client_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_owner: string;
  overlapping_products: string[];
  status: string;
}

export function useCampaignOverlaps(campaignId?: string, productIds?: string[]) {
  return useQuery({
    queryKey: ['campaign-overlaps', campaignId, productIds],
    enabled: !!campaignId && !!productIds && productIds.length > 0,
    queryFn: async () => {
      // Find all campaign_targets in OTHER campaigns that target clients with overlapping products
      const { data: otherCampaigns, error: cErr } = await supabase
        .from('campaigns')
        .select('id, name, owner_id, target_product_ids, profiles:owner_id(full_name)')
        .neq('id', campaignId!)
        .in('status', ['draft', 'active']);
      if (cErr) throw cErr;

      // Filter to campaigns with overlapping products
      const overlappingCampaigns = (otherCampaigns || []).filter((c: any) => {
        const cProducts = c.target_product_ids || [];
        return cProducts.some((p: string) => productIds!.includes(p));
      });

      if (overlappingCampaigns.length === 0) return [];

      const campaignIds = overlappingCampaigns.map((c: any) => c.id);
      const { data: targets, error: tErr } = await supabase
        .from('campaign_targets')
        .select('client_id, campaign_id, status, clients(name)')
        .in('campaign_id', campaignIds)
        .not('client_id', 'is', null);
      if (tErr) throw tErr;

      const campaignMap = new Map(overlappingCampaigns.map((c: any) => [c.id, c]));
      const overlaps: CampaignOverlap[] = (targets || []).map((t: any) => {
        const campaign = campaignMap.get(t.campaign_id) as any;
        const overlappingProducts = (campaign?.target_product_ids || []).filter((p: string) => productIds!.includes(p));
        return {
          client_id: t.client_id,
          client_name: (t.clients as any)?.name || 'Unknown',
          campaign_id: t.campaign_id,
          campaign_name: campaign?.name || 'Unknown',
          campaign_owner: (campaign?.profiles as any)?.full_name || 'Unknown',
          overlapping_products: overlappingProducts,
          status: t.status,
        };
      });

      return overlaps;
    },
    staleTime: 30000,
  });
}

export function useUpdateCampaignTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id, ...values }: { id: string; campaign_id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('campaign_targets')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['campaign_targets', vars.campaign_id] }),
  });
}
