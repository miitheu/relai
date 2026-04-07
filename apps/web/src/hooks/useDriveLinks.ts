import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface DriveLink {
  id: string;
  client_id: string | null;
  opportunity_id: string | null;
  url: string;
  title: string;
  link_type: 'folder' | 'file';
  created_by: string;
  created_at: string;
}

export function useDriveLinks(filters?: { client_id?: string; opportunity_id?: string }) {
  const db = useDb();
  return useQuery({
    queryKey: ['drive_links', filters],
    enabled: !!(filters?.client_id || filters?.opportunity_id),
    queryFn: async () => {
      const f: Filter[] = [];
      if (filters?.client_id) f.push({ column: 'client_id', operator: 'eq', value: filters.client_id });
      if (filters?.opportunity_id) f.push({ column: 'opportunity_id', operator: 'eq', value: filters.opportunity_id });
      const { data, error } = await db.query('drive_links', { filters: f, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data ?? []) as DriveLink[];
    },
  });
}

export function useCreateDriveLink() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id?: string; opportunity_id?: string; url: string; title: string; link_type: 'folder' | 'file' }) => {
      const { data, error } = await db.insert('drive_links', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as DriveLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive_links'] }),
  });
}

export function useDeleteDriveLink() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.delete('drive_links', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive_links'] }),
  });
}

/** Auto-detect link type and suggest title from a Google Drive URL */
export function parseDriveUrl(url: string): { linkType: 'folder' | 'file'; suggestedTitle: string; isDrive: boolean } {
  const isDrive = /drive\.google\.com|docs\.google\.com|sheets\.google\.com|slides\.google\.com/.test(url);
  const isFolder = /\/folders\//.test(url);
  const linkType = isFolder ? 'folder' : 'file';

  let suggestedTitle = '';
  if (isDrive) {
    if (/docs\.google\.com/.test(url)) suggestedTitle = 'Google Doc';
    else if (/sheets\.google\.com/.test(url)) suggestedTitle = 'Google Sheet';
    else if (/slides\.google\.com/.test(url)) suggestedTitle = 'Google Slides';
    else if (isFolder) suggestedTitle = 'Google Drive Folder';
    else suggestedTitle = 'Google Drive File';
  }

  return { linkType, suggestedTitle, isDrive };
}
