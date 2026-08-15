// apps/web/src/hooks/useDeals.ts
import { useQuery } from '@tanstack/react-query'
import type { PaginatedResponse } from './useCustomers'
import { apiFetch } from '@/lib/api'

export const dealStages = ['Leads', 'Qualified', 'Proposal', 'Won', 'Lost'] as const

export type DealStage = (typeof dealStages)[number]

export interface Deal {
  id: string
  customerId: string
  customerName: string
  amount: number
  channel: string | null
  originalPrice: number | null
  productName: string
  stage: DealStage
  expectedCloseDate: string
  startDate: string | null
  durationYears: number | null
  giftMonths: number
  expireDate: string | null
  renewalReminderDays: number
  softwareCost: number | null
  taxCost: number | null
  rebateAmount: number | null
  netProfit: number | null
  createdAt: string
}

export interface DealFilters {
  search?: string
  status?: DealStage
  page?: number
  limit?: number
}

export function useDeals(filters: DealFilters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 10))
  const query = params.toString()

  return useQuery({
    queryKey: ['deals', filters],
    queryFn: () => apiFetch<PaginatedResponse<Deal>>(`/api/deals?${query}`),
  })
}
