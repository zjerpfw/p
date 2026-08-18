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
  amountCents: number
  channel: string | null
  originalPriceCents: number | null
  dealType: string
  productName: string
  stage: DealStage
  probability: number
  lostReason: string | null
  expectedCloseDate: string
  startDate: string | null
  durationYears: number | null
  giftMonths: number
  expireDate: string | null
  renewalReminderDays: number
  softwareCostCents: number | null
  taxCostCents: number | null
  rebateAmountCents: number | null
  netProfitCents: number | null
  createdAt: string
}

export interface DealFilters {
  search?: string
  status?: DealStage
  activeOnly?: boolean
  page?: number
  limit?: number
  enabled?: boolean
}

export function useDeals(filters: DealFilters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.activeOnly) params.set('active_only', 'true')
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 10))
  const query = params.toString()

  return useQuery({
    queryKey: ['deals', filters],
    queryFn: () => apiFetch<PaginatedResponse<Deal>>(`/api/deals?${query}`),
    enabled: filters.enabled ?? true,
  })
}
