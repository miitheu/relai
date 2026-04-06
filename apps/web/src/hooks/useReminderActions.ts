import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export function useDismissals() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['action_dismissals', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_dismissals')
        .select('action_key, dismissed_until')
        .eq('user_id', userId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSnoozeReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ actionKey, days }: { actionKey: string; days: number }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await supabase
        .from('action_dismissals')
        .upsert(
          { user_id: user.id, action_key: actionKey, dismissed_until: until.toISOString() },
          { onConflict: 'user_id,action_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}

export function useDismissReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (actionKey: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const until = new Date();
      until.setFullYear(until.getFullYear() + 1);
      const { error } = await supabase
        .from('action_dismissals')
        .upsert(
          { user_id: user.id, action_key: actionKey, dismissed_until: until.toISOString() },
          { onConflict: 'user_id,action_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}

export function useUnsnoozeReminder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (actionKey: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('action_dismissals')
        .delete()
        .eq('user_id', user.id)
        .eq('action_key', actionKey);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action_dismissals'] }),
  });
}
