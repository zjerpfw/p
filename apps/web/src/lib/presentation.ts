// apps/web/src/lib/presentation.ts
import type { DealStage } from '@/hooks/useDeals'

export const dealStageLabels: Record<DealStage, string> = {
  Leads: '💡 初步线索',
  Qualified: '🔍 需求确认',
  Proposal: '方案报价',
  Won: '🎉 赢单成交',
  Lost: '❌ 遗憾输单',
}

export const activityTypeLabels = {
  Call: '电话沟通',
  Meeting: '现场拜访',
  Email: '邮件沟通',
} as const

const customerStatusLabels: Record<string, string> = {
  Active: '活跃',
  Inactive: '沉睡',
}

const userRoleLabels: Record<string, string> = {
  admin: '系统管理员',
  sales: '销售顾问',
}

export function getCustomerStatusLabel(status: string) {
  return customerStatusLabels[status] ?? status
}

export function getUserRoleLabel(role: string) {
  return userRoleLabels[role] ?? role
}
