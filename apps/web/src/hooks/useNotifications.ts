import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';

export function useNotifications() {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db.query('notifications', { filters: [{ column: 'user_id', operator: 'eq', value: user!.id }], order: [{ column: 'created_at', ascending: false }], limit: 50 });
      if (error) throw new Error(error.message);
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useUnreadCount() {
  const db = useDb();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications_unread', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await db.query('notifications', { count: 'exact', head: true, filters: [{ column: 'user_id', operator: 'eq', value: user!.id }, { column: 'is_read', operator: 'eq', value: false }] });
      if (error) throw new Error(error.message);
      return count || 0;
    },
    refetchInterval: 30000,
  });
}

export function useMarkNotificationRead() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.update('notifications', { id }, { is_read: true });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications_unread'] });
    },
  });
}

export function useMarkAllRead() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      // Update all unread notifications for the user
      const { data: unread } = await db.query('notifications', { select: 'id', filters: [{ column: 'user_id', operator: 'eq', value: user!.id }, { column: 'is_read', operator: 'eq', value: false }] });
      for (const n of unread || []) {
        await db.update('notifications', { id: n.id }, { is_read: true });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications_unread'] });
    },
  });
}

export function useDeleteNotification() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('notifications', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications_unread'] });
    },
  });
}

export function useClearAllNotifications() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data: all } = await db.query('notifications', { select: 'id', filters: [{ column: 'user_id', operator: 'eq', value: user!.id }] });
      for (const n of all || []) {
        await db.delete('notifications', { id: n.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications_unread'] });
    },
  });
}
