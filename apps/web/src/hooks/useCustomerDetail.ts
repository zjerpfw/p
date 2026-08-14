// apps/web/src/hooks/useCustomerDetail.ts
import { useQuery } from '@tanstack/react-query'
import type { Customer } from './useCustomers'
import type { Deal } from './useDeals'
import { apiFetch } from '@/lib/api'

export interface Activity {
  id: string
  dealId: string
  dealStage: Deal['stage']
  type: 'Call' | 'Meeting' | 'Email'
  notes: string | null
  checkInLng: number | null
  checkInLat: number | null
  checkInAddress: string | null
  createdBy: string
  createdAt: string
}

interface CustomerDetailResponse {
  customer: Customer
  deals: Omit<Deal, 'customerName'>[]
  activities: Activity[]
}

export function customerDetailQueryKey(id: string) {
  return ['customers', id] as const
}

export function useCustomerDetail(id: string | undefined) {
  return useQuery({
    queryKey: customerDetailQueryKey(id ?? ''),
    queryFn: () => apiFetch<CustomerDetailResponse>(`/api/customers/${id}`),
    enabled: Boolean(id),
  })
}
