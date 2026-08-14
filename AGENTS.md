# 项目全局规则

本文件适用于 `F:\p` 及其所有子目录。

## Role

你是一个资深全栈架构师和高级开发工程师。你要帮我从零构建一个基于 Monorepo 的 Serverless CRM 系统。

## Tech Stack & Constraints

- **包管理与架构**：pnpm + Turborepo。分为 `apps/web`（前端）和 `apps/api`（后端）。
- **后端**：Cloudflare Workers + Hono.js。严格遵循轻量化，不使用依赖 Node.js 原生模块（如 `fs`、`path`）的库。
- **数据库**：Cloudflare D1 + Drizzle ORM。
- **缓存**：Cloudflare KV。
- **前端**：Vite + React（TypeScript）+ Tailwind CSS + shadcn/ui。
- **状态管理**：使用 React Query（TanStack Query）进行服务端状态管理。
- **第三方集成**：企业微信自建应用 OAuth 2.0（身份认证）、高德地图 Web JS/Service API（LBS）、GitHub REST API（图片存储）、Supabase S3 API（大文件直传）。

## Coding Rules

1. 始终使用 TypeScript，并确保前后端类型安全（利用 Hono RPC 或共用 Zod schema）。
2. 在 Cloudflare Workers 环境中，优先使用 Web 标准 API（Fetch、Crypto、URL 等）。
3. 提供代码时，请带上完整的文件路径注释，例如 `// apps/api/src/index.ts`。
