import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { useAuth } from '@/contexts/AuthContext';
import type { Filter } from '@relai/db';

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
  const db = useDb();
  return useQuery({
    queryKey: ['custom-field-definitions', entityType || 'all'],
    queryFn: async () => {
      const filters: Filter[] = [];
      if (entityType) filters.push({ column: 'entity_type', operator: 'eq', value: entityType });
      const { data, error } = await db.query('custom_field_definitions', { filters, order: [{ column: 'display_order' }], limit: 200 });
      if (error) throw new Error(error.message);
      return data as unknown as CustomFieldDefinition[];
    },
  });
}

export function useCustomFields(entityType: string, entityId: string | undefined) {
  const db = useDb();
  return useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await db.query('custom_field_values', {
        select: '*, custom_field_definitions(*)',
        filters: [
          { column: 'entity_type', operator: 'eq', value: entityType },
          { column: 'entity_id', operator: 'eq', value: entityId! },
        ],
        limit: 200,
      });
      if (error) throw new Error(error.message);
      return data as unknown as (CustomFieldValue & { custom_field_definitions: CustomFieldDefinition })[];
    },
  });
}

export function useSaveCustomField() {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { definition_id: string; entity_type: string; entity_id: string; value: string | null; }) => {
      const { data, error } = await db.upsert('custom_field_values', input, { onConflict: 'definition_id,entity_type,entity_id' });
      if (error) throw new Error(error.message);
      return data[0] as unknown as CustomFieldValue;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['custom-field-values', vars.entity_type, vars.entity_id] });
    },
  });
}

export function useCreateCustomFieldDefinition() {
  const db = useDb();
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { entity_type: string; field_name: string; field_label: string; field_type: string; options?: string[]; is_required?: boolean; display_order?: number; }) => {
      const { data, error } = await db.insert('custom_field_definitions', { ...input, created_by: user?.id });
      if (error) throw new Error(error.message);
      return data[0] as unknown as CustomFieldDefinition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-field-definitions'] }),
  });
}
