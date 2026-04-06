import { differenceInDays, isAfter, isBefore, parseISO } from 'date-fns';

export type TrialStatus = 'pending' | 'active' | 'ending_soon' | 'expired' | 'converted' | 'cancelled' | 'completed';

export function getTrialStatus(
  status: string | null,
  trialStartDate: string | null,
  trialEndDate: string | null,
  linkedOpportunityStage?: string
): TrialStatus {
  if (status === 'converted' || linkedOpportunityStage === 'Closed Won') return 'converted';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  
  if (!trialStartDate || !trialEndDate) return 'pending';
  
  const start = parseISO(trialStartDate);
  const end = parseISO(trialEndDate);
  const now = new Date();
  
  if (isBefore(now, start)) return 'pending';
  if (isAfter(now, end)) return 'expired';
  
  const daysLeft = differenceInDays(end, now);
  if (daysLeft <= 7) return 'ending_soon';
  
  return 'active';
}

export function getDaysRemaining(trialEndDate: string | null): number | null {
  if (!trialEndDate) return null;
  const end = parseISO(trialEndDate);
  const now = new Date();
  const diff = differenceInDays(end, now);
  return diff >= 0 ? diff : 0;
}
