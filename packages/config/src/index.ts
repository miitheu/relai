// ============================================================================
// @relai/config — Tenant Configuration
// ============================================================================

export interface OrgSettings {
  pipelineStages?: string[];
  currency?: string;
  customStatuses?: Record<string, string[]>;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
  };
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: OrgSettings;
  created_at: string;
  updated_at: string;
}

export interface TenantConfig {
  org: Organization | null;
  loading: boolean;
}

export { TenantConfigProvider, useTenantConfig } from './react/provider';
