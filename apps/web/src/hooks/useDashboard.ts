// apps/web/src/hooks/useDashboard.ts
import { useQuery } from '@tanstack/react-query'
import type { DealStage } from './useDeals'
import { apiFetch } from '@/lib/api'

export interface DashboardData {
  month: string
  newLeads: number
  wonNetProfit: number
  stageDistribution: Array<{ stage: DealStage; count: number }>
  renewalDeals: Array<{
    id: string
    customerName: string
    productName: string
    giftMonths: number
    expireDate: string
    amount: number
  }>
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/api/dashboard'),
  })
}
