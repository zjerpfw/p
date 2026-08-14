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

interface CustomersResponse {
  customers: Customer[]
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => apiFetch<CustomersResponse>('/api/customers'),
  })
}
