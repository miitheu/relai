import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomFieldDefinition {
  id: string;
  entity_type: string;
  field_name: string;
  field_label: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomFieldValue {
  id: string;
  definition_id: string;
  entity_type: string;
  entity_id: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomFieldDefinitions(entityType?: string) {
  return useQuery({
    queryKey: ['custom-field-definitions', entityType || 'all'],
    queryFn: async () => {
      let q = supabase
        .from('custom_field_definitions' as any)
        .select('*')
        .order('display_order')
        .limit(200);
      if (entityType) q = q.eq('entity_type', entityType);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as CustomFieldDefinition[];
    },
  });
}

export function useCustomFields(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_field_values' as any)
        .select('*, custom_field_definitions(*)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .limit(200);
      if (error) throw error;
      return data as unknown as (CustomFieldValue & { custom_field_definitions: CustomFieldDefinition })[];
    },
  });
}

export function useSaveCustomField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      definition_id: string;
      entity_type: string;
      entity_id: string;
      value: string | null;
    }) => {
      const { data, error } = await supabase
        .from('custom_field_values' as any)
        .upsert(input as any, { onConflict: 'definition_id,entity_type,entity_id' })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomFieldValue;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['custom-field-values', vars.entity_type, vars.entity_id] });
    },
  });
}

export function useCreateCustomFieldDefinition() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      entity_type: string;
      field_name: string;
      field_label: string;
      field_type: string;
      options?: string[];
      is_required?: boolean;
      display_order?: number;
    }) => {
      const { data, error } = await supabase
        .from('custom_field_definitions' as any)
        .insert({ ...input, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CustomFieldDefinition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-field-definitions'] }),
  });
}
