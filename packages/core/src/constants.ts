export type DeliveryType = 'Full dataset' | 'Trial' | 'Sample data' | 'API access';
export type DeliveryMethod = 'SFTP' | 'API' | 'Download';
export type ContractType = 'Annual' | 'Trial' | 'Custom';
export type ContractStatus = 'Active' | 'Expired' | 'Pending';
export type RenewalStatus = 'Upcoming' | 'Negotiation' | 'Renewed' | 'Lost';
export type SignalStrength = 'Low' | 'Medium' | 'High';

export const DELIVERY_TYPES: DeliveryType[] = ['Full dataset', 'Trial', 'Sample data', 'API access'];
export const DELIVERY_METHODS: DeliveryMethod[] = ['SFTP', 'API', 'Download'];
export const CONTRACT_TYPES: ContractType[] = ['Annual', 'Trial', 'Custom'];
export const CONTRACT_STATUSES: ContractStatus[] = ['Active', 'Expired', 'Pending'];
export const RENEWAL_STATUSES: RenewalStatus[] = ['Upcoming', 'Negotiation', 'Renewed', 'Lost'];
export const SIGNAL_STRENGTHS: SignalStrength[] = ['Low', 'Medium', 'High'];
