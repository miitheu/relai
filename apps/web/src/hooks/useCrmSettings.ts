import { useQuery } from '@tanstack/react-query';
import { useDb } from '@relai/db/react';
import { stageOrder } from '@/data/mockData';

interface CrmSettingsMap {
  [key: string]: any[];
}

export function useCrmSettings() {
  const db = useDb();
  return useQuery({
    queryKey: ['crm-settings'],
    queryFn: async () => {
      const { data, error } = await db.query('crm_settings', { select: 'key, value', filters: [{ column: 'category', operator: 'eq', value: 'config' }] });
      if (error) throw new Error(error.message);
      const map: CrmSettingsMap = {};
      (data || []).forEach((row: any) => {
        map[row.key] = row.value;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Returns the configured pipeline stages, falling back to hardcoded defaults */
export function useStageConfig() {
  const { data: settings } = useCrmSettings();
  const stages: string[] = settings?.opportunity_stages?.length
    ? settings.opportunity_stages
    : [...stageOrder];
  return stages;
}
