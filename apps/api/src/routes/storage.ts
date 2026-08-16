// apps/api/src/routes/storage.ts
import { AwsClient } from 'aws4fetch'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createDb } from '@crm/db/client'
import { activities, attachmentAssets, attachments, contracts, customers, deals, invoices, payments } from '@crm/db/schema'
import { and, eq } from 'drizzle-orm'
import { Hono, type Context, type Next } from 'hono'
import { jwt } from 'hono/jwt'
import type { Env } from '../env'
import { getAuthenticatedActor } from '../lib/auth'

const GITHUB_API_BASE = 'https://api.github.com'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60
const PRESIGNED_VIEW_TTL_SECONDS = 5 * 60
const ASSET_UPLOAD_TTL_SECONDS = 5 * 60
const MAX_ASSET_BYTES = 50 * 1024 * 1024
const ASSET_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])

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

function createPrivateS3Client(env: Env) {
  return new S3Client({
    region: env.SUPABASE_S3_REGION,
    endpoint: env.SUPABASE_S3_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.SUPABASE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.SUPABASE_S3_SECRET_ACCESS_KEY,
    },
  })
}

function isSafeAssetKey(objectKey: string) {
  return objectKey.startsWith('private-assets/') && objectKey.length <= 500 && !objectKey.includes('..')
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

async function requireStorageAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const middleware = jwt({ alg: 'HS256', secret: c.env.JWT_SECRET })
  return middleware(c, next)
}

storage.use('/presign/*', requireStorageAuth)
storage.use('/attachments', requireStorageAuth)
storage.use('/attachments/*', requireStorageAuth)
storage.use('/upload/image', requireStorageAuth)
storage.use('/presigned-url', requireStorageAuth)
storage.use('/confirm-upload', requireStorageAuth)

type AssetType = 'Contract' | 'Invoice' | 'PaymentProof'

interface AssetParent {
  customerId: string
  dealId: string
  contractId: string | null
  invoiceId: string | null
  paymentId: string | null
}

async function getAuthorizedAssetParent(
  db: ReturnType<typeof createDb>,
  actor: NonNullable<ReturnType<typeof getAuthenticatedActor>>,
  assetType: AssetType,
  parentId: string,
): Promise<AssetParent | null> {
  const ownerFilter = actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined
  if (assetType === 'Contract') {
    const [row] = await db.select({ customerId: contracts.customerId, dealId: contracts.dealId, contractId: contracts.id })
      .from(contracts).innerJoin(customers, eq(contracts.customerId, customers.id))
      .where(and(eq(contracts.id, parentId), eq(customers.isDeleted, false), ownerFilter)).limit(1)
    return row ? { ...row, invoiceId: null, paymentId: null } : null
  }
  if (assetType === 'Invoice') {
    const [row] = await db.select({ customerId: invoices.customerId, dealId: invoices.dealId, contractId: invoices.contractId, invoiceId: invoices.id })
      .from(invoices).innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(eq(invoices.id, parentId), eq(customers.isDeleted, false), ownerFilter)).limit(1)
    return row ? { ...row, paymentId: null } : null
  }
  const [row] = await db.select({ customerId: payments.customerId, dealId: payments.dealId, contractId: payments.contractId, invoiceId: payments.invoiceId, paymentId: payments.id })
    .from(payments).innerJoin(customers, eq(payments.customerId, customers.id))
    .where(and(eq(payments.id, parentId), eq(customers.isDeleted, false), ownerFilter)).limit(1)
  return row ?? null
}

storage.get('/presigned-url', async (c) => {
  const assetType = c.req.query('asset_type')
  const parentId = c.req.query('parent_id')
  const filename = c.req.query('filename')
  const mimeType = c.req.query('mime_type')
  const sizeBytes = Number(c.req.query('size_bytes'))
  if (
    (assetType !== 'Contract' && assetType !== 'Invoice' && assetType !== 'PaymentProof') ||
    !parentId ||
    !filename ||
    !mimeType ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_ASSET_BYTES ||
    !ASSET_MIME_TYPES.has(mimeType)
  ) {
    return c.json({ error: '资产上传参数无效' }, 400)
  }
  const safeName = safeFilename(filename)
  if (!safeName) return c.json({ error: '文件名无效' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const parent = await getAuthorizedAssetParent(db, actor, assetType, parentId)
  if (!parent) return c.json({ error: '资产主体不存在或无权上传文件' }, 404)

  const now = new Date()
  const assetId = crypto.randomUUID()
  const objectKey = `private-assets/${parent.customerId}/${assetType.toLowerCase()}/${assetId}-${safeName}`
  await db.insert(attachmentAssets).values({
    id: assetId,
    ...parent,
    assetType,
    uploadStatus: 'Pending',
    bucket: c.env.SUPABASE_S3_BUCKET,
    objectKey,
    originalFilename: safeName,
    mimeType,
    sizeBytes,
    version: 1,
    uploadedBy: actor.id,
    createdAt: now,
    updatedAt: now,
  })
  const uploadUrl = await getSignedUrl(createPrivateS3Client(c.env), new PutObjectCommand({
    Bucket: c.env.SUPABASE_S3_BUCKET,
    Key: objectKey,
    ContentType: mimeType,
  }), { expiresIn: ASSET_UPLOAD_TTL_SECONDS })
  return c.json({ assetId, uploadUrl, objectKey, expiresIn: ASSET_UPLOAD_TTL_SECONDS }, 201)
})

storage.post('/confirm-upload', async (c) => {
  let body: { asset_id?: unknown }
  try {
    body = await c.req.json<typeof body>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }
  if (typeof body.asset_id !== 'string' || body.asset_id.length === 0) return c.json({ error: 'asset_id 是必填项' }, 400)
  const actor = getAuthenticatedActor(c)
  if (!actor) return c.json({ error: '登录凭证无效' }, 401)
  const db = createDb(c.env.DB)
  const [asset] = await db.select({ id: attachmentAssets.id, objectKey: attachmentAssets.objectKey, bucket: attachmentAssets.bucket, mimeType: attachmentAssets.mimeType, uploadStatus: attachmentAssets.uploadStatus, uploadedBy: attachmentAssets.uploadedBy })
    .from(attachmentAssets).innerJoin(customers, eq(attachmentAssets.customerId, customers.id))
    .where(and(eq(attachmentAssets.id, body.asset_id), eq(customers.isDeleted, false), actor.role !== 'admin' ? eq(customers.ownerId, actor.id) : undefined))
    .limit(1)
  if (!asset || !isSafeAssetKey(asset.objectKey) || asset.bucket !== c.env.SUPABASE_S3_BUCKET) return c.json({ error: '资产附件不存在或无权确认' }, 404)
  if (actor.role !== 'admin' && asset.uploadedBy !== actor.id) return c.json({ error: '仅上传者或管理员可以确认上传' }, 403)
  if (asset.uploadStatus === 'Uploaded') return c.json({ assetId: asset.id, uploadStatus: 'Uploaded', alreadyConfirmed: true })

  try {
    const metadata = await createPrivateS3Client(c.env).send(new HeadObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey }))
    const contentLength = metadata.ContentLength
    if (contentLength === undefined || !Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_ASSET_BYTES) return c.json({ error: '对象大小无效' }, 400)
    const sizeBytes = contentLength
    const mimeType = metadata.ContentType
    if (!mimeType || !ASSET_MIME_TYPES.has(mimeType) || mimeType !== asset.mimeType) return c.json({ error: '对象 MIME 类型与上传申请不一致' }, 400)
    await db.update(attachmentAssets).set({ uploadStatus: 'Uploaded', sizeBytes, mimeType, uploadedAt: new Date(), updatedAt: new Date() }).where(eq(attachmentAssets.id, asset.id))
    return c.json({ assetId: asset.id, uploadStatus: 'Uploaded', sizeBytes, mimeType })
  } catch (error) {
    console.error('Asset upload confirmation failed:', error)
    await db.update(attachmentAssets).set({ uploadStatus: 'Failed', updatedAt: new Date() }).where(eq(attachmentAssets.id, asset.id))
    return c.json({ error: '未找到可确认的私有资产对象' }, 409)
  }
})

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

  try {
    const objectKey = `documents/${crypto.randomUUID()}-${filename}`
    const endpoint = s3ObjectUrl(c.env, objectKey)
    endpoint.searchParams.set('X-Amz-Expires', String(PRESIGNED_UPLOAD_TTL_SECONDS))

    const signedRequest = await createS3Client(c.env).sign(
      new Request(endpoint, {
        method: 'PUT',
        // The browser must send exactly this signed Content-Type when uploading.
        headers: { 'Content-Type': body.contentType },
      }),
      { aws: { signQuery: true } },
    )

    return c.json({
      uploadUrl: signedRequest.url,
      objectKey,
      expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS,
    })
  } catch (error) {
    console.error('Upload Presign Error:', error)
    return c.json({
      error: '生成附件上传链接失败',
      detail: error instanceof Error ? error.message : String(error),
    }, 502)
  }
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
      .where(and(eq(activities.id, body.activity_id), eq(activities.customerId, customer.id)))
      .limit(1)
    if (!activity) return c.json({ error: '关联跟进记录不存在或不属于当前客户' }, 400)
  }
  const fileName = safeFilename(body.file_name)
  if (!fileName) return c.json({ error: '文件名无效' }, 400)
  const attachment = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    activityId: typeof body.activity_id === 'string' && body.activity_id.length > 0 ? body.activity_id : null,
    fileKey: body.file_key,
    fileName,
    contentType: body.content_type.slice(0, 255),
    uploadedBy: actor.id,
    createdAt: new Date(),
  }
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
