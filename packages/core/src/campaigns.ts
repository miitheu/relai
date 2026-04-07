export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';
export type CampaignTargetStatus = 'pending' | 'in_progress' | 'completed' | 'no_engagement' | 'not_started' | 'outreach_ready';

export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];
export const CAMPAIGN_TARGET_STATUSES: CampaignTargetStatus[] = ['pending', 'in_progress', 'completed', 'no_engagement', 'not_started', 'outreach_ready'];
