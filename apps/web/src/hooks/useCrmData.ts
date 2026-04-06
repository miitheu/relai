// Barrel re-export — all consumers keep importing from '@/hooks/useCrmData'
export { useClients, useClientsPaginated, useClient, useCreateClient, useUpdateClient } from './useClients';
export { useContacts, useCreateContact } from './useContacts';
export { useDatasets, useCreateDataset } from './useDatasets';
export { useOpportunities, useCreateOpportunity, useUpdateOpportunity, useDeleteOpportunity } from './useOpportunities';
export { useDeliveries, useAllDeliveries, useCreateDelivery, useUpdateDelivery } from './useDeliveries';
export { useRenewals, useCreateRenewal, useUpdateRenewal } from './useRenewals';
export { useNotes, useCreateNote } from './useNotes';
export { useActivities } from './useActivities';
export { useProfiles } from './useProfiles';
export { useContracts } from './useContracts';
export { useResearchSignals, useCreateSignal } from './useResearchSignals';
export { useWorkflowRules, useCreateWorkflowRule, useUpdateWorkflowRule, useDeleteWorkflowRule, useWorkflowActions, useCreateWorkflowAction, useWorkflowExecutionLog } from './useWorkflows';
export { useApprovalProcesses, useApprovalRequests, useMyPendingApprovals, useCreateApprovalRequest, useApproveStep, useRejectStep } from './useApprovals';
export { useEmailTemplates, useEmailTemplate, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate } from './useEmailTemplates';
export { useCustomFieldDefinitions, useCustomFields, useSaveCustomField, useCreateCustomFieldDefinition } from './useCustomFields';
export { useCustomerHealth, useCustomerHealthList } from './useCustomerHealth';
export { useAIUsageSummary, useAIUsageLog } from './useAIUsage';
export { useIntegrations, useCreateIntegration, useUpdateIntegration, useSyncLog } from './useIntegrations';
export { useTerritories, useTerritory, useCreateTerritory, useUpdateTerritory, useDeleteTerritory, useTerritoryAssignments, useAssignTerritory, useUnassignTerritory } from './useTerritories';
export { useQuotas, useQuota, useCreateQuota, useUpdateQuota, useDeleteQuota, useQuotaAttainment } from './useQuotas';

// Phase 4: AI hooks
export { useSemanticSearch } from './useSemanticSearch';

export { useMeetingPrep } from './useMeetingPrep';
export { useChurnRisk } from './useChurnRisk';
export { useAutoEnrich } from './useAutoEnrich';
export { useStreamingAI } from './useStreamingAI';
