import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  normalizeCompanyName,
  extractDomain,
  calculateSimilarity,
  isValidEmail,
  type CompanyMatch,
  type MatchConfidence,
} from '@/lib/companyMatching';

// ============================================================
// IMPORT BATCH HOOKS
// ============================================================

export function useImportBatches() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['import-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_import_batches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useImportBatch(batchId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['import-batch', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_import_batches')
        .select('*')
        .eq('id', batchId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateImportBatch() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (input: { name?: string; file_name?: string; total_rows?: number }) => {
      const { data, error } = await supabase
        .from('contact_import_batches')
        .insert({ ...input, created_by: user?.id, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['import-batches'] }),
  });
}

export function useUpdateImportBatch() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('contact_import_batches')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['import-batches'] });
      qc.invalidateQueries({ queryKey: ['import-batch', vars.id] });
    },
  });
}

// ============================================================
// STAGING ROW HOOKS
// ============================================================

export function useStagingRows(batchId: string | undefined, filters?: { resolution_status?: string }) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['staging-rows', batchId, filters],
    enabled: !!batchId,
    queryFn: async () => {
      let query = supabase
        .from('contact_import_staging')
        .select('*, matched_client:clients!contact_import_staging_matched_client_id_fkey(id, name), resolved_client:clients!contact_import_staging_resolved_client_id_fkey(id, name)')
        .eq('batch_id', batchId!)
        .order('row_number');
      
      if (filters?.resolution_status) {
        query = query.eq('resolution_status', filters.resolution_status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertStagingRows() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async (rows: any[]) => {
      const { data, error } = await supabase
        .from('contact_import_staging')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data && data.length > 0) {
        qc.invalidateQueries({ queryKey: ['staging-rows', data[0].batch_id] });
      }
    },
  });
}

export function useUpdateStagingRow() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; batch_id?: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('contact_import_staging')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staging-rows', data.batch_id] });
    },
  });
}

export function useBulkUpdateStagingRows() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ ids, updates, batchId }: { ids: string[]; updates: any; batchId: string }) => {
      const { error } = await supabase
        .from('contact_import_staging')
        .update(updates)
        .in('id', ids);
      if (error) throw error;
      return { ids, batchId };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staging-rows', data.batchId] });
    },
  });
}

// ============================================================
// COMPANY MATCHING HOOKS
// ============================================================

export function useMatchCompanies() {
  const supabase = useSupabase();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (batchId: string) => {
      // 1. Get all staging rows for batch
      const { data: stagingRows, error: stagingError } = await supabase
        .from('contact_import_staging')
        .select('*')
        .eq('batch_id', batchId);
      if (stagingError) throw stagingError;
      
      // 2. Get all existing clients
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name, normalized_name, primary_domain');
      if (clientsError) throw clientsError;
      
      // 3. Get all client aliases
      const { data: aliases, error: aliasError } = await supabase
        .from('client_aliases')
        .select('client_id, alias_name, normalized_alias');
      if (aliasError) throw aliasError;
      
      // Build lookup maps
      const clientsByNormalized = new Map<string, typeof clients[0]>();
      const clientsByDomain = new Map<string, typeof clients[0]>();
      
      clients?.forEach(c => {
        if (c.normalized_name) clientsByNormalized.set(c.normalized_name, c);
        if (c.primary_domain) clientsByDomain.set(c.primary_domain, c);
      });
      
      aliases?.forEach(a => {
        const client = clients?.find(c => c.id === a.client_id);
        if (client && a.normalized_alias) {
          clientsByNormalized.set(a.normalized_alias, client);
        }
      });
      
      // 4. Match each staging row
      const updates: { id: string; updates: any }[] = [];
      
      for (const row of stagingRows || []) {
        const normalized = normalizeCompanyName(row.raw_company);
        const domain = extractDomain(row.raw_email);
        
        let matchedClientId: string | null = null;
        let confidence: MatchConfidence = 'new';
        let method: string | null = null;
        const suggestedIds: string[] = [];
        
        // Try exact normalized match
        const exactMatch = clientsByNormalized.get(normalized);
        if (exactMatch) {
          matchedClientId = exactMatch.id;
          confidence = 'exact';
          method = 'name_normalized';
        }
        
        // Try domain match
        if (!matchedClientId && domain) {
          const domainMatch = clientsByDomain.get(domain);
          if (domainMatch) {
            matchedClientId = domainMatch.id;
            confidence = 'likely';
            method = 'domain';
          }
        }
        
        // Try fuzzy match
        if (!matchedClientId && normalized) {
          const fuzzyMatches: CompanyMatch[] = [];
          
          clients?.forEach(c => {
            if (c.normalized_name) {
              const score = calculateSimilarity(normalized, c.normalized_name);
              if (score >= 0.6) {
                fuzzyMatches.push({
                  clientId: c.id,
                  clientName: c.name,
                  confidence: score >= 0.9 ? 'likely' : score >= 0.7 ? 'ambiguous' : 'new',
                  method: 'fuzzy',
                  score,
                });
              }
            }
          });
          
          fuzzyMatches.sort((a, b) => b.score - a.score);
          
          if (fuzzyMatches.length > 0) {
            const top = fuzzyMatches[0];
            matchedClientId = top.clientId;
            confidence = top.confidence;
            method = 'fuzzy';
            
            // Add top 3 as suggestions for ambiguous matches
            if (confidence === 'ambiguous') {
              suggestedIds.push(...fuzzyMatches.slice(0, 3).map(m => m.clientId));
            }
          }
        }
        
        // Validate email
        const emailValid = isValidEmail(row.raw_email);
        const validationErrors: string[] = [];
        const validationWarnings: string[] = [];
        
        if (!row.raw_name) validationErrors.push('Missing contact name');
        if (!row.raw_company) validationWarnings.push('Missing company name');
        if (row.raw_email && !emailValid) validationErrors.push('Invalid email format');
        
        updates.push({
          id: row.id,
          updates: {
            normalized_company_name: normalized || null,
            normalized_email: row.raw_email?.trim().toLowerCase() || null,
            email_domain: domain,
            matched_client_id: matchedClientId,
            company_match_confidence: matchedClientId ? confidence : 'new',
            company_match_method: method,
            suggested_client_ids: suggestedIds.length > 0 ? suggestedIds : null,
            validation_status: validationErrors.length > 0 ? 'invalid' : validationWarnings.length > 0 ? 'warning' : 'valid',
            validation_errors: validationErrors.length > 0 ? validationErrors : null,
            validation_warnings: validationWarnings.length > 0 ? validationWarnings : null,
          },
        });
      }
      
      // 5. Batch update all rows
      for (const { id, updates: rowUpdates } of updates) {
        await supabase
          .from('contact_import_staging')
          .update(rowUpdates)
          .eq('id', id);
      }
      
      // 6. Update batch status
      await supabase
        .from('contact_import_batches')
        .update({ status: 'review', processed_rows: updates.length })
        .eq('id', batchId);
      
      return { processed: updates.length };
    },
  });
}

// ============================================================
// RESOLVE & IMPORT HOOKS
// ============================================================

export function useResolveCompany() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      stagingRowId, 
      clientId, 
      createNew,
      newClientData,
    }: { 
      stagingRowId: string; 
      clientId?: string; 
      createNew?: boolean;
      newClientData?: { name: string; client_type?: string };
    }) => {
      let resolvedClientId = clientId;
      
      // Create new client if requested
      if (createNew && newClientData) {
        const normalized = normalizeCompanyName(newClientData.name);
        
        // Check if a client with this normalized name already exists
        let existingClient = null;
        if (normalized) {
          const { data } = await supabase
            .from('clients')
            .select('id')
            .eq('normalized_name', normalized)
            .limit(1)
            .maybeSingle();
          existingClient = data;
        }
        
        if (existingClient) {
          resolvedClientId = existingClient.id;
        } else {
          const { data: newClient, error: createError } = await supabase
            .from('clients')
            .insert({
              name: newClientData.name,
              client_type: newClientData.client_type || 'Other',
              created_by: user?.id,
              owner_id: user?.id,
              import_source: 'contact_import',
            })
            .select()
            .single();
          if (createError) throw createError;
          resolvedClientId = newClient.id;
          
          // Add normalized alias
          if (normalized) {
            await supabase.from('client_aliases').insert({
              client_id: newClient.id,
              alias_name: newClientData.name,
              normalized_alias: normalized,
              alias_type: 'alternate_name',
              source: 'import',
              created_by: user?.id,
            });
          }
        }
      }
      
      // Update staging row
      const { data, error } = await supabase
        .from('contact_import_staging')
        .update({
          resolved_client_id: resolvedClientId,
          resolution_status: 'resolved',
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', stagingRowId)
        .select('*, batch_id')
        .single();
      if (error) throw error;
      
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['staging-rows', data.batch_id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useImportContacts() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (batchId: string) => {
      // Get all resolved staging rows
      const { data: rows, error: rowsError } = await supabase
        .from('contact_import_staging')
        .select('*')
        .eq('batch_id', batchId)
        .eq('resolution_status', 'resolved')
        .not('resolved_client_id', 'is', null);
      if (rowsError) throw rowsError;
      
      let imported = 0;
      let skipped = 0;
      
      for (const row of rows || []) {
        // Check for duplicate by email
        if (row.normalized_email) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', row.normalized_email)
            .eq('client_id', row.resolved_client_id)
            .maybeSingle();
          
          if (existing) {
            await supabase
              .from('contact_import_staging')
              .update({
                resolution_status: 'skipped',
                is_duplicate_contact: true,
                matched_contact_id: existing.id,
              })
              .eq('id', row.id);
            skipped++;
            continue;
          }
        }
        
        // Insert contact
        const { data: contact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            client_id: row.resolved_client_id,
            name: row.raw_name || 'Unknown',
            title: row.raw_contact_title || null,
            email: row.normalized_email || null,
            phone: row.raw_phone || null,
            source: row.raw_source || null,
            notes: row.raw_deals ? `Deals: ${row.raw_deals}` : null,
            created_by: user?.id,
            import_batch_id: batchId,
            imported_at: new Date().toISOString(),
            raw_import_data: {
              raw_name: row.raw_name,
              raw_company: row.raw_company,
              raw_organization_type: row.raw_organization_type,
              raw_deals: row.raw_deals,
              raw_contact_title: row.raw_contact_title,
              raw_phone: row.raw_phone,
              raw_email: row.raw_email,
              raw_people: row.raw_people,
              raw_source: row.raw_source,
            },
          })
          .select()
          .single();
        
        if (contactError) {
          console.error('Failed to import contact:', contactError);
          continue;
        }
        
        // Update staging row
        await supabase
          .from('contact_import_staging')
          .update({
            resolution_status: 'imported',
            imported_contact_id: contact.id,
            imported_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        
        imported++;
      }
      
      // Update batch
      await supabase
        .from('contact_import_batches')
        .update({
          status: 'completed',
          imported_rows: imported,
          skipped_rows: skipped,
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);
      
      return { imported, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['import-batches'] });
    },
  });
}

// ============================================================
// STATS / SUMMARY HOOKS
// ============================================================

export function useStagingStats(batchId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['staging-stats', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_import_staging')
        .select('company_match_confidence, resolution_status, validation_status, is_duplicate_contact')
        .eq('batch_id', batchId!);
      if (error) throw error;
      
      const stats = {
        total: data.length,
        byConfidence: {
          exact: 0,
          likely: 0,
          ambiguous: 0,
          new: 0,
        },
        byResolution: {
          pending: 0,
          resolved: 0,
          skipped: 0,
          imported: 0,
        },
        byValidation: {
          valid: 0,
          invalid: 0,
          warning: 0,
          pending: 0,
        },
        duplicateContacts: 0,
      };
      
      data.forEach(row => {
        if (row.company_match_confidence && stats.byConfidence[row.company_match_confidence as keyof typeof stats.byConfidence] !== undefined) {
          stats.byConfidence[row.company_match_confidence as keyof typeof stats.byConfidence]++;
        }
        if (row.resolution_status && stats.byResolution[row.resolution_status as keyof typeof stats.byResolution] !== undefined) {
          stats.byResolution[row.resolution_status as keyof typeof stats.byResolution]++;
        }
        if (row.validation_status && stats.byValidation[row.validation_status as keyof typeof stats.byValidation] !== undefined) {
          stats.byValidation[row.validation_status as keyof typeof stats.byValidation]++;
        }
        if (row.is_duplicate_contact) stats.duplicateContacts++;
      });
      
      return stats;
    },
  });
}
