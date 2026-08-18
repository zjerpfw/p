// apps/web/src/hooks/useTasks.ts
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type TaskStatus = 'Open' | 'Completed'
export type TaskPriority = 'Low' | 'Normal' | 'High'

export interface Task {
  id: string
  customerId: string
  customerName: string
  dealId: string | null
  dealProductName: string | null
  title: string
  description: string | null
  assigneeId: string
  assigneeName: string
  dueAt: string
  priority: TaskPriority
  status: TaskStatus
  completedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TaskFilters {
  status?: TaskStatus
  customerId?: string
  limit?: number
  enabled?: boolean
}

export function useTasks(filters: TaskFilters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.customerId) params.set('customer_id', filters.customerId)
  params.set('limit', String(filters.limit ?? 50))
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => apiFetch<{ tasks: Task[] }>(`/api/tasks?${params.toString()}`),
    enabled: filters.enabled ?? true,
  })
}
