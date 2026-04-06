import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeCompanyName, calculateSimilarity } from '@/lib/companyMatching';

// ============================================================
// BATCH HOOKS
// ============================================================

export function useOppImportBatches() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['opp-import-batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_import_batches')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useOppImportBatch(batchId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['opp-import-batch', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_import_batches')
        .select('*')
        .eq('id', batchId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOppImportBatch() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name?: string; file_name?: string; total_rows?: number }) => {
      const { data, error } = await supabase
        .from('opportunity_import_batches')
        .insert({ ...input, created_by: user?.id!, status: 'pending' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['opp-import-batches'] }),
  });
}

// ============================================================
// STAGING HOOKS
// ============================================================

export function useOppStagingRows(batchId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['opp-staging-rows', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_import_staging')
        .select('*, matched_client:clients!opportunity_import_staging_matched_client_id_fkey(id, name), matched_dataset:datasets!opportunity_import_staging_matched_dataset_id_fkey(id, name)')
        .eq('batch_id', batchId!)
        .order('row_number');
      if (error) throw error;
      return data;
    },
  });
}

export function useInsertOppStagingRows() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: any[]) => {
      const { data, error } = await supabase
        .from('opportunity_import_staging')
        .insert(rows)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.[0]) qc.invalidateQueries({ queryKey: ['opp-staging-rows', data[0].batch_id] });
    },
  });
}

export function useUpdateOppStagingRow() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from('opportunity_import_staging')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['opp-staging-rows', data.batch_id] });
    },
  });
}

// ============================================================
// STAGE MAPPING
// ============================================================

const STAGE_MAP: Record<string, string> = {
  'lead': 'Lead',
  'initial discussion': 'Initial Discussion',
  'demo scheduled': 'Demo Scheduled',
  'demo': 'Demo Scheduled',
  'trial': 'Trial',
  'test': 'Trial',
  'testing': 'Trial',
  'evaluation': 'Evaluation',
  'eval': 'Evaluation',
  'commercial discussion': 'Commercial Discussion',
  'negotiation': 'Commercial Discussion',
  'contract sent': 'Contract Sent',
  'contract': 'Contract Sent',
  'closed won': 'Closed Won',
  'closed': 'Closed Won',
  'won': 'Closed Won',
  'closed lost': 'Closed Lost',
  'lost': 'Closed Lost',
  'churned': 'Closed Lost',
  'prospect': 'Lead',
  'prospecting': 'Lead',
  'inactive': 'Inactive',
  'dormant': 'Inactive',
  'cold': 'Inactive',
  'on hold': 'Inactive',
};

export function normalizeStage(raw: string | null | undefined): { stage: string; confidence: 'exact' | 'mapped' | 'ambiguous' } {
  if (!raw) return { stage: 'Lead', confidence: 'ambiguous' };
  const key = raw.trim().toLowerCase();
  
  // Direct match
  if (STAGE_MAP[key]) {
    // "closed" is ambiguous (won or lost?)
    if (key === 'closed') return { stage: STAGE_MAP[key], confidence: 'ambiguous' };
    return { stage: STAGE_MAP[key], confidence: key === STAGE_MAP[key].toLowerCase() ? 'exact' : 'mapped' };
  }
  
  // Fuzzy match
  for (const [mapKey, mapVal] of Object.entries(STAGE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) {
      return { stage: mapVal, confidence: 'mapped' };
    }
  }
  
  return { stage: 'Lead', confidence: 'ambiguous' };
}

// ============================================================
// MATCHING ENGINE
// ============================================================

export function useMatchOpportunities() {
  const supabase = useSupabase();
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (batchId: string) => {
      // 1. Get staging rows
      const { data: rows, error: rowsErr } = await supabase
        .from('opportunity_import_staging')
        .select('*')
        .eq('batch_id', batchId);
      if (rowsErr) throw rowsErr;

      // 2. Get reference data
      const [clientsRes, datasetsRes, profilesRes, aliasesRes, datasetAliasesRes] = await Promise.all([
        supabase.from('clients').select('id, name, normalized_name, primary_domain'),
        supabase.from('datasets').select('id, name'),
        supabase.from('profiles').select('user_id, full_name, email').eq('is_active', true),
        supabase.from('client_aliases').select('client_id, alias_name, normalized_alias'),
        supabase.from('dataset_aliases').select('dataset_id, alias_name, normalized_alias'),
      ]);

      const clients = clientsRes.data || [];
      const datasets = datasetsRes.data || [];
      const profiles = profilesRes.data || [];
      const aliases = aliasesRes.data || [];
      const datasetAliases = datasetAliasesRes.data || [];

      // Build lookup maps
      const clientsByNorm = new Map<string, typeof clients[0]>();
      clients.forEach(c => { if (c.normalized_name) clientsByNorm.set(c.normalized_name, c); });
      aliases.forEach(a => {
        const c = clients.find(cl => cl.id === a.client_id);
        if (c && a.normalized_alias) clientsByNorm.set(a.normalized_alias, c);
      });

      const datasetsByNorm = new Map<string, typeof datasets[0]>();
      datasets.forEach(d => datasetsByNorm.set(normalizeCompanyName(d.name), d));
      datasetAliases.forEach(a => {
        const d = datasets.find(ds => ds.id === a.dataset_id);
        if (d && a.normalized_alias) datasetsByNorm.set(a.normalized_alias, d);
      });

      const profilesByNorm = new Map<string, typeof profiles[0]>();
      profiles.forEach(p => {
        if (p.full_name) profilesByNorm.set(p.full_name.toLowerCase().trim(), p);
      });

      // 3. Get existing opportunities for duplicate detection
      const { data: existingOpps } = await supabase
        .from('opportunities')
        .select('id, name, client_id, dataset_id, owner_id, expected_close, created_at');

      // 4. Process each row
      const updates: { id: string; updates: any }[] = [];

      for (const row of rows || []) {
        const errors: string[] = [];
        const warnings: string[] = [];

        // --- Client matching ---
        let matchedClientId: string | null = null;
        let clientConf = 'none';
        let clientMethod: string | null = null;
        const normalizedClient = normalizeCompanyName(row.raw_name); // "Name" column = company name

        const exactClient = clientsByNorm.get(normalizedClient);
        if (exactClient) {
          matchedClientId = exactClient.id;
          clientConf = 'exact';
          clientMethod = 'name_normalized';
        } else if (normalizedClient) {
          // fuzzy
          let bestScore = 0;
          let bestClient: typeof clients[0] | null = null;
          for (const c of clients) {
            if (!c.normalized_name) continue;
            const score = calculateSimilarity(normalizedClient, c.normalized_name);
            if (score > bestScore && score >= 0.6) {
              bestScore = score;
              bestClient = c;
            }
          }
          if (bestClient) {
            matchedClientId = bestClient.id;
            clientConf = bestScore >= 0.9 ? 'likely' : 'ambiguous';
            clientMethod = 'fuzzy';
          }
        }
        if (!matchedClientId) {
          clientConf = 'new';
          warnings.push('No matching client found');
        }

        // --- Dataset matching ---
        let matchedDatasetId: string | null = null;
        let datasetConf = 'none';
        const normalizedProduct = normalizeCompanyName(row.raw_product);
        if (normalizedProduct) {
          const exactDs = datasetsByNorm.get(normalizedProduct);
          if (exactDs) {
            matchedDatasetId = exactDs.id;
            datasetConf = 'exact';
          } else {
            let bestScore = 0;
            let bestDs: typeof datasets[0] | null = null;
            for (const d of datasets) {
              const score = calculateSimilarity(normalizedProduct, normalizeCompanyName(d.name));
              if (score > bestScore && score >= 0.6) {
                bestScore = score;
                bestDs = d;
              }
            }
            if (bestDs) {
              matchedDatasetId = bestDs.id;
              datasetConf = bestScore >= 0.9 ? 'likely' : 'ambiguous';
            } else {
              datasetConf = 'new';
              warnings.push('No matching dataset found');
            }
          }
        }

        // --- Owner matching ---
        let matchedOwnerId: string | null = null;
        let ownerConf = 'none';
        if (row.raw_owner) {
          const ownerKey = row.raw_owner.toLowerCase().trim();
          const exactProfile = profilesByNorm.get(ownerKey);
          if (exactProfile) {
            matchedOwnerId = exactProfile.user_id;
            ownerConf = 'exact';
          } else {
            // partial match
            let bestScore = 0;
            let bestProfile: typeof profiles[0] | null = null;
            for (const p of profiles) {
              if (!p.full_name) continue;
              const score = calculateSimilarity(ownerKey, p.full_name.toLowerCase());
              if (score > bestScore && score >= 0.6) {
                bestScore = score;
                bestProfile = p;
              }
            }
            if (bestProfile) {
              matchedOwnerId = bestProfile.user_id;
              ownerConf = bestScore >= 0.9 ? 'likely' : 'ambiguous';
            } else {
              ownerConf = 'new';
              warnings.push('No matching owner found');
            }
          }
        }

        // --- Contact matching (best effort by name within client) ---
        let matchedContactIds: string[] = [];
        let contactConf = 'none';
        if (row.raw_contacts && matchedClientId) {
          const contactNames = row.raw_contacts.split(/[,;]/).map((n: string) => n.trim()).filter(Boolean);
          const { data: clientContacts } = await supabase
            .from('contacts')
            .select('id, name')
            .eq('client_id', matchedClientId);
          
          for (const cName of contactNames) {
            const normName = cName.toLowerCase();
            const match = (clientContacts || []).find(c => 
              c.name.toLowerCase() === normName ||
              c.name.toLowerCase().includes(normName) ||
              normName.includes(c.name.toLowerCase())
            );
            if (match) {
              matchedContactIds.push(match.id);
              contactConf = 'likely';
            } else {
              contactConf = contactConf === 'likely' ? 'likely' : 'ambiguous';
              warnings.push(`Contact "${cName}" not found`);
            }
          }
        }

        // --- Stage normalization ---
        const stageResult = normalizeStage(row.raw_stage);
        if (stageResult.confidence === 'ambiguous') {
          warnings.push(`Stage "${row.raw_stage}" mapped ambiguously to "${stageResult.stage}"`);
        }

        // --- Value parsing ---
        const valMin = parseFloat(row.raw_deal_value_min) || 0;
        const valMax = parseFloat(row.raw_deal_value_max) || 0;
        const valEstimate = valMax > 0 ? Math.round((valMin + valMax) / 2) : valMin;

        // --- Date parsing ---
        const parseDate = (d: string | null) => {
          if (!d) return null;
          const parsed = new Date(d);
          return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
        };

        // --- Duplicate detection ---
        let dupStatus = 'no_duplicate';
        let dupOppId: string | null = null;
        if (matchedClientId && existingOpps) {
          for (const opp of existingOpps) {
            if (opp.client_id !== matchedClientId) continue;
            // Same client + same dataset
            if (matchedDatasetId && opp.dataset_id === matchedDatasetId) {
              dupStatus = 'likely_duplicate';
              dupOppId = opp.id;
              warnings.push('Possible duplicate: same client + dataset');
              break;
            }
            // Same name similarity
            if (row.raw_name && opp.name) {
              const nameSim = calculateSimilarity(
                normalizeCompanyName(row.raw_name),
                normalizeCompanyName(opp.name)
              );
              if (nameSim >= 0.9) {
                dupStatus = 'likely_duplicate';
                dupOppId = opp.id;
                warnings.push('Possible duplicate: similar opportunity name');
                break;
              }
            }
          }
        }

        // Validation
        if (!row.raw_name) errors.push('Missing opportunity/company name');

        updates.push({
          id: row.id,
          updates: {
            normalized_client_name: normalizedClient || null,
            normalized_product_name: normalizedProduct || null,
            normalized_owner_name: row.raw_owner?.toLowerCase().trim() || null,
            normalized_stage: stageResult.stage,
            parsed_value_min: valMin,
            parsed_value_max: valMax,
            parsed_value_estimate: valEstimate,
            parsed_deal_creation_date: parseDate(row.raw_deal_creation_date),
            parsed_expected_close_date: parseDate(row.raw_expected_close_date),
            parsed_renewal_due: parseDate(row.raw_renewal_due),
            matched_client_id: matchedClientId,
            matched_dataset_id: matchedDatasetId,
            matched_owner_id: matchedOwnerId,
            matched_contact_ids: matchedContactIds,
            client_match_confidence: clientConf,
            client_match_method: clientMethod,
            dataset_match_confidence: datasetConf,
            owner_match_confidence: ownerConf,
            contact_match_confidence: contactConf,
            duplicate_status: dupStatus,
            duplicate_opportunity_id: dupOppId,
            validation_status: errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid',
            validation_errors: errors.length > 0 ? errors : null,
            validation_warnings: warnings.length > 0 ? warnings : null,
          },
        });
      }

      // Batch update
      for (const { id, updates: u } of updates) {
        await supabase.from('opportunity_import_staging').update(u).eq('id', id);
      }

      await supabase
        .from('opportunity_import_batches')
        .update({ status: 'review', processed_rows: updates.length })
        .eq('id', batchId);

      return { processed: updates.length };
    },
    onSuccess: (_, batchId) => {
      qc.invalidateQueries({ queryKey: ['opp-staging-rows', batchId] });
      qc.invalidateQueries({ queryKey: ['opp-import-batch', batchId] });
    },
  });
}

// ============================================================
// RESOLVE HOOKS
// ============================================================

export function useResolveOppRow() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      stagingRowId,
      clientId,
      datasetId,
      ownerId,
      stage,
      createNewClient,
      newClientName,
      createNewDataset,
      newDatasetName,
    }: {
      stagingRowId: string;
      clientId?: string;
      datasetId?: string | null;
      ownerId?: string | null;
      stage?: string;
      createNewClient?: boolean;
      newClientName?: string;
      createNewDataset?: boolean;
      newDatasetName?: string;
    }) => {
      let resolvedClientId = clientId;
      let resolvedDatasetId = datasetId;

      // Create new client if needed
      if (createNewClient && newClientName) {
        const normalized = normalizeCompanyName(newClientName);
        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('normalized_name', normalized)
          .maybeSingle();

        if (existing) {
          resolvedClientId = existing.id;
        } else {
          const { data: newClient, error } = await supabase
            .from('clients')
            .insert({
              name: newClientName,
              created_by: user?.id,
              owner_id: user?.id,
              import_source: 'opportunity_import',
            })
            .select()
            .single();
          if (error) throw error;
          resolvedClientId = newClient.id;
        }
      }

      // Create new dataset if needed
      if (createNewDataset && newDatasetName) {
        const { data: newDs, error } = await supabase
          .from('datasets')
          .insert({ name: newDatasetName })
          .select()
          .single();
        if (error) throw error;
        resolvedDatasetId = newDs.id;
      }

      const updatePayload: any = {
        resolved_client_id: resolvedClientId,
        resolved_dataset_id: resolvedDatasetId ?? undefined,
        resolved_owner_id: ownerId ?? undefined,
        resolution_status: 'resolved',
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      };
      if (stage) updatePayload.normalized_stage = stage;

      // Remove undefined keys
      Object.keys(updatePayload).forEach(k => {
        if (updatePayload[k] === undefined) delete updatePayload[k];
      });

      const { data, error } = await supabase
        .from('opportunity_import_staging')
        .update(updatePayload)
        .eq('id', stagingRowId)
        .select('*, batch_id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['opp-staging-rows', data.batch_id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}

// ============================================================
// FINAL IMPORT
// ============================================================

export function useImportOpportunities() {
  const supabase = useSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data: rows, error: rowsErr } = await supabase
        .from('opportunity_import_staging')
        .select('*')
        .eq('batch_id', batchId)
        .eq('resolution_status', 'resolved')
        .not('resolved_client_id', 'is', null);
      if (rowsErr) throw rowsErr;

      let imported = 0;
      let skipped = 0;

      for (const row of rows || []) {
        // Skip duplicates user chose to skip
        if (row.duplicate_status === 'skip') {
          skipped++;
          continue;
        }

        const value = row.parsed_value_estimate || 0;
        const stage = row.normalized_stage || 'Lead';
        const oppName = row.raw_name || 'Imported Opportunity';

        const { data: opp, error: oppErr } = await supabase
          .from('opportunities')
          .insert({
            name: oppName,
            client_id: row.resolved_client_id,
            dataset_id: row.resolved_dataset_id || null,
            owner_id: row.resolved_owner_id || user?.id,
            stage,
            value,
            value_min: row.parsed_value_min || 0,
            value_max: row.parsed_value_max || 0,
            probability: stage === 'Closed Won' ? 100 : stage === 'Closed Lost' ? 0 : 50,
            expected_close: row.parsed_expected_close_date || null,
            source: row.raw_source || null,
            deal_type: row.raw_deal_type || null,
            source_created_date: row.parsed_deal_creation_date || null,
            notes: row.raw_comment || '',
            contact_ids: row.matched_contact_ids || [],
            import_batch_id: batchId,
            imported_at: new Date().toISOString(),
            created_by: user?.id,
          })
          .select()
          .single();

        if (oppErr) {
          console.error('Failed to import opportunity:', oppErr);
          continue;
        }

        // Create initial stage history entry
        await supabase.from('opportunity_stage_history').insert({
          opportunity_id: opp.id,
          from_stage: null,
          to_stage: stage,
          changed_by: user?.id,
        });

        // Update staging row
        await supabase
          .from('opportunity_import_staging')
          .update({
            resolution_status: 'imported',
            imported_opportunity_id: opp.id,
            imported_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        imported++;
      }

      // Update batch
      await supabase
        .from('opportunity_import_batches')
        .update({
          status: 'completed',
          imported_rows: imported,
          skipped_rows: skipped,
          completed_at: new Date().toISOString(),
        })
        .eq('id', batchId);

      return { imported, skipped };
    },
    onSuccess: (_, batchId) => {
      qc.invalidateQueries({ queryKey: ['opp-staging-rows', batchId] });
      qc.invalidateQueries({ queryKey: ['opp-import-batch', batchId] });
      qc.invalidateQueries({ queryKey: ['opportunities'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// ============================================================
// STATS
// ============================================================

export function useOppStagingStats(batchId: string | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['opp-staging-stats', batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('opportunity_import_staging')
        .select('client_match_confidence, dataset_match_confidence, owner_match_confidence, duplicate_status, validation_status, resolution_status, normalized_stage')
        .eq('batch_id', batchId!);
      if (error) throw error;

      const total = rows?.length || 0;
      const clientExact = rows?.filter(r => r.client_match_confidence === 'exact' || r.client_match_confidence === 'likely').length || 0;
      const clientNew = rows?.filter(r => r.client_match_confidence === 'new' || r.client_match_confidence === 'none').length || 0;
      const clientAmbiguous = rows?.filter(r => r.client_match_confidence === 'ambiguous').length || 0;
      const datasetMatched = rows?.filter(r => r.dataset_match_confidence === 'exact' || r.dataset_match_confidence === 'likely').length || 0;
      const ownerMatched = rows?.filter(r => r.owner_match_confidence === 'exact' || r.owner_match_confidence === 'likely').length || 0;
      const duplicates = rows?.filter(r => r.duplicate_status === 'likely_duplicate').length || 0;
      const resolved = rows?.filter(r => r.resolution_status === 'resolved').length || 0;
      const imported = rows?.filter(r => r.resolution_status === 'imported').length || 0;
      const invalid = rows?.filter(r => r.validation_status === 'invalid').length || 0;
      const pending = rows?.filter(r => r.resolution_status === 'pending').length || 0;

      // Stage breakdown
      const stageBreakdown: Record<string, number> = {};
      rows?.forEach(r => {
        if (r.normalized_stage) {
          stageBreakdown[r.normalized_stage] = (stageBreakdown[r.normalized_stage] || 0) + 1;
        }
      });

      return {
        total,
        clientExact,
        clientNew,
        clientAmbiguous,
        datasetMatched,
        ownerMatched,
        duplicates,
        resolved,
        imported,
        invalid,
        pending,
        stageBreakdown,
      };
    },
  });
}
