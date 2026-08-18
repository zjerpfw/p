// apps/api/src/lib/audit.ts
import { createDb } from '@crm/db/client'
import { auditActions, auditLogs } from '@crm/db/schema'
import type { Env } from '../env'

type AuditAction = (typeof auditActions)[number]

interface AuditLogInput {
  actorId: string | null
  entityType: string
  entityId: string
  action: AuditAction
  before?: unknown
  after?: unknown
}

function stringifyAuditValue(value: unknown) {
  if (value === undefined) return null
  try {
    const serialized = JSON.stringify(value)
    return serialized.length > 10_000 ? `${serialized.slice(0, 9_997)}...` : serialized
  } catch {
    return '"[unserializable]"'
  }
}

export async function writeAuditLog(env: Env, input: AuditLogInput) {
  try {
    const db = createDb(env.DB)
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      beforeValue: stringifyAuditValue(input.before),
      afterValue: stringifyAuditValue(input.after),
      createdAt: new Date(),
    })
  } catch (error) {
    console.error('Audit log write failed', error)
  }
}
