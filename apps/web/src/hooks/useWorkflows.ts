import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface WorkflowRule { id: string; name: string; description: string | null; entity_type: string; trigger_event: string; conditions: Record<string, any> | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface WorkflowAction { id: string; rule_id: string; action_type: string; action_config: Record<string, any> | null; execution_order: number; created_at: string; }
export interface WorkflowExecutionLog { id: string; rule_id: string; entity_type: string; entity_id: string; status: string; error_message: string | null; executed_at: string; }

export function useWorkflowRules() {
  const db = useDb();
  return useQuery({
    queryKey: ['workflow-rules'],
    queryFn: async () => {
      const { data, error } = await db.query('workflow_rules', { order: [{ column: 'created_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as WorkflowRule[];
    },
  });
}

export function useCreateWorkflowRule() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; entity_type: string; trigger_event: string; conditions?: Record<string, any>; is_active?: boolean; }) => {
      const { data, error } = await db.insert('workflow_rules', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as unknown as WorkflowRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useUpdateWorkflowRule() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('workflow_rules', { id }, input);
      if (error) throw new Error(error.message);
      return data[0] as unknown as WorkflowRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useDeleteWorkflowRule() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('workflow_rules', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useWorkflowActions(ruleId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['workflow-actions', ruleId],
    enabled: !!ruleId,
    queryFn: async () => {
      const { data, error } = await db.query('workflow_actions', { filters: [{ column: 'rule_id', operator: 'eq', value: ruleId! }], order: [{ column: 'execution_order' }], limit: 100 });
      if (error) throw new Error(error.message);
      return data as unknown as WorkflowAction[];
    },
  });
}

export function useCreateWorkflowAction() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { rule_id: string; action_type: string; action_config?: Record<string, any>; execution_order?: number; }) => {
      const { data, error } = await db.insert('workflow_actions', input);
      if (error) throw new Error(error.message);
      return data[0] as unknown as WorkflowAction;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['workflow-actions', vars.rule_id] });
      qc.invalidateQueries({ queryKey: ['workflow-rules'] });
    },
  });
}

export function useWorkflowExecutionLog(ruleId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['workflow-execution-log', ruleId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (ruleId) filters.push({ column: 'rule_id', operator: 'eq', value: ruleId });
      const { data, error } = await db.query('workflow_execution_log', { filters, order: [{ column: 'executed_at', ascending: false }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as WorkflowExecutionLog[];
    },
  });
}
