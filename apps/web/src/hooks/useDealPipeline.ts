// apps/web/src/hooks/useDealPipeline.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Deal, DealStage } from './useDeals'
import { apiFetch } from '@/lib/api'

export interface PipelineStageSummary {
  stage: DealStage
  count: number
  totalAmountCents: number
  weightedAmountCents: number
}

export interface PipelineSummary {
  count: number
  totalAmountCents: number
  weightedAmountCents: number
  stages: PipelineStageSummary[]
}

interface PipelineColumnPage {
  data: Deal[]
  pageInfo: {
    hasMore: boolean
    nextCursor: string | null
  }
}

export function useDealPipelineSummary(search: string) {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const query = params.toString()

  return useQuery({
    queryKey: ['deals', 'pipeline', 'summary', search],
    queryFn: () => apiFetch<PipelineSummary>(`/api/deals/pipeline${query ? `?${query}` : ''}`),
  })
}

export function useDealPipelineColumn(stage: DealStage, search: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['deals', 'pipeline', 'column', stage, search],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '10' })
      if (search) params.set('search', search)
      if (pageParam) params.set('cursor', pageParam)
      return apiFetch<PipelineColumnPage>(`/api/deals/pipeline/${stage}?${params}`)
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled,
  })
}
