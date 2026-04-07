export type OpportunityStage =
  | 'Lead'
  | 'Initial Discussion'
  | 'Demo Scheduled'
  | 'Trial'
  | 'Evaluation'
  | 'Commercial Discussion'
  | 'Contract Sent'
  | 'Closed Won'
  | 'Closed Lost'
  | 'Inactive';

export const PIPELINE_STAGES: OpportunityStage[] = [
  'Lead',
  'Initial Discussion',
  'Demo Scheduled',
  'Trial',
  'Evaluation',
  'Commercial Discussion',
  'Contract Sent',
  'Closed Won',
  'Closed Lost',
];

export const ALL_STAGES: OpportunityStage[] = [...PIPELINE_STAGES, 'Inactive'];

export const ICEBOX_STAGES: readonly OpportunityStage[] = ['Inactive'] as const;

export const STAGE_COLORS: Record<OpportunityStage, string> = {
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

export function getStageColor(stage: string): string {
  return STAGE_COLORS[stage as OpportunityStage] || 'bg-muted text-muted-foreground';
}
