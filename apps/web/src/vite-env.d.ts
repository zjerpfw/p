// apps/web/src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WECHAT_CORP_ID?: string
  readonly VITE_WECHAT_REDIRECT_URI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
