// apps/web/src/pages/LoginPage.tsx
import { MessageCircleMore } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAccessToken } from '@/lib/api'

const WECHAT_AUTHORIZE_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize'
const OAUTH_STATE_STORAGE_KEY = 'crm_wechat_oauth_state'

function createWeChatAuthorizeUrl(state: string) {
  const corpId = import.meta.env.VITE_WECHAT_CORP_ID ?? 'WECHAT_CORP_ID_PLACEHOLDER'
  const redirectUri = import.meta.env.VITE_WECHAT_REDIRECT_URI ?? 'http://localhost:5173/auth/wechat/callback'

  const url = new URL(WECHAT_AUTHORIZE_URL)
  url.searchParams.set('appid', corpId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'snsapi_base')
  url.searchParams.set('state', state)

  return `${url.toString()}#wechat_redirect`
}

export default function LoginPage() {
  if (getAccessToken()) {
    return <Navigate replace to="/" />
  }

  function handleLogin() {
    const state = crypto.randomUUID()
    const authorizeUrl = createWeChatAuthorizeUrl(state)
    sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state)
    window.location.assign(authorizeUrl)
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 p-5 text-foreground">
      <Card className="w-full max-w-sm border-border shadow-sm">
        <CardHeader className="items-center pb-3 text-center">
          <div className="grid size-12 place-items-center rounded-lg bg-[#07c160] text-white">
            <MessageCircleMore aria-hidden="true" className="size-6" />
          </div>
          <CardTitle className="mt-4 text-xl">CRM 工作台</CardTitle>
          <CardDescription>使用企业微信账号安全登录</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full bg-[#07c160] hover:bg-[#06ad56]" onClick={handleLogin} type="button">
            企业微信登录
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
