import type { CustomerType } from '../types/index.ts';

export const CUSTOMER_TYPES: CustomerType[] = ['residential', 'commercial'];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
};
