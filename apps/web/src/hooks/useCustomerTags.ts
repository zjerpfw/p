// apps/web/src/hooks/useCustomerTags.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface CustomerTag {
  id: string
  name: string
}

export function useCustomerTags() {
  return useQuery({
    queryKey: ['customer-tags'],
    queryFn: () => apiFetch<{ tags: CustomerTag[] }>('/api/customers/tags'),
  })
}
