import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

const TRANSIENT_HTTP_STATUSES = new Set([0, 408, 425, 429])

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false
  if (!(error instanceof ApiError)) return false

  return TRANSIENT_HTTP_STATUSES.has(error.status) || error.status >= 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 6_000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
