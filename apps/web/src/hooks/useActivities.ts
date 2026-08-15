// apps/web/src/hooks/useActivities.ts
import { useQuery } from '@tanstack/react-query'
import type { DealStage } from '@/hooks/useDeals'
import { apiFetch } from '@/lib/api'

export interface WorkActivity {
  id: string
  type: 'Call' | 'Meeting' | 'Email'
  notes: string | null
  checkInAddress: string | null
  createdAt: string
  dealId: string
  customerId: string
  customerName: string
  productName: string
  dealStage: DealStage | null
}

export function useActivities() {
  return useQuery({
    queryKey: ['activities'],
    queryFn: () => apiFetch<{ activities: WorkActivity[] }>('/api/activities'),
  })
}
