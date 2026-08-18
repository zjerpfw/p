// apps/web/src/hooks/useAuditLogs.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type AuditAction = 'Created' | 'Updated' | 'Deleted' | 'Won' | 'Renewed' | 'Transferred'

export interface AuditLog {
  id: string
  actorId: string | null
  actorName: string | null
  entityType: string
  entityId: string
  action: AuditAction
  beforeValue: string | null
  afterValue: string | null
  createdAt: string
}

export interface AuditLogFilters {
  entityType?: string
  action?: AuditAction
  page?: number
  limit?: number
}

export interface AuditLogResponse {
  logs: AuditLog[]
  total: number
  page: number
  totalPages: number
}

export function useAuditLogs(filters: AuditLogFilters = {}) {
  const params = new URLSearchParams()
  if (filters.entityType) params.set('entity_type', filters.entityType)
  if (filters.action) params.set('action', filters.action)
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 50))
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch<AuditLogResponse>(`/api/audit-logs?${params.toString()}`),
  })
}
