import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type WonCustomerExpiryBucket = 'expired' | 'within_30' | 'within_90' | 'beyond_90' | 'unspecified'

export interface WonCustomer {
  id: string
  name: string
  contactPhone: string | null
  province: string | null
  city: string | null
  address: string | null
  lng: number | null
  lat: number | null
  saasExpireDate: string | null
  ownerId: string
  ownerName: string | null
  latestWonAt: string | null
  latestProductName: string | null
}

export interface WonCustomerFilters {
  search?: string
  provinces?: string[]
  cities?: string[]
  expiry?: WonCustomerExpiryBucket[]
  page?: number
  limit?: number
}

export interface WonCustomerResponse {
  data: WonCustomer[]
  regions: Array<{ province: string | null; city: string | null }>
  total: number
  page: number
  totalPages: number
}

export function useWonCustomers(filters: WonCustomerFilters = {}) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.provinces?.length) params.set('provinces', filters.provinces.join(','))
  if (filters.cities?.length) params.set('cities', filters.cities.join(','))
  if (filters.expiry?.length) params.set('expiry', filters.expiry.join(','))
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 20))
  return useQuery({
    queryKey: ['won-customers', filters],
    queryFn: () => apiFetch<WonCustomerResponse>(`/api/customers/won-customers?${params.toString()}`),
  })
}
