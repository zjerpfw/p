// apps/api/src/env.ts
export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  CORP_ID: string
  CORP_SECRET: string
  WECHAT_AGENT_ID: string
  FRONTEND_URL: string
  JWT_SECRET: string
  GITHUB_OWNER: string
  GITHUB_REPOSITORY: string
  GITHUB_TOKEN: string
  SUPABASE_S3_ENDPOINT: string
  SUPABASE_S3_BUCKET: string
  SUPABASE_S3_REGION: string
  SUPABASE_S3_ACCESS_KEY_ID: string
  SUPABASE_S3_SECRET_ACCESS_KEY: string
  WECOM_BOT_GATEWAY: Fetcher
}
