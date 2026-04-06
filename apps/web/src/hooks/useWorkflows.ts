import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WorkflowRule {
  id: string;
  name: string;
  description: string | null;
  entity_type: string;
  trigger_event: string;
  conditions: Record<string, any> | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowAction {
  id: string;
  rule_id: string;
  action_type: string;
  action_config: Record<string, any> | null;
  execution_order: number;
  created_at: string;
}

export interface WorkflowExecutionLog {
  id: string;
  rule_id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  error_message: string | null;
  executed_at: string;
}

export function useWorkflowRules() {
  return useQuery({
    queryKey: ['workflow-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_rules' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as WorkflowRule[];
    },
  });
}

export function useCreateWorkflowRule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      entity_type: string;
      trigger_event: string;
      conditions?: Record<string, any>;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('workflow_rules' as any)
        .insert({ ...input, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WorkflowRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useUpdateWorkflowRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('workflow_rules' as any)
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WorkflowRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useDeleteWorkflowRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workflow_rules' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-rules'] }),
  });
}

export function useWorkflowActions(ruleId: string | undefined) {
  return useQuery({
    queryKey: ['workflow-actions', ruleId],
    enabled: !!ruleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workflow_actions' as any)
        .select('*')
        .eq('rule_id', ruleId!)
        .order('execution_order')
        .limit(100);
      if (error) throw error;
      return data as unknown as WorkflowAction[];
    },
  });
}

export function useCreateWorkflowAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rule_id: string;
      action_type: string;
      action_config?: Record<string, any>;
      execution_order?: number;
    }) => {
      const { data, error } = await supabase
        .from('workflow_actions' as any)
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WorkflowAction;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['workflow-actions', vars.rule_id] });
      qc.invalidateQueries({ queryKey: ['workflow-rules'] });
    },
  });
}

export function useWorkflowExecutionLog(ruleId?: string) {
  return useQuery({
    queryKey: ['workflow-execution-log', ruleId || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('workflow_execution_log' as any)
        .select('*')
        .order('executed_at', { ascending: false })
        .limit(200);
      if (ruleId) q = q.eq('rule_id', ruleId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as WorkflowExecutionLog[];
    },
  });
}
