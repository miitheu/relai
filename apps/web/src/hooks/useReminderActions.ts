import { useDb } from '@relai/db/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export function useDismissals() {
  const db = useDb();
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['action_dismissals', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db.query('action_dismissals', { select: 'action_key, dismissed_until', filters: [{ column: 'user_id', operator: 'eq', value: userId! }] });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useSnoozeReminder() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ actionKey, days }: { actionKey: string; days: number }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await db.upsert('action_dismissals',
        { user_id: user.id, action_key: actionKey, dismissed_until: until.toISOString() },
        { onConflict: 'user_id,action_key' }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}

export function useDismissReminder() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (actionKey: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const until = new Date();
      until.setFullYear(until.getFullYear() + 1);
      const { error } = await db.upsert('action_dismissals',
        { user_id: user.id, action_key: actionKey, dismissed_until: until.toISOString() },
        { onConflict: 'user_id,action_key' }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}

export function useUnsnoozeReminder() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (actionKey: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      // Find and delete the dismissal
      const { data } = await db.query('action_dismissals', { select: 'id', filters: [{ column: 'user_id', operator: 'eq', value: user.id }, { column: 'action_key', operator: 'eq', value: actionKey }] });
      if (data && data[0]) {
        const { error } = await db.delete('action_dismissals', { id: data[0].id });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}
