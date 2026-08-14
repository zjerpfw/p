// apps/api/src/routes/storage.ts
import { AwsClient } from 'aws4fetch'
import { Hono } from 'hono'
import type { Env } from '../env'

const GITHUB_API_BASE = 'https://api.github.com'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60

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
  let body: { filename?: unknown; contentType?: unknown }

  try {
    body = await c.req.json<{ filename?: unknown; contentType?: unknown }>()
  } catch {
    return c.json({ error: '请求体必须是 JSON' }, 400)
  }

  if (typeof body.filename !== 'string' || typeof body.contentType !== 'string') {
    return c.json({ error: 'filename 和 contentType 是必填项' }, 400)
  }

  const filename = safeFilename(body.filename)
  if (!filename || body.contentType.length === 0 || body.contentType.length > 255) {
    return c.json({ error: '文件名或 contentType 无效' }, 400)
  }

  const objectKey = `documents/${crypto.randomUUID()}-${filename}`
  const endpoint = new URL(c.env.SUPABASE_S3_ENDPOINT)
  const basePath = endpoint.pathname.replace(/\/$/, '')
  endpoint.pathname = `${basePath}/${encodeURIComponent(c.env.SUPABASE_S3_BUCKET)}/${objectKey}`
  endpoint.searchParams.set('X-Amz-Expires', String(PRESIGNED_UPLOAD_TTL_SECONDS))

  const s3 = new AwsClient({
    accessKeyId: c.env.SUPABASE_S3_ACCESS_KEY_ID,
    secretAccessKey: c.env.SUPABASE_S3_SECRET_ACCESS_KEY,
    service: 's3',
    region: c.env.SUPABASE_S3_REGION,
  })
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
