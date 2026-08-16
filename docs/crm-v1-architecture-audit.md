# CRM V1.0 系统架构诊断与演进白皮书

> 审计基线：`b84ea29`  
> 审计范围：`apps/api/src`、`apps/web/src`、`packages/db/src/schema.ts`、数据库迁移与 CI/CD。  
> 代码规模：约 67 个核心文件、5,513 行代码。当前未发现自动化测试文件。

## 执行摘要

当前系统已经达到“单企业内部试运行 MVP”水平，但尚未达到可商用、多租户 SaaS 的安全与数据可信标准。

| 维度 | 评分 | 结论 |
| --- | ---: | --- |
| Serverless 架构 | 7/10 | 结构简洁、成本低，但仍是单 Worker、单 D1 的模块化单体 |
| CRM 业务闭环 | 6/10 | 客户、商机、赢单、续费已连通，缺少任务、审批、合同、回款和公海池 |
| 数据可信度 | 4/10 | 金额单位、看板分页统计存在会影响经营判断的严重问题 |
| 安全性 | 4/10 | 明文 PIN、无登录限流、任意 CORS、匿名图片上传必须优先修复 |
| 工程质量 | 5/10 | 类型检查完善，但零业务测试、无真正 ESLint、表单算法重复 |
| UI/UX | 7/10 | 桌面体验较成熟，移动端与部分高级交互仍存在覆盖缺口 |

### V1.5 之前必须解决的六项问题

1. 统一所有金额为“分”，修复元/分混算。
2. 修复商机看板只统计当前分页数据的问题。
3. 将 PIN 改为哈希存储并增加登录限流。
4. 给 `/api/storage/upload/image` 增加 JWT 保护。
5. 统一续费日期为 `Asia/Shanghai`，消除前后端跨日偏差。
6. 为续费与确认赢单加入幂等键和并发保护。

---

# Phase 1：架构与技术栈盘点

## 1.1 当前拓扑

```text
Cloudflare Pages
  React 19 + Vite + Tailwind + shadcn/ui
  TanStack Query + Recharts + PWA
          |
          | Authorization: Bearer JWT
          v
Cloudflare Worker / Hono
  auth / customers / deals / activities
  dashboard / users / configs / storage
          |
          +-- D1：业务数据、系统配置
          +-- KV：企业微信 access_token
          +-- Supabase S3：合同附件
          +-- GitHub Contents：图片文件
          +-- 企业微信 API：续费提醒
```

Worker 入口将八组路由挂到同一个 Hono 实例：`apps/api/src/index.ts`。这属于合理的“模块化单体”，当前规模没有必要拆成多个 Worker。

CI 顺序是“D1 migration → API Worker → Web Pages”，且 Web 依赖 API 部署完成：`.github/workflows/deploy.yml`。顺序控制正确，但在执行迁移前没有测试或 Worker dry-run；破坏性迁移可能先于应用验证落库。

## 1.2 API 路由结构

- `/api/auth/login`：本地密码登录。
- `/api/customers`：客户 CRUD、直接成交、续费、360 度详情。
- `/api/deals`：商机 CRUD、确认赢单。
- `/api/activities`：跟进列表与新增。
- `/api/dashboard`：指标、漏斗、续费中心。
- `/api/storage`：GitHub 图片、S3 预签名上传、预览与删除。
- `/api/configs`：公共地图配置与管理员系统配置。
- `/api/users`：员工管理。
- Cron：每天北京时间 09:30 执行续费提醒。

路由边界清楚，但 `customers.ts` 已达 393 行、`deals.ts` 385 行，业务编排、验证、权限和持久化混在同一层，下一阶段应引入 service/use-case 层。

## 1.3 ER 逻辑

```text
users 1 ── N customers
users 1 ── N activities
users N ── N deals       via deal_splits

customers 1 ── N deals
customers 1 ── N activities
customers 1 ── N attachments
activities 1 ── N attachments
deals 1 ── N activities
deals 1 ── N deal_splits

system_configs：独立键值配置表
```

核心关系定义位于 `packages/db/src/schema.ts`。

“一客一期、多单流水”的方向正确：

- `customers.saasExpireDate` 表示客户当前唯一 SaaS 到期日。
- `deals.dealType` 区分 `New` 与 `Renewal`。
- 每次续费生成新的 Deal 流水。

但 `deals.expireDate` 仍存在，并在首次赢单、直接成交中继续写入。当前实际上是“客户当前值 + Deal 历史快照”的双字段模型。必须正式定义 `deals.expireDate` 为不可变的 `contract_expire_snapshot`，或者彻底废弃，否则后续开发仍可能错误读取它。

## 1.4 D1 扩展性评估

当前数据量在几十万客户以内可以继续使用 D1，但有四个明确瓶颈：

- `%关键词%` 的 `LIKE` 查询无法有效利用 `customers_name_idx`。应采用前缀检索或评估 SQLite FTS。
- `LIMIT/OFFSET + COUNT(*)` 在深分页时成本持续上升，应演进为基于 `created_at,id` 的游标分页。
- 续费中心先查客户，再取这些客户的全部历史 Won Deal 并在 Worker 内去重。客户历史订单增长后会放大读取量，应改成 SQL window function 或相关子查询。
- 缺少 `customers(saas_expire_date,is_deleted)`、`deals(customer_id,is_deleted,created_at)` 等复合索引。

D1 适合事务短、读模型简单的 CRM OLTP；复杂同比、漏斗转化、销售排名、回款分析应异步汇总到日/月事实表，不能长期直接扫业务明细表。

---

# Phase 2：业务逻辑与产品体验诊断

## 2.1 已完成的业务闭环

```text
客户建档
  → 新建商机
  → Leads / Qualified / Proposal
  → 确认赢单、利润核算、订单分成
  → 客户当前服务到期日
  → Dashboard/Cron 续费预警
  → 一键续费生成 Renewal Deal
```

客户、商机、活动记录、附件和续费已经形成真实数据关系，不是单纯 UI Demo。普通销售查询客户、商机、Dashboard 时均有 `owner_id` 过滤，基础行级隔离成立。

## 2.2 关键业务缺口

### P0：金额口径不可信

商机和续费表单将 `amount` 标为“元”，成本与利润标为“分”，随后直接相减：

- `apps/web/src/components/customers/DirectWonCustomerModal.tsx`
- `apps/api/src/routes/customers.ts`
- `apps/web/src/components/deals/SaaSDealWonModal.tsx`

Dashboard 又把利润除以 100 展示，但 Deal 金额直接传给人民币格式化器。

这不是显示瑕疵，而是会产生错误利润、错误分成和错误报表的 P0 数据问题。数据库所有金额字段必须统一为“分”，前端只负责元↔分转换。

### P0：看板不是全量管道

`DealsPage` 请求分页 API，然后使用 `data.data` 计算总金额、各列数量和列金额。因此页面显示的是“当前 10 条的看板”，并非完整 Pipeline。

成熟 CRM 看板不应直接使用普通列表分页契约，应提供：

- 每阶段独立游标与卡片列表；
- 全量阶段聚合 `{ count, totalAmount }`；
- 每列独立加载更多。

### P1：缺少标准 CRM 中间层

目前客户直接连接商机，尚缺：

- 独立 Lead 与 Lead→Customer 转化、重复客户合并。
- 多联系人、联系人职务、决策角色和关键人关系。
- 下一步行动、任务、提醒、日历和逾期任务。
- 输单原因、成交概率、预计收入与 Forecast。
- 报价单、合同、开票、回款、退款和应收账款。
- 特价、折扣、成本和分成审批流。
- 公海池、超时回收、领取、转移与撞单规则。
- 团队、部门、主管、区域和产品线权限。
- 标签、自定义字段、客户分层和健康度评分。

## 2.3 续费模型评价

智能续费基准规则总体合理，但存在三个生产风险：

- 前端使用本地 `startOfDay`，后端使用 UTC 日界线；北京时间凌晨 00:00–08:00 可能计算出不同基准日。
- `db.batch()` 保证写入原子性，但客户到期日是在 batch 前读取。两个并发请求可能基于同一旧日期生成两笔续费。
- 没有 `Idempotency-Key`、请求流水号或唯一约束，移动端重复点击、网络重试可能重复续费。

建议用 `renewal_request_id` 唯一索引、条件更新版本号和服务端 `Asia/Shanghai` 日期函数解决。

## 2.4 UX 成熟度

### 做得较好

- 桌面 Sidebar + Header + Breadcrumb 已形成稳定 App Shell。
- 客户详情为三栏 360 度视图，快捷跟进和资产面板信息层级清楚。
- Sheet、Dialog、移动端底部导航具备上下文保持能力。
- `useIsMobile()` 使用独立 DOM 分支，复杂页面不再强行压缩桌面表格。
- Cmd+K、续费 Sheet、Toast、React Query 刷新闭环已经落地。

### 仍未达到 HubSpot/Pipedrive 的部分

- 当前“Kanban”没有拖拽，阶段流转仍依赖编辑或确认赢单按钮。
- 移动端 `MobileShell` 不渲染 `CommandPalette`。
- Cmd+K 只搜索客户，不搜索商机，且输入未防抖。
- 客户、员工表格的 Checkbox 没有选中状态和批量操作，属于误导性占位 UI。
- 销售可看到“员工管理”菜单，但 `/users` 又被 `AdminRoute` 拦截；导航缺少 `adminOnly`。
- 登录成功直接进入 `/deals`，而应用默认路由是 `/dashboard`，首屏策略不一致。
- PWA 目前只是安装能力，没有离线草稿、失败重试和后台同步，外勤场景价值有限。

---

# Phase 3：技术债与工程化体检

## 3.1 高风险安全问题

### 1. 明文 PIN 与弱认证

`users.pin_code` 明文保存且默认 `123456`。登录还允许姓名匹配。

同时缺少：

- Argon2id/PBKDF2 哈希；
- 登录失败限流与锁定；
- 密码复杂度；
- Token 撤销和 refresh token；
- 管理员重置后的强制改密；
- MFA。

JWT 存在 `localStorage`，任何 XSS 都可读取。商用版本应改为短时 access token + HttpOnly refresh cookie，并配置 CSP。

### 2. CORS 反射任意 Origin

后端直接返回请求 Origin，同时开启 credentials。当前 Bearer Token 模式下 credentials 没有价值；未来一旦启用 Cookie，这会成为严重跨域风险。

应使用明确 allowlist：生产 Pages 域名、正式自定义域名和本地开发域名。

### 3. 匿名图片上传

`storage.use()` 只保护 `/presign/*` 和 `/attachments*`，但 `/upload/image` 未经过 JWT。攻击者可匿名消耗 Worker、GitHub API 和仓库容量。

### 4. 动态配置没有真正接通企微

设置页写入 `wechat_corp_id`、`wechat_corp_secret`，而消息服务仍读取 `env.CORP_ID/env.CORP_SECRET`。

管理员看到“保存成功”，但 Cron 实际配置没有变化。并且 Cron 将内部 UUID `users.id` 当作企微 UserID 发送；新建员工应使用 `users.wechatUserId`，否则推送会失败。

## 3.2 后端健壮性

SQL 注入风险较低。查询主要通过 Drizzle 参数绑定；`LIKE` 内容也是参数化值。Cron 中 raw SQL 使用固定结构和 Schema 列引用，没有用户输入。

更现实的风险是：

- 无全局 `app.onError()`，错误响应结构不统一。
- `/health` 只检查 `Boolean(db)`，没有真正执行 D1 查询，健康检查会产生假阳性。
- Presign 错误把底层 `error.message` 返回前端，可能泄露供应商和签名配置信息。
- 缺少 request ID、结构化审计日志、错误码和可观测指标。
- 确认赢单可被重复调用，可能重复写入 `deal_splits`；表中也没有 `(deal_id,user_id)` 唯一约束。
- Cron 在提醒窗口内每天发送，缺少通知发送记录和去重，销售可能收到连续提醒。

## 3.3 前端技术债

- `CustomerDetailPage.tsx`、`DirectWonCustomerSheet`、`SaaSDealWonModal` 同时承担数据请求、表单状态、文件上传和展示。
- 日期计算、利润计算、分成校验至少复制三次，且分别混用原生 Date 与 date-fns。
- 大型表单维护 10–15 个 `useState`；只有设置页采用 react-hook-form。
- 已安装 `zustand` 但未使用，应删除依赖，而不是为了使用而引入全局状态。
- `QueryClient` 没有统一 `staleTime`、retry 和 mutation error 策略，页面间存在重复请求。
- API DTO 在前后端手工维护，没有共享 Zod schema/Hono RPC，字段漂移风险高。
- `lint` 实际只是 `tsc`，没有 ESLint、复杂度规则或未处理 Promise 规则。
- 最近生产构建约 1,007 KB minified、304 KB gzip；Recharts、AMap、管理页面均进入主包。应进行路由级 lazy import 和 vendor chunk 拆分。

## 3.4 测试与发布

仓库没有业务测试文件，这是当前最大的工程化缺口。

优先测试矩阵：

1. RBAC：销售 A 绝不能读取、编辑、上传到销售 B 客户。
2. 金额：元/分转换、利润与分成边界。
3. 日期：未过期、今日到期、逾期、2 月 29 日、北京时间凌晨。
4. 幂等：续费与确认赢单双击/重试。
5. 附件：预签名、登记失败补偿、删除失败补偿。
6. Cron：提醒窗口、企微 UserID、重复发送去重。

CI 应调整为：

```text
install
→ typecheck/lint/unit/integration
→ Worker dry-run + Web build
→ D1 expand migration
→ deploy API
→ smoke test
→ deploy Web
```

---

# Phase 4：V1.5–V2.0 战略路线图

## 战略 1：数据可信与安全基线（V1.5，最高优先）

- 全库金额统一为分，字段命名使用 `amount_cents` 或共享 Money 类型。
- PIN 迁移为 PBKDF2/Argon2id 哈希，增加 rate limit、登录审计和强制改密。
- 修复 CORS、匿名图片上传、企微配置与 `wechatUserId`。
- 为续费、赢单增加 `idempotency_key`、唯一约束和乐观锁版本。
- 增加 `audit_logs`：操作者、对象、操作、前后值、时间、IP/request ID。

验收标准：财务数字可核对、重复请求不会重复成交、越权测试全部拒绝。

## 战略 2：合同与回款资产中心（V1.5）

不要只做附件列表，应建立正式领域模型：

```text
contracts
contract_versions
invoices
payments
receivables
attachment_assets
```

文件统一迁移至 Cloudflare R2，使用私有 Bucket、短期预签名、SHA-256、文件大小、MIME、版本号和上传状态。为未登记的孤儿对象增加定时清理任务。

客户 360 视图增加“合同—开票—回款—服务期”资产链，支持合同到期、欠款和回款状态。

## 战略 3：任务、公海池与审批引擎（V1.5–V1.8）

新增：

- `tasks`、`reminders`、`next_action_at`；
- 公海池、领取、分配、超时回收；
- 客户转移与撞单检测；
- 特价、折扣、低利润、退款审批；
- 输单原因与商机停滞提醒。

这比继续增加 Dashboard 图表更能提高销售执行效率。

## 战略 4：组织级 RBAC 与多租户隔离（V1.8）

当前只有 `admin/sales`，且没有 `tenant_id`，本质是单企业内部系统。

目标模型：

```text
organizations
departments
teams
memberships
roles
permissions
data_scopes: self | team | department | all
```

所有业务表增加 `organization_id`，JWT 携带 `org_id`，每个查询同时强制组织和数据范围条件。主管只能看本团队，财务只能看订单财务，管理员管理组织配置。

权限必须由后端 policy 层统一实现，不能继续在每条路由手工拼 `actor.role !== 'admin'`。

## 战略 5：数据与自动化平台（V2.0）

- CSV/XLSX 导入：模板校验、字段映射、预览、重复检测、错误行回执、异步任务。
- 导出：按当前筛选条件导出，敏感字段脱敏和导出审计。
- 通知 Outbox：Cron 只生成事件，由 Queue 消费企微/飞书/邮件，支持重试、去重和送达记录。
- 自动化规则：阶段变化、长时间未跟进、续费临近、回款逾期触发动作。
- 报表事实表：每日漏斗、销售绩效、回款、续费率、MRR/ARR、毛利与流失率。

---

# 最终判断

这套代码不是“推倒重来”的项目。Monorepo、Hono 路由、D1 Schema、React Query、360 视图以及客户级续费模型都具备继续演进的价值。

但目前最危险的误区是继续用 UI 功能数量衡量成熟度。真正阻碍商业化的不是缺少更多页面，而是：

- 财务单位不统一；
- 看板统计不是全量；
- 密码与上传安全不达标；
- 续费缺少幂等和统一时区；
- 企微动态配置没有接通；
- 没有自动化测试和审计日志。

建议下一迭代命名为 **V1.5 Reliability & Trust**，先完成数据可信、安全、幂等、测试与资产模型，再进入自动化和多租户 V2.0。
