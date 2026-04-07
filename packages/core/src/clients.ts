export type ClientType = 'Hedge Fund' | 'Bank' | 'Asset Manager' | 'Corporate' | 'Vendor' | 'Other';
export type ClientTier = 'Tier 1' | 'Tier 2' | 'Tier 3';
export type RelationshipStatus = 'Prospect' | 'Active Client' | 'Dormant' | 'Strategic';

export const CLIENT_TYPES: ClientType[] = ['Hedge Fund', 'Bank', 'Asset Manager', 'Corporate', 'Vendor', 'Other'];
export const CLIENT_TIERS: ClientTier[] = ['Tier 1', 'Tier 2', 'Tier 3'];
export const RELATIONSHIP_STATUSES: RelationshipStatus[] = ['Prospect', 'Active Client', 'Dormant', 'Strategic'];
