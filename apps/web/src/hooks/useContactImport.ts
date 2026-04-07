import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeCompanyName, extractDomain, calculateSimilarity, isValidEmail, type CompanyMatch, type MatchConfidence } from '@/lib/companyMatching';

// ============================================================
// IMPORT BATCH HOOKS
// ============================================================

export function useImportBatches() {
  const db = useDb();
  return useQuery({ queryKey: ['import-batches'], queryFn: async () => {
    const { data, error } = await db.query('contact_import_batches', { order: [{ column: 'created_at', ascending: false }] });
    if (error) throw new Error(error.message); return data;
  }});
}

export function useImportBatch(batchId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: ['import-batch', batchId], enabled: !!batchId, queryFn: async () => {
    const { data, error } = await db.queryOne('contact_import_batches', { filters: [{ column: 'id', operator: 'eq', value: batchId! }] });
    if (error) throw new Error(error.message); return data;
  }});
}

export function useCreateImportBatch() {
  const db = useDb(); const qc = useQueryClient(); const { user } = useAuth();
  return useMutation({ mutationFn: async (input: { name?: string; file_name?: string; total_rows?: number }) => {
    const { data, error } = await db.insert('contact_import_batches', { ...input, created_by: user?.id, status: 'pending' });
    if (error) throw new Error(error.message); return data[0];
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ['import-batches'] }) });
}

export function useUpdateImportBatch() {
  const db = useDb(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
    const { data, error } = await db.update('contact_import_batches', { id }, input);
    if (error) throw new Error(error.message); return data[0];
  }, onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ['import-batches'] }); qc.invalidateQueries({ queryKey: ['import-batch', vars.id] }); }});
}

// ============================================================
// STAGING ROW HOOKS
// ============================================================

export function useStagingRows(batchId: string | undefined, filters?: { resolution_status?: string }) {
  const db = useDb();
  return useQuery({ queryKey: ['staging-rows', batchId, filters], enabled: !!batchId, queryFn: async () => {
    const f: any[] = [{ column: 'batch_id', operator: 'eq', value: batchId! }];
    if (filters?.resolution_status) f.push({ column: 'resolution_status', operator: 'eq', value: filters.resolution_status });
    const { data, error } = await db.query('contact_import_staging', {
      select: '*, matched_client:clients!contact_import_staging_matched_client_id_fkey(id, name), resolved_client:clients!contact_import_staging_resolved_client_id_fkey(id, name)',
      filters: f, order: [{ column: 'row_number' }],
    });
    if (error) throw new Error(error.message); return data;
  }});
}

export function useInsertStagingRows() {
  const db = useDb(); const qc = useQueryClient();
  return useMutation({ mutationFn: async (rows: any[]) => {
    const { data, error } = await db.insert('contact_import_staging', rows);
    if (error) throw new Error(error.message); return data;
  }, onSuccess: (data) => { if (data?.[0]) qc.invalidateQueries({ queryKey: ['staging-rows', data[0].batch_id] }); }});
}

export function useUpdateStagingRow() {
  const db = useDb(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, ...input }: { id: string; batch_id?: string; [key: string]: any }) => {
    const { data, error } = await db.update('contact_import_staging', { id }, input);
    if (error) throw new Error(error.message); return data[0];
  }, onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['staging-rows', data.batch_id] }); }});
}

export function useBulkUpdateStagingRows() {
  const db = useDb(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ ids, updates, batchId }: { ids: string[]; updates: any; batchId: string }) => {
    for (const id of ids) { await db.update('contact_import_staging', { id }, updates); }
    return { ids, batchId };
  }, onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['staging-rows', data.batchId] }); }});
}

// ============================================================
// COMPANY MATCHING HOOKS
// ============================================================

export function useMatchCompanies() {
  const db = useDb(); const { user } = useAuth();
  return useMutation({ mutationFn: async (batchId: string) => {
    const { data: stagingRows, error: stagingError } = await db.query('contact_import_staging', { filters: [{ column: 'batch_id', operator: 'eq', value: batchId }] });
    if (stagingError) throw new Error(stagingError.message);
    const { data: clients, error: clientsError } = await db.query('clients', { select: 'id, name, normalized_name, primary_domain' });
    if (clientsError) throw new Error(clientsError.message);
    const { data: aliases, error: aliasError } = await db.query('client_aliases', { select: 'client_id, alias_name, normalized_alias' });
    if (aliasError) throw new Error(aliasError.message);

    const clientsByNormalized = new Map<string, any>();
    const clientsByDomain = new Map<string, any>();
    clients?.forEach((c: any) => { if (c.normalized_name) clientsByNormalized.set(c.normalized_name, c); if (c.primary_domain) clientsByDomain.set(c.primary_domain, c); });
    aliases?.forEach((a: any) => { const client = clients?.find((c: any) => c.id === a.client_id); if (client && a.normalized_alias) clientsByNormalized.set(a.normalized_alias, client); });

    const updates: { id: string; updates: any }[] = [];
    for (const row of stagingRows || []) {
      const normalized = normalizeCompanyName(row.raw_company);
      const domain = extractDomain(row.raw_email);
      let matchedClientId: string | null = null; let confidence: MatchConfidence = 'new'; let method: string | null = null; const suggestedIds: string[] = [];
      const exactMatch = clientsByNormalized.get(normalized);
      if (exactMatch) { matchedClientId = exactMatch.id; confidence = 'exact'; method = 'name_normalized'; }
      if (!matchedClientId && domain) { const domainMatch = clientsByDomain.get(domain); if (domainMatch) { matchedClientId = domainMatch.id; confidence = 'likely'; method = 'domain'; } }
      if (!matchedClientId && normalized) {
        const fuzzyMatches: CompanyMatch[] = [];
        clients?.forEach((c: any) => { if (c.normalized_name) { const score = calculateSimilarity(normalized, c.normalized_name); if (score >= 0.6) fuzzyMatches.push({ clientId: c.id, clientName: c.name, confidence: score >= 0.9 ? 'likely' : score >= 0.7 ? 'ambiguous' : 'new', method: 'fuzzy', score }); } });
        fuzzyMatches.sort((a, b) => b.score - a.score);
        if (fuzzyMatches.length > 0) { const top = fuzzyMatches[0]; matchedClientId = top.clientId; confidence = top.confidence; method = 'fuzzy'; if (confidence === 'ambiguous') suggestedIds.push(...fuzzyMatches.slice(0, 3).map(m => m.clientId)); }
      }
      const emailValid = isValidEmail(row.raw_email);
      const validationErrors: string[] = []; const validationWarnings: string[] = [];
      if (!row.raw_name) validationErrors.push('Missing contact name');
      if (!row.raw_company) validationWarnings.push('Missing company name');
      if (row.raw_email && !emailValid) validationErrors.push('Invalid email format');
      updates.push({ id: row.id, updates: {
        normalized_company_name: normalized || null, normalized_email: row.raw_email?.trim().toLowerCase() || null, email_domain: domain,
        matched_client_id: matchedClientId, company_match_confidence: matchedClientId ? confidence : 'new', company_match_method: method,
        suggested_client_ids: suggestedIds.length > 0 ? suggestedIds : null,
        validation_status: validationErrors.length > 0 ? 'invalid' : validationWarnings.length > 0 ? 'warning' : 'valid',
        validation_errors: validationErrors.length > 0 ? validationErrors : null, validation_warnings: validationWarnings.length > 0 ? validationWarnings : null,
      }});
    }
    for (const { id, updates: rowUpdates } of updates) { await db.update('contact_import_staging', { id }, rowUpdates); }
    await db.update('contact_import_batches', { id: batchId }, { status: 'review', processed_rows: updates.length });
    return { processed: updates.length };
  }});
}

// ============================================================
// RESOLVE & IMPORT HOOKS
// ============================================================

export function useResolveCompany() {
  const db = useDb(); const qc = useQueryClient(); const { user } = useAuth();
  return useMutation({ mutationFn: async ({ stagingRowId, clientId, createNew, newClientData }: { stagingRowId: string; clientId?: string; createNew?: boolean; newClientData?: { name: string; client_type?: string }; }) => {
    let resolvedClientId = clientId;
    if (createNew && newClientData) {
      const normalized = normalizeCompanyName(newClientData.name);
      let existingClient = null;
      if (normalized) { const { data } = await db.query('clients', { select: 'id', filters: [{ column: 'normalized_name', operator: 'eq', value: normalized }], limit: 1 }); existingClient = data?.[0] || null; }
      if (existingClient) { resolvedClientId = existingClient.id; }
      else {
        const { data: newClientArr, error: createError } = await db.insert('clients', { name: newClientData.name, client_type: newClientData.client_type || 'Other', created_by: user?.id, owner_id: user?.id, import_source: 'contact_import' });
        if (createError) throw new Error(createError.message);
        resolvedClientId = newClientArr[0].id;
        if (normalized) { await db.insert('client_aliases', { client_id: newClientArr[0].id, alias_name: newClientData.name, normalized_alias: normalized, alias_type: 'alternate_name', source: 'import', created_by: user?.id }); }
      }
    }
    const { data, error } = await db.update('contact_import_staging', { id: stagingRowId }, { resolved_client_id: resolvedClientId, resolution_status: 'resolved', resolved_by: user?.id, resolved_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return data[0];
  }, onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['staging-rows', data.batch_id] }); qc.invalidateQueries({ queryKey: ['clients'] }); }});
}

export function useImportContacts() {
  const db = useDb(); const qc = useQueryClient(); const { user } = useAuth();
  return useMutation({ mutationFn: async (batchId: string) => {
    const { data: rows, error: rowsError } = await db.query('contact_import_staging', {
      filters: [{ column: 'batch_id', operator: 'eq', value: batchId }, { column: 'resolution_status', operator: 'eq', value: 'resolved' }],
      not: [{ column: 'resolved_client_id', operator: 'is', value: null }],
    });
    if (rowsError) throw new Error(rowsError.message);
    let imported = 0; let skipped = 0;
    for (const row of rows || []) {
      if (row.normalized_email) {
        const { data: existingArr } = await db.query('contacts', { select: 'id', filters: [{ column: 'email', operator: 'eq', value: row.normalized_email }, { column: 'client_id', operator: 'eq', value: row.resolved_client_id }], limit: 1 });
        if (existingArr?.[0]) {
          await db.update('contact_import_staging', { id: row.id }, { resolution_status: 'skipped', is_duplicate_contact: true, matched_contact_id: existingArr[0].id });
          skipped++; continue;
        }
      }
      const { data: contactArr, error: contactError } = await db.insert('contacts', {
        client_id: row.resolved_client_id, name: row.raw_name || 'Unknown', title: row.raw_contact_title || null,
        email: row.normalized_email || null, phone: row.raw_phone || null, source: row.raw_source || null,
        notes: row.raw_deals ? `Deals: ${row.raw_deals}` : null, created_by: user?.id, import_batch_id: batchId,
        imported_at: new Date().toISOString(),
        raw_import_data: { raw_name: row.raw_name, raw_company: row.raw_company, raw_organization_type: row.raw_organization_type, raw_deals: row.raw_deals, raw_contact_title: row.raw_contact_title, raw_phone: row.raw_phone, raw_email: row.raw_email, raw_people: row.raw_people, raw_source: row.raw_source },
      });
      if (contactError) { console.error('Failed to import contact:', contactError); continue; }
      await db.update('contact_import_staging', { id: row.id }, { resolution_status: 'imported', imported_contact_id: contactArr[0].id, imported_at: new Date().toISOString() });
      imported++;
    }
    await db.update('contact_import_batches', { id: batchId }, { status: 'completed', imported_rows: imported, skipped_rows: skipped, completed_at: new Date().toISOString() });
    return { imported, skipped };
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); qc.invalidateQueries({ queryKey: ['import-batches'] }); }});
}

// ============================================================
// STATS
// ============================================================

export function useStagingStats(batchId: string | undefined) {
  const db = useDb();
  return useQuery({ queryKey: ['staging-stats', batchId], enabled: !!batchId, queryFn: async () => {
    const { data, error } = await db.query('contact_import_staging', { select: 'company_match_confidence, resolution_status, validation_status, is_duplicate_contact', filters: [{ column: 'batch_id', operator: 'eq', value: batchId! }] });
    if (error) throw new Error(error.message);
    const stats = { total: data.length, byConfidence: { exact: 0, likely: 0, ambiguous: 0, new: 0 }, byResolution: { pending: 0, resolved: 0, skipped: 0, imported: 0 }, byValidation: { valid: 0, invalid: 0, warning: 0, pending: 0 }, duplicateContacts: 0 };
    data.forEach((row: any) => {
      if (row.company_match_confidence && stats.byConfidence[row.company_match_confidence as keyof typeof stats.byConfidence] !== undefined) stats.byConfidence[row.company_match_confidence as keyof typeof stats.byConfidence]++;
      if (row.resolution_status && stats.byResolution[row.resolution_status as keyof typeof stats.byResolution] !== undefined) stats.byResolution[row.resolution_status as keyof typeof stats.byResolution]++;
      if (row.validation_status && stats.byValidation[row.validation_status as keyof typeof stats.byValidation] !== undefined) stats.byValidation[row.validation_status as keyof typeof stats.byValidation]++;
      if (row.is_duplicate_contact) stats.duplicateContacts++;
    });
    return stats;
  }});
}
