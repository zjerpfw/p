// apps/web/src/hooks/useCustomers.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export interface Customer {
  id: string
  name: string
  contactPhone: string | null
  status: string
  lng: number | null
  lat: number | null
  address: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  totalPages: number
}

export interface CustomerFilters {
  search?: string
  status?: string
  page?: number
  limit?: number
}

export function useCustomers(filters: CustomerFilters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 10))
  const query = params.toString()

  return useQuery({
    queryKey: ['customers', filters],
    queryFn: () => apiFetch<PaginatedResponse<Customer>>(`/api/customers?${query}`),
  })
}
