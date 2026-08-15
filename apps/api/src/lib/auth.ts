// apps/api/src/lib/auth.ts
import type { Context } from 'hono'

export interface AuthenticatedActor {
  id: string
  role: string
}

export function getAuthenticatedActor(c: Context): AuthenticatedActor | null {
  const payload = c.get('jwtPayload') as { sub?: unknown; role?: unknown }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0 || typeof payload.role !== 'string') {
    return null
  }

  return { id: payload.sub, role: payload.role }
}
