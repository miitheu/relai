import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface Territory { id: string; name: string; description: string | null; region: string | null; segment: string | null; parent_territory_id: string | null; is_active: boolean; created_by: string | null; created_at: string; updated_at: string; }
export interface TerritoryAssignment { id: string; territory_id: string; user_id: string; client_id: string | null; assigned_at: string; assigned_by: string | null; }

export function useTerritories() {
  const db = useDb();
  return useQuery({
    queryKey: ['territories'],
    queryFn: async () => {
      const { data, error } = await db.query('territories', { order: [{ column: 'name' }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as Territory[];
    },
  });
}

export function useTerritory(id: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['territories', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.queryOne('territories', { filters: [{ column: 'id', operator: 'eq', value: id! }] });
      if (error) throw new Error(error.message);
      return data as Territory;
    },
  });
}

export function useCreateTerritory() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; region?: string; segment?: string; parent_territory_id?: string }) => {
      const { data, error } = await db.insert('territories', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as Territory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useUpdateTerritory() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('territories', { id }, input);
      if (error) throw new Error(error.message);
      return data[0] as Territory;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useDeleteTerritory() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('territories', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territories'] }),
  });
}

export function useTerritoryAssignments(territoryId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['territory_assignments', territoryId || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (territoryId) filters.push({ column: 'territory_id', operator: 'eq', value: territoryId });
      const { data, error } = await db.query('territory_assignments', { filters, order: [{ column: 'assigned_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as TerritoryAssignment[];
    },
  });
}

export function useAssignTerritory() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { territory_id: string; user_id: string; client_id?: string }) => {
      const { data, error } = await db.insert('territory_assignments', { ...input, assigned_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as TerritoryAssignment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['territory_assignments'] });
      qc.invalidateQueries({ queryKey: ['territory_assignments', vars.territory_id] });
    },
  });
}

export function useUnassignTerritory() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('territory_assignments', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['territory_assignments'] }),
  });
}
