// apps/web/src/hooks/useUsers.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface InternalUser {
  id: string
  name: string
  avatarUrl: string | null
  role: string
}

interface UsersResponse {
  users: InternalUser[]
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<UsersResponse>('/api/users'),
  })
}
