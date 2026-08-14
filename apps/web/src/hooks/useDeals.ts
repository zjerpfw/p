// apps/web/src/hooks/useDeals.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export const dealStages = ['Leads', 'Qualified', 'Proposal', 'Won', 'Lost'] as const

export type DealStage = (typeof dealStages)[number]

export interface Deal {
  id: string
  customerId: string
  customerName: string
  amount: number
  stage: DealStage
  expectedCloseDate: string
  startDate: string | null
  durationYears: number | null
  expireDate: string | null
  renewalReminderDays: number
  softwareCost: number | null
  taxCost: number | null
  rebateAmount: number | null
  netProfit: number | null
  createdAt: string
}

interface DealsResponse {
  deals: Deal[]
}

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: () => apiFetch<DealsResponse>('/api/deals'),
  })
}
