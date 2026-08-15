// apps/api/src/routes/storage.ts
import { AwsClient } from 'aws4fetch'
import { createDb } from '@crm/db/client'
import { activities, attachments, customers, deals } from '@crm/db/schema'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

const GITHUB_API_BASE = 'https://api.github.com'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60
const PRESIGNED_VIEW_TTL_SECONDS = 5 * 60

function githubHeaders(env: Env, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function safeFilename(name: string): string | null {
  const normalized = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!normalized || normalized === '.' || normalized === '..' || normalized.length > 160) {
    return null
  }
  return normalized
}

function githubContentUrl(env: Env, path: string): string {
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPOSITORY)}/contents/${path}`
}

function createS3Client(env: Env) {
  return new AwsClient({
    accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: env.SUPABASE_S3_REGION,
  })
}

function s3ObjectUrl(env: Env, objectKey: string) {
  const endpoint = new URL(env.SUPABASE_S3_ENDPOINT)
  const basePath = endpoint.pathname.replace(/\/$/, '')
  endpoint.pathname = `${basePath}/${encodeURIComponent(env.SUPABASE_S3_BUCKET)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
  return endpoint
}

function isSafeDocumentKey(fileKey: string) {
  return fileKey.startsWith('documents/') && fileKey.length <= 400 && !fileKey.includes('..')
}

function contentTypeFromFilename(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  }
  return contentTypes[extension ?? ''] ?? 'application/octet-stream'
}

export const storage = new Hono<{ Bindings: Env }>()

storage.post('/upload/image', async (c) => {
  let formData: FormData

  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: '请求必须使用 multipart/form-data' }, 400)
  }

  const uploadedFile = formData.get('file')
  if (!(uploadedFile instanceof File)) {
    return c.json({ error: 'file 是必填文件字段' }, 400)
  }

  if (uploadedFile.size === 0 || uploadedFile.size > MAX_IMAGE_BYTES) {
    return c.json({ error: '图片大小必须在 1 字节至 10 MiB 之间' }, 400)
  }

  if (!uploadedFile.type.startsWith('image/')) {
    return c.json({ error: '只支持图片文件' }, 415)
  }

  const originalName = safeFilename(uploadedFile.name)
  if (!originalName) {
    return c.json({ error: '文件名无效' }, 400)
  }

  const filename = `${crypto.randomUUID()}-${originalName}`
  const path = `images/${filename}`
  const content = toBase64(await uploadedFile.arrayBuffer())
  const response = await fetch(githubContentUrl(c.env, path), {
    method: 'PUT',
    headers: {
      ...githubHeaders(c.env),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Upload CRM image: ${filename}`,
      content,
    }),
  })

  if (!response.ok) {
    return c.json({ error: '图片上传失败' }, 502)
  }

  return c.json({ imageUrl: `/api/storage/image/${encodeURIComponent(filename)}` }, 201)
})

storage.get('/image/:name', async (c) => {
  const filename = safeFilename(c.req.param('name'))
  if (!filename) {
    return c.json({ error: '文件名无效' }, 400)
  }

  const response = await fetch(githubContentUrl(c.env, `images/${filename}`), {
    headers: githubHeaders(c.env, 'application/vnd.github.raw+json'),
  })

  if (response.status === 404) {
    return c.json({ error: '图片不存在' }, 404)
  }

  if (!response.ok || !response.body) {
    return c.json({ error: '图片读取失败' }, 502)
  }

  return new Response(response.body, {
    headers: {
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
    },
  })
})

storage.post('/presign/document', async (c) => {
  let body: { filename?: unknown; contentType?: unknown; customer_id?: unknown; activity_id?: unknown }

  try {
    body = await c.req.json<{ filename?: unknown; contentType?: unknown; customer_id?: unknown; activity_id?: unknown }>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (typeof body.filename !== 'string' || typeof body.contentType !== 'string' || typeof body.customer_id !== 'string') {
    return c.json({ error: 'filename、contentType 和 customer_id 是必填项' }, 400)
  }

  const filename = safeFilename(body.filename)
  if (!filename || body.contentType.length === 0 || body.contentType.length > 255) {
    return c.json({ error: '文件名或 contentType 无效' }, 400)
  }

  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, body.customer_id), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权上传附件' }, 404)

  const objectKey = `documents/${crypto.randomUUID()}-${filename}`
  const endpoint = s3ObjectUrl(c.env, objectKey)
  endpoint.searchParams.set('X-Amz-Expires', String(PRESIGNED_UPLOAD_TTL_SECONDS))

  const s3 = createS3Client(c.env)
  const signedRequest = await s3.sign(
    new Request(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': body.contentType },
    }),
    { aws: { signQuery: true } },
  )

  return c.json({
    uploadUrl: signedRequest.url,
    objectKey,
    expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
  })
})

storage.post('/attachments', async (c) => {
  let body: { customer_id?: unknown; activity_id?: unknown; file_key?: unknown; file_name?: unknown; content_type?: unknown }
  try {
    body = await c.req.json<typeof body>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  if (typeof body.customer_id !== 'string' || typeof body.file_key !== 'string' || typeof body.file_name !== 'string' || typeof body.content_type !== 'string' || !isSafeDocumentKey(body.file_key)) {
    return c.json({ error: '附件登记参数无效' }, 400)
  }
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, body.customer_id), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!customer) return c.json({ error: '客户不存在或无权登记附件' }, 404)
  if (typeof body.activity_id === 'string' && body.activity_id.length > 0) {
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .innerJoin(deals, eq(activities.dealId, deals.id))
      .where(and(eq(activities.id, body.activity_id), eq(deals.customerId, customer.id), eq(deals.isDeleted, false)))
      .limit(1)
    if (!activity) return c.json({ error: '关联跟进记录不存在或不属于当前客户' }, 400)
  }
  const attachment = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    activityId: typeof body.activity_id === 'string' && body.activity_id.length > 0 ? body.activity_id : null,
    fileKey: body.file_key,
    fileName: safeFilename(body.file_name),
    contentType: body.content_type.slice(0, 255),
    uploadedBy: actor.id,
    createdAt: new Date(),
  }
  if (!attachment.fileName) return c.json({ error: '文件名无效' }, 400)
  try {
    await db.insert(attachments).values(attachment)
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return c.json({ error: '附件已登记' }, 409)
    throw error
  }
  return c.json({ attachment }, 201)
})

storage.get('/presign/view', async (c) => {
  const attachmentId = c.req.query('attachment_id')
  const fileKey = c.req.query('file_key')
  if (!attachmentId && !fileKey) return c.json({ error: 'attachment_id 或 file_key 是必填项' }, 400)
  if (fileKey && !isSafeDocumentKey(fileKey)) return c.json({ error: 'file_key 无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [attachment] = await db
    .select({ id: attachments.id, fileKey: attachments.fileKey, fileName: attachments.fileName, contentType: attachments.contentType })
    .from(attachments)
    .innerJoin(customers, eq(attachments.customerId, customers.id))
    .where(and(
      attachmentId ? eq(attachments.id, attachmentId) : eq(attachments.fileKey, fileKey!),
      eq(customers.isDeleted, false),
      actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined,
    ))
    .limit(1)
  if (!attachment || !isSafeDocumentKey(attachment.fileKey)) return c.json({ error: '附件不存在或无权预览' }, 404)

  const endpoint = s3ObjectUrl(c.env, attachment.fileKey)
  endpoint.searchParams.set('X-Amz-Expires', String(PRESIGNED_VIEW_TTL_SECONDS))
  endpoint.searchParams.set('response-content-disposition', `inline; filename="${attachment.fileName.replace(/"/g, '')}"`)
  endpoint.searchParams.set('response-content-type', attachment.contentType || contentTypeFromFilename(attachment.fileName))
  const signedRequest = await createS3Client(c.env).sign(new Request(endpoint, { method: 'GET' }), { aws: { signQuery: true } })
  return c.json({ viewUrl: signedRequest.url, expiresIn: PRESIGNED_VIEW_TTL_SECONDS })
})

storage.delete('/attachments/:id', async (c) => {
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [attachment] = await db
    .select({ id: attachments.id, fileKey: attachments.fileKey, uploadedBy: attachments.uploadedBy })
    .from(attachments)
    .innerJoin(customers, eq(attachments.customerId, customers.id))
    .where(and(eq(attachments.id, c.req.param('id')), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!attachment || !isSafeDocumentKey(attachment.fileKey)) return c.json({ error: '附件不存在或无权删除' }, 404)
  if (actor.role !== 'admin' && attachment.uploadedBy !== actor.id) return c.json({ error: '仅上传者或管理员可以删除附件' }, 403)

  const response = await createS3Client(c.env).sign(new Request(s3ObjectUrl(c.env, attachment.fileKey), { method: 'DELETE' }))
  const deleteResponse = await fetch(response)
  if (!deleteResponse.ok && deleteResponse.status !== 404) return c.json({ error: '云端附件删除失败' }, 502)
  await db.delete(attachments).where(eq(attachments.id, attachment.id))
  return c.json({ id: attachment.id, deleted: true })
})
