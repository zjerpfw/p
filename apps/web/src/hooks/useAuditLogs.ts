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

export function useAuditLogs(entityType?: string) {
  const query = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : ''
  return useQuery({
    queryKey: ['audit-logs', entityType],
    queryFn: () => apiFetch<{ logs: AuditLog[] }>(`/api/audit-logs${query}`),
  })
}
