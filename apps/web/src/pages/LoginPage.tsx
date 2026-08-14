// apps/web/src/pages/LoginPage.tsx
const WECHAT_AUTHORIZE_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize'
const OAUTH_STATE_STORAGE_KEY = 'crm_wechat_oauth_state'

function createWeChatAuthorizeUrl(state: string) {
  const corpId = import.meta.env.VITE_WECHAT_CORP_ID
  const redirectUri = import.meta.env.VITE_WECHAT_REDIRECT_URI

  if (!corpId || !redirectUri) {
    return null
  }

  const url = new URL(WECHAT_AUTHORIZE_URL)
  url.searchParams.set('appid', corpId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'snsapi_base')
  url.searchParams.set('state', state)

  return `${url.toString()}#wechat_redirect`
}

export default function LoginPage() {
  const isConfigured = Boolean(
    import.meta.env.VITE_WECHAT_CORP_ID && import.meta.env.VITE_WECHAT_REDIRECT_URI,
  )

  function handleLogin() {
    const state = crypto.randomUUID()
    const authorizeUrl = createWeChatAuthorizeUrl(state)
    if (authorizeUrl) {
      sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state)
      window.location.assign(authorizeUrl)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950">
      <section className="w-full max-w-sm border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-emerald-700">Serverless CRM</p>
        <h1 className="mt-2 text-2xl font-semibold">登录工作台</h1>
        <button
          className="mt-8 w-full bg-emerald-700 px-4 py-2.5 font-medium text-white enabled:hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!isConfigured}
          onClick={handleLogin}
          type="button"
        >
          企业微信登录
        </button>
        {!isConfigured && (
          <p className="mt-3 text-sm text-red-700">请配置企业微信登录环境变量。</p>
        )}
      </section>
    </main>
  )
}
