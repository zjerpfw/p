// apps/web/src/lib/api.ts
const TOKEN_STORAGE_KEY = 'crm_jwt'
const API_BASE_URL = import.meta.env.PROD
  ? (import.meta.env.VITE_API_BASE_URL ?? 'https://crm-api.jzfwsh.ltd').replace(/\/$/, '')
  : ''
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

function redirectToLogin() {
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function getCurrentUserRole() {
  const payload = getJwtPayload()
  return typeof payload?.role === 'string' ? payload.role : null
}

export function getCurrentUserId() {
  const payload = getJwtPayload()
  return typeof payload?.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
}

function getJwtPayload() {
  const token = getAccessToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalizedPayload)) as { sub?: unknown; role?: unknown }
  } catch {
    return null
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  const timeoutController = init.signal ? null : new AbortController()
  const timeoutId = timeoutController
    ? window.setTimeout(() => timeoutController.abort(), DEFAULT_REQUEST_TIMEOUT_MS)
    : null

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? timeoutController?.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('网络请求超时，请检查 API 地址或网络连接', 0)
    }
    throw new ApiError('网络请求失败，请检查 API 地址或网络连接', 0)
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }

  if (response.status === 401) {
    clearAccessToken()
    redirectToLogin()
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(data?.error ?? '请求失败', response.status)
  }

  return response.json() as Promise<T>
}

export async function downloadApiFile(path: string, fallbackFilename: string) {
  const token = getAccessToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (response.status === 401) {
    clearAccessToken()
    redirectToLogin()
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(data?.error ?? '文件导出失败', response.status)
  }

  const disposition = response.headers.get('Content-Disposition')
  const encodedFilename = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const filename = encodedFilename
    ? decodeURIComponent(encodedFilename)
    : disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? fallbackFilename
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
