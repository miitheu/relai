import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface ApprovalProcess { id: string; name: string; entity_type: string; steps: Record<string, any>[]; is_active: boolean; created_at: string; updated_at: string; }
export interface ApprovalRequest { id: string; process_id: string; entity_type: string; entity_id: string; requested_by: string; status: string; current_step: number; created_at: string; updated_at: string; approval_processes?: { name: string } | null; profiles?: { full_name: string; email: string } | null; }
export interface ApprovalStep { id: string; request_id: string; step_number: number; approver_id: string; status: string; comments: string | null; acted_at: string | null; created_at: string; }

export function useApprovalProcesses() {
  const db = useDb();
  return useQuery({
    queryKey: ['approval-processes'],
    queryFn: async () => {
      const { data, error } = await db.query('approval_processes', { order: [{ column: 'name' }], limit: 100 });
      if (error) throw new Error(error.message);
      return data as unknown as ApprovalProcess[];
    },
  });
}

export function useApprovalRequests(status?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['approval-requests', status || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (status) filters.push({ column: 'status', operator: 'eq', value: status });
      const { data, error } = await db.query('approval_requests', { select: '*, approval_processes(name), profiles!approval_requests_requested_by_fkey(full_name, email)', filters, order: [{ column: 'created_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as ApprovalRequest[];
    },
  });
}

export function useMyPendingApprovals() {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-pending-approvals', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db.query('approval_steps', { select: '*, approval_requests(*, approval_processes(name))', filters: [{ column: 'approver_id', operator: 'eq', value: user!.id }, { column: 'status', operator: 'eq', value: 'pending' }], order: [{ column: 'created_at', ascending: false }], limit: 50 });
      if (error) throw new Error(error.message);
      return data as unknown as (ApprovalStep & { approval_requests: ApprovalRequest })[];
    },
  });
}

export function useCreateApprovalRequest() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { process_id: string; entity_type: string; entity_id: string; }) => {
      const { data, error } = await db.insert('approval_requests', { ...input, requested_by: user?.id, status: 'pending', current_step: 1 });
      if (error) throw new Error(error.message);
      return data[0] as unknown as ApprovalRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}

export function useApproveStep() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, comments }: { stepId: string; comments?: string }) => {
      const { data, error } = await db.update('approval_steps', { id: stepId }, { status: 'approved', comments, acted_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0] as unknown as ApprovalStep;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}

export function useRejectStep() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, comments }: { stepId: string; comments?: string }) => {
      const { data, error } = await db.update('approval_steps', { id: stepId }, { status: 'rejected', comments, acted_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0] as unknown as ApprovalStep;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pending-approvals'] });
    },
  });
}
