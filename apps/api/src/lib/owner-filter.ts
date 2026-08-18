// apps/api/src/lib/owner-filter.ts
import { createDb } from '@crm/db/client'
import { customers, users } from '@crm/db/schema'
import { eq, type SQL } from 'drizzle-orm'
import type { AuthenticatedActor } from './auth'

export async function resolveCustomerOwnerFilter(
  db: ReturnType<typeof createDb>,
  actor: AuthenticatedActor,
  requestedOwnerId: string | undefined,
): Promise<{ filter?: SQL; error?: string }> {
  if (actor.role !== 'admin') return { filter: eq(customers.ownerId, actor.id) }
  if (!requestedOwnerId) return {}
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, requestedOwnerId)).limit(1)
  return owner ? { filter: eq(customers.ownerId, owner.id) } : { error: '负责人不存在' }
}
