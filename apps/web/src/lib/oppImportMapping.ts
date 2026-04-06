/**
 * Column mapping utilities for opportunity import
 */

export interface OppColumnMapping {
  name: number | null;
  stage: number | null;
  clientType: number | null;
  product: number | null;
  owner: number | null;
  dealValueMin: number | null;
  dealValueMax: number | null;
  source: number | null;
  contacts: number | null;
  dealCreationDate: number | null;
  expectedCloseDate: number | null;
  renewalDue: number | null;
  comment: number | null;
  dealType: number | null;
}

export function autoMapOppColumns(headers: string[]): OppColumnMapping {
  const lower = headers.map(h => h.toLowerCase().trim());

  const find = (patterns: string[]): number | null => {
    for (const p of patterns) {
      const idx = lower.findIndex(h => h.includes(p));
      if (idx !== -1) return idx;
    }
    return null;
  };

  return {
    name: find(['name', 'company', 'client', 'account']),
    stage: find(['stage', 'status', 'phase']),
    clientType: find(['client type', 'company type', 'organization type', 'org type']),
    product: find(['product', 'dataset', 'data feed']),
    owner: find(['owner', 'rep', 'assigned', 'sales rep']),
    dealValueMin: find(['deal value min', 'value min', 'min value', 'min']),
    dealValueMax: find(['deal value max', 'value max', 'max value', 'max']),
    source: find(['source', 'origin', 'channel', 'lead source']),
    contacts: find(['contact', 'people', 'person']),
    dealCreationDate: find(['deal creation', 'creation date', 'created', 'create date']),
    expectedCloseDate: find(['expected close', 'close date', 'expected']),
    renewalDue: find(['renewal', 'renew']),
    comment: find(['comment', 'note', 'description']),
    dealType: find(['deal type', 'type', 'licensing']),
  };
}

export const OPP_FIELD_LABELS: Record<keyof OppColumnMapping, string> = {
  name: 'Company / Name',
  stage: 'Stage',
  clientType: 'Client Type',
  product: 'Product / Dataset',
  owner: 'Owner',
  dealValueMin: 'Deal Value Min',
  dealValueMax: 'Deal Value Max',
  source: 'Source',
  contacts: 'Contacts',
  dealCreationDate: 'Deal Creation Date',
  expectedCloseDate: 'Expected Close Date',
  renewalDue: 'Renewal Due',
  comment: 'Comment',
  dealType: 'Deal Type',
};
