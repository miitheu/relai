import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

export interface Invoice { id: string; client_id: string; opportunity_id: string | null; file_name: string | null; file_path: string | null; file_size: number | null; mime_type: string | null; invoice_number: string | null; amount: number | null; currency: string; invoice_date: string; due_date: string | null; status: 'unpaid' | 'paid' | 'overdue' | 'void'; paid_at: string | null; notes: string | null; uploaded_by: string | null; created_at: string; updated_at: string; opportunities?: { name: string; owner_id: string } | null; }

export function useInvoices(clientId?: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['invoices', clientId || 'all'],
    enabled: !!clientId,
    queryFn: async () => {
      const filters: Filter[] = [];
      if (clientId) filters.push({ column: 'client_id', operator: 'eq', value: clientId });
      const { data, error } = await db.query('invoices', { select: '*, opportunities(name, owner_id)', filters, order: [{ column: 'created_at', ascending: false }] });
      if (error) throw new Error(error.message);
      return (data || []) as Invoice[];
    },
  });
}

export function useOverdueInvoices() {
  const db = useDb();
  return useQuery({
    queryKey: ['invoices', 'overdue'],
    queryFn: async () => {
      const { data, error } = await db.query('invoices', {
        select: '*, opportunities(name, owner_id), clients(name)',
        filters: [{ column: 'status', operator: 'eq', value: 'unpaid' }],
        not: [{ column: 'due_date', operator: 'is', value: null }],
        order: [{ column: 'due_date', ascending: true }],
      });
      if (error) throw new Error(error.message);
      // Client-side filter for overdue (due_date <= today)
      const today = new Date().toISOString().split('T')[0];
      return ((data || []) as (Invoice & { clients?: { name: string } })[]).filter(inv => inv.due_date && inv.due_date <= today);
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useUploadInvoice() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ clientId, opportunityId, file, invoiceNumber, amount, currency, invoiceDate, dueDate, notes }: { clientId: string; opportunityId?: string; file?: File; invoiceNumber?: string; amount?: number; currency?: string; invoiceDate?: string; dueDate?: string; notes?: string; }) => {
      let filePath: string | null = null, fileName: string | null = null, fileSize: number | null = null, mimeType: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `${clientId}/${Date.now()}_${safeName}`;
        fileName = file.name; fileSize = file.size; mimeType = file.type || 'application/octet-stream';
        await db.uploadFile!('invoices', filePath, file);
      }
      const { data, error } = await db.insert('invoices', {
        client_id: clientId, opportunity_id: opportunityId || null, file_name: fileName, file_path: filePath,
        file_size: fileSize, mime_type: mimeType, invoice_number: invoiceNumber || null, amount: amount || null,
        currency: currency || 'USD', invoice_date: invoiceDate || new Date().toISOString().split('T')[0],
        due_date: dueDate || null, status: 'unpaid', notes: notes || null, uploaded_by: user?.id || null,
      });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });
}

export function useUpdateInvoice() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await db.update('invoices', { id }, { ...input, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });
}

export function useMarkInvoicePaid() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db.update('invoices', { id }, { status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      return data[0];
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });
}

export function useDeleteInvoice() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; filePath?: string | null }) => {
      if (filePath) await db.removeFiles!('invoices', [filePath]);
      const { error } = await db.delete('invoices', { id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });
}

export function useInvoiceDownloadUrl() {
  const db = useDb();
  return async (filePath: string) => {
    const result = await db.getSignedUrl!('invoices', filePath, 60 * 60);
    return (result as any).signedUrl;
  };
}
