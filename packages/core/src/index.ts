// ============================================================================
// @relai/core — Business Logic & Shared Constants
// ============================================================================

export {
  type ClientType,
  type ClientTier,
  type RelationshipStatus,
  CLIENT_TYPES,
  CLIENT_TIERS,
  RELATIONSHIP_STATUSES,
} from './clients';

export {
  type OpportunityStage,
  PIPELINE_STAGES,
  ALL_STAGES,
  ICEBOX_STAGES,
  STAGE_COLORS,
  getStageColor,
} from './pipeline';

export {
  type InfluenceLevel,
  type RelationshipStrength,
  INFLUENCE_LEVELS,
  RELATIONSHIP_STRENGTHS,
} from './contacts';

export {
  type CampaignStatus,
  type CampaignTargetStatus,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TARGET_STATUSES,
} from './campaigns';

export {
  type DeliveryType,
  type DeliveryMethod,
  type ContractType,
  type ContractStatus,
  type RenewalStatus,
  type SignalStrength,
  DELIVERY_TYPES,
  DELIVERY_METHODS,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  RENEWAL_STATUSES,
  SIGNAL_STRENGTHS,
} from './constants';

export {
  type AppRole,
  APP_ROLES,
} from './roles';
