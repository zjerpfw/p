// apps/web/src/pages/WeChatCallbackPage.tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, setAccessToken } from '../lib/api'

const OAUTH_STATE_STORAGE_KEY = 'crm_wechat_oauth_state'

interface LoginResponse {
  token: string
}

export default function WeChatCallbackPage() {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    async function completeLogin() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY)

      if (!code || !state || state !== expectedState) {
        setError('企业微信授权验证失败，请重新登录。')
        return
      }

      sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY)

      try {
        const response = await apiFetch<LoginResponse>('/api/auth/wechat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        setAccessToken(response.token)
        navigate('/', { replace: true })
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '登录失败，请重试。')
      }
    }

    void completeLogin()
  }, [navigate])

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950">
      <p className={error ? 'text-red-700' : 'text-slate-600'}>
        {error ?? '正在完成企业微信登录...'}
      </p>
    </main>
  )
}
