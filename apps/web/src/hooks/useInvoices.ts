import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Invoice {
  id: string;
  client_id: string;
  opportunity_id: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  invoice_number: string | null;
  amount: number | null;
  currency: string;
  invoice_date: string;
  due_date: string | null;
  status: 'unpaid' | 'paid' | 'overdue' | 'void';
  paid_at: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  opportunities?: { name: string; owner_id: string } | null;
}

export function useInvoices(clientId?: string) {
  return useQuery({
    queryKey: ['invoices', clientId || 'all'],
    enabled: !!clientId,
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select('*, opportunities(name, owner_id)')
        .order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Invoice[];
    },
  });
}

export function useOverdueInvoices() {
  return useQuery({
    queryKey: ['invoices', 'overdue'],
    queryFn: async () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const { data, error } = await supabase
        .from('invoices')
        .select('*, opportunities(name, owner_id), clients(name)')
        .eq('status', 'unpaid')
        .not('due_date', 'is', null)
        .lte('due_date', new Date().toISOString().split('T')[0])
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as (Invoice & { clients?: { name: string } })[];
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  });
}

export function useUploadInvoice() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      clientId,
      opportunityId,
      file,
      invoiceNumber,
      amount,
      currency,
      invoiceDate,
      dueDate,
      notes,
    }: {
      clientId: string;
      opportunityId?: string;
      file?: File;
      invoiceNumber?: string;
      amount?: number;
      currency?: string;
      invoiceDate?: string;
      dueDate?: string;
      notes?: string;
    }) => {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;
      let mimeType: string | null = null;

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `${clientId}/${Date.now()}_${safeName}`;
        fileName = file.name;
        fileSize = file.size;
        mimeType = file.type || 'application/octet-stream';

        const { error: uploadErr } = await supabase.storage
          .from('invoices')
          .upload(filePath, file, { upsert: false });
        if (uploadErr) throw uploadErr;
      }

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          client_id: clientId,
          opportunity_id: opportunityId || null,
          file_name: fileName,
          file_path: filePath,
          file_size: fileSize,
          mime_type: mimeType,
          invoice_number: invoiceNumber || null,
          amount: amount || null,
          currency: currency || 'USD',
          invoice_date: invoiceDate || new Date().toISOString().split('T')[0],
          due_date: dueDate || null,
          status: 'unpaid',
          notes: notes || null,
          uploaded_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath?: string | null }) => {
      if (filePath) {
        await supabase.storage.from('invoices').remove([filePath]);
      }
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useInvoiceDownloadUrl() {
  return async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('invoices')
      .createSignedUrl(filePath, 60 * 60);
    if (error) throw error;
    return data.signedUrl;
  };
}
