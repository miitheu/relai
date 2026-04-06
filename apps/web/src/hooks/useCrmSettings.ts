import { useQuery } from '@tanstack/react-query';
import { useSupabase } from '@/hooks/useSupabase';
import { stageOrder } from '@/data/mockData';

interface CrmSettingsMap {
  [key: string]: any[];
}

export function useCrmSettings() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ['crm-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_settings' as any)
        .select('key, value')
        .eq('category', 'config');
      if (error) throw error;
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
