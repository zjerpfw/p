// apps/web/src/hooks/useDashboard.ts
import { useQuery } from '@tanstack/react-query'
import type { DealStage } from './useDeals'
import { apiFetch } from '@/lib/api'

export interface DashboardData {
  month: string
  newLeads: number
  wonNetProfitCents: number
  weightedForecastCents: number
  stageDistribution: Array<{ stage: DealStage; count: number }>
  funnelDistribution: Array<{ name: string; value: number; stage: DealStage }>
  renewalDeals: Array<{
    id: string
    customerId: string
    customerName: string
    productName: string
    channel: string | null
    giftMonths: number
    expireDate: string
    amountCents: number
  }>
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/dashboard'),
  })
}
