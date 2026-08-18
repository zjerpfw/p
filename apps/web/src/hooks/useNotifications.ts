// apps/web/src/hooks/useNotifications.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type NotificationType = 'RenewalReminder' | 'TaskUpcomingReminder' | 'TaskDueReminder' | 'TaskOverdueReminder'
export type NotificationStatus = 'Pending' | 'Sent' | 'Failed'

export interface NotificationLog {
  id: string
  type: NotificationType
  referenceId: string
  recipientUserId: string
  recipientName: string | null
  reminderDate: string
  status: NotificationStatus
  lastError: string | null
  attemptCount: number
  sentAt: string | null
  createdAt: string
}

interface NotificationFilters {
  status?: NotificationStatus
  type?: NotificationType
  page?: number
  limit?: number
}

interface NotificationResponse {
  notifications: NotificationLog[]
  total: number
  page: number
  totalPages: number
}

export function useNotifications(filters: NotificationFilters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.type) params.set('type', filters.type)
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 50))
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: () => apiFetch<NotificationResponse>(`/api/notifications?${params.toString()}`),
  })
}
