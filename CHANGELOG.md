# Changelog

## [1.5.0] - 2026-08-16

### V1.5 Reliability & Trust

本版本聚焦 CRM 的数据可靠性、安全基线与财务资产管理，统一金额口径，强化认证、上传与权限控制，并建立合同、开票、回款资产链路。

### Security & Auth

- 使用 WebCrypto PBKDF2 对员工 PIN 进行加盐哈希存储，并提供存量账号回填机制。
- 登录接口优先校验密码哈希，并加入基础登录失败限流。
- 收紧 API CORS 配置，仅允许显式配置的生产前端域名与本地开发地址。
- 为图片上传、附件预签名、资产上传确认等存储接口增加 JWT 认证保护。
- 合同、发票、回款与资产附件统一实施基于 `customers.owner_id` 的 RBAC：销售仅能操作自己客户的资产，管理员可访问全量资产。
- Supabase S3 私有 Bucket 使用短期预签名 URL，前端不接触 S3 密钥。

### Data Integrity

- 全局金额字段统一为整数分，覆盖商机、成本、利润、合同、发票、税额与回款。
- 提供历史金额迁移，将旧整数元数据转换为整数分。
- 前端统一通过 `yuanToCents` 在输入边界将元转换为分，通过 `formatCents` 在展示边界格式化为人民币两位小数。
- 商机看板改为独立管道接口：全量阶段聚合与按列游标分页分离，列头金额不再依赖当前分页卡片。
- 为高频商机管道查询补充复合索引。
- 新增 `shanghai-date` 日期工具，续费基准日、续费开始日与新到期日均锁定 `Asia/Shanghai` 日历日计算，消除 Worker UTC 环境造成的跨日偏差。
- 为 `deals.idempotency_key` 新增全局唯一索引。续费和确认赢单请求必须携带 UUID 请求键，重复请求不会重复创建续费订单或分成流水。

### Contracts & Finance

- 新增 `contracts`、`invoices`、`payments` 与 `attachment_assets` 资产领域表。
- 新增合同、开票、回款 CRUD API；创建开票或回款时从合同强制继承客户与商机归属。
- 合同实时聚合合同总额、已到账回款与待回款金额。
- 回款支持先回款后开票；关联发票时校验发票和合同一致。
- 已有关联回款的合同或发票禁止删除，避免财务流水悬空。
- 客户 360 度视图新增“合同与财务”面板，按合同显示开票与回款流水。
- 新增合同、开票、回款两步式登记抽屉，并按客户归属展示操作入口。

### Secure Asset Upload

- 新增两阶段私有资产上传：创建 `Pending` 资产记录并签发 PUT URL，直传完成后服务端以 `HeadObject` 校验并确认。
- 新增 `SecureAssetUploader`，支持 PDF、PNG、JPEG、WebP，单文件最大 50 MiB。
- 使用 XHR 展示实时上传进度，并覆盖授权、网络、直传、确认等失败反馈。
- 合同扫描件、发票文件及打款凭证均可在相应业务记录创建后安全直传。

### Validation

- `pnpm --filter @crm/db build`
- `pnpm --filter @crm/db exec drizzle-kit check`
- `pnpm --filter @crm/api check`
- `pnpm --filter @crm/api build`
- `pnpm --filter @crm/web build`

### Release Notes

- 部署前需执行 D1 迁移至 `0019_deals_idempotency_key`。
- Web 生产构建仍存在大于 500 kB 的 bundle 提示，后续应按页面和图表库拆包。
