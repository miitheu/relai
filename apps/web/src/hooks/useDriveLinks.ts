import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';

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
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['drive_links', filters],
    enabled: !!(filters?.client_id || filters?.opportunity_id),
    queryFn: async () => {
      let q = (supabase.from('drive_links' as any) as any).select('*').order('created_at', { ascending: false });
      if (filters?.client_id) q = q.eq('client_id', filters.client_id);
      if (filters?.opportunity_id) q = q.eq('opportunity_id', filters.opportunity_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DriveLink[];
    },
  });
}

export function useCreateDriveLink() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { client_id?: string; opportunity_id?: string; url: string; title: string; link_type: 'folder' | 'file' }) => {
      const { data, error } = await (supabase.from('drive_links' as any) as any)
        .insert({ ...input, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as DriveLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive_links'] }),
  });
}

export function useDeleteDriveLink() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('drive_links' as any) as any).delete().eq('id', id);
      if (error) throw error;
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
    // Try to extract doc type
    if (/docs\.google\.com/.test(url)) suggestedTitle = 'Google Doc';
    else if (/sheets\.google\.com/.test(url)) suggestedTitle = 'Google Sheet';
    else if (/slides\.google\.com/.test(url)) suggestedTitle = 'Google Slides';
    else if (isFolder) suggestedTitle = 'Google Drive Folder';
    else suggestedTitle = 'Google Drive File';
  }

  return { linkType, suggestedTitle, isDrive };
}
