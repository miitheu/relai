import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ApprovalProcess {
  id: string;
  name: string;
  entity_type: string;
  steps: Record<string, any>[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequest {
  id: string;
  process_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  approval_processes?: { name: string } | null;
  profiles?: { full_name: string; email: string } | null;
}

export interface ApprovalStep {
  id: string;
  request_id: string;
  step_number: number;
  approver_id: string;
  status: string;
  comments: string | null;
  acted_at: string | null;
  created_at: string;
}

export function useApprovalProcesses() {
  return useQuery({
    queryKey: ['approval-processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_processes' as any)
        .select('*')
        .order('name')
        .limit(100);
      if (error) throw error;
      return data as unknown as ApprovalProcess[];
    },
  });
}

export function useApprovalRequests(status?: string) {
  return useQuery({
    queryKey: ['approval-requests', status || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('approval_requests' as any)
        .select('*, approval_processes(name), profiles!approval_requests_requested_by_fkey(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ApprovalRequest[];
    },
  });
}

export function useMyPendingApprovals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-pending-approvals', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_steps' as any)
        .select('*, approval_requests(*, approval_processes(name))')
        .eq('approver_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as (ApprovalStep & { approval_requests: ApprovalRequest })[];
    },
  });
}

export function useCreateApprovalRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      process_id: string;
      entity_type: string;
      entity_id: string;
    }) => {
      const { data, error } = await supabase
        .from('approval_requests' as any)
        .insert({ ...input, requested_by: user?.id, status: 'pending', current_step: 1 } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ApprovalRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}

export function useApproveStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, comments }: { stepId: string; comments?: string }) => {
      const { data, error } = await supabase
        .from('approval_steps' as any)
        .update({ status: 'approved', comments, acted_at: new Date().toISOString() } as any)
        .eq('id', stepId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ApprovalStep;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}

export function useRejectStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, comments }: { stepId: string; comments?: string }) => {
      const { data, error } = await supabase
        .from('approval_steps' as any)
        .update({ status: 'rejected', comments, acted_at: new Date().toISOString() } as any)
        .eq('id', stepId)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ApprovalStep;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}
