import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export function useTasks(filters?: { client_id?: string; opportunity_id?: string; status?: string }) {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tasks', user?.id, filters],
    enabled: !!user,
    queryFn: async () => {
      const f: Filter[] = [{ column: 'user_id', operator: 'eq', value: user!.id }];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      if (filters?.status) f.push({ column: 'status', operator: 'eq', value: filters.status });
      const { data, error } = await db.query('tasks', { select: '*, clients(name), opportunities(name)', filters: f, order: [{ column: 'due_date', ascending: true, nullsFirst: false }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useCreateTask() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string; due_date?: string; priority?: string; client_id?: string; opportunity_id?: string; campaign_target_id?: string }) => {
      const { data, error } = await db.insert('tasks', { ...input, user_id: user!.id });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      if (input.status === 'done' && !input.completed_at) input.completed_at = new Date().toISOString();
      const { data, error } = await db.update('tasks', { id }, input);
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('tasks', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
