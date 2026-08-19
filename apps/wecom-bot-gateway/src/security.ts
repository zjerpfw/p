// apps/wecom-bot-gateway/src/security.ts
const encoder = new TextEncoder()

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function signRequest(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`)))
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

export async function verifyRequest(request: Request, secret: string): Promise<boolean> {
  if (!secret) return false
  const timestamp = request.headers.get('X-CRM-Timestamp') ?? ''
  const signature = request.headers.get('X-CRM-Signature') ?? ''
  const timestampNumber = Number(timestamp)
  if (!/^\d{10,13}$/u.test(timestamp) || !Number.isFinite(timestampNumber)) return false
  const timestampMs = timestamp.length === 10 ? timestampNumber * 1000 : timestampNumber
  if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false
  const body = await request.clone().text()
  const expected = await signRequest(secret, timestamp, body)
  return constantTimeEqual(expected, signature)
}
