// Types and helpers only — no mock data in production
import { getCurrency, convertToActive } from '@/lib/currencyStore';

export type ClientType = 'Hedge Fund' | 'Bank' | 'Asset Manager' | 'Corporate' | 'Vendor' | 'Other';

export type RelationshipStatus = 'Prospect' | 'Active Client' | 'Dormant' | 'Strategic';
export type InfluenceLevel = 'Decision Maker' | 'Influencer' | 'Research Contact' | 'Procurement' | 'Unknown';
export type RelationshipStrength = 'Weak' | 'Medium' | 'Strong';
export type OpportunityStage = 'Lead' | 'Initial Discussion' | 'Demo Scheduled' | 'Trial' | 'Evaluation' | 'Commercial Discussion' | 'Contract Sent' | 'Closed Won' | 'Closed Lost' | 'Inactive';
export type SignalStrength = 'Low' | 'Medium' | 'High';

// Stages that belong in the Icebox (not active pipeline)
export const ICEBOX_STAGES = ['Inactive'] as const;
export type DeliveryType = 'Full dataset' | 'Trial' | 'Sample data' | 'API access';
export type DeliveryMethod = 'SFTP' | 'API' | 'Download';
export type ContractType = 'Annual' | 'Trial' | 'Custom';
export type ContractStatus = 'Active' | 'Expired' | 'Pending';
export type RenewalStatus = 'Upcoming' | 'Negotiation' | 'Renewed' | 'Lost';

// Helpers
export const formatCurrency = (usdValue: number) => {
  const value = convertToActive(usdValue);
  const symbol = getCurrency() === 'USD' ? '$' : '€';
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(0)}K`;
  if (value === 0) return `${symbol}0`;
  return `${symbol}${Math.round(value).toLocaleString()}`;
};

export const stageOrder: OpportunityStage[] = [
  'Lead', 'Initial Discussion', 'Demo Scheduled', 'Trial', 'Evaluation',
  'Commercial Discussion', 'Contract Sent', 'Closed Won', 'Closed Lost'
];

// Full stage list including Icebox stages — for stage selectors
export const ALL_STAGES: OpportunityStage[] = [
  ...stageOrder,
  'Inactive',
];

export const getStageColor = (stage: string): string => {
  const colors: Record<string, string> = {
    'Lead': 'bg-muted text-muted-foreground',
    'Initial Discussion': 'bg-info/10 text-info',
    'Demo Scheduled': 'bg-info/20 text-info',
    'Trial': 'bg-warning/10 text-warning',
    'Evaluation': 'bg-warning/20 text-warning',
    'Commercial Discussion': 'bg-primary/10 text-primary',
    'Contract Sent': 'bg-primary/20 text-primary',
    'Closed Won': 'bg-success/10 text-success',
    'Closed Lost': 'bg-destructive/10 text-destructive',
    'Inactive': 'bg-muted/50 text-muted-foreground',
  };
  return colors[stage] || 'bg-muted text-muted-foreground';
};
