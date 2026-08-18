// packages/db/src/schema.ts
import { sql } from 'drizzle-orm'
import {
  integer,
  index,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

export const dealStages = [
  'Leads',
  'Qualified',
  'Proposal',
  'Won',
  'Lost',
] as const

export const activityTypes = ['Call', 'Meeting', 'Email'] as const
export const customerStatuses = ['Active', 'Following', 'Inactive'] as const

export const contractStatuses = ['Draft', 'Active', 'Expired', 'Terminated', 'Void'] as const
export const invoiceStatuses = ['Draft', 'Issued', 'Voided'] as const
export const paymentStatuses = ['Pending', 'Received', 'Reversed'] as const
export const assetTypes = ['Contract', 'Invoice', 'PaymentProof'] as const
export const assetUploadStatuses = ['Pending', 'Uploaded', 'Failed', 'Deleted'] as const
export const notificationTypes = ['RenewalReminder', 'TaskUpcomingReminder', 'TaskDueReminder', 'TaskOverdueReminder'] as const
export const taskStatuses = ['Open', 'Completed'] as const
export const taskPriorities = ['Low', 'Normal', 'High'] as const
export const auditActions = ['Created', 'Updated', 'Deleted', 'Won', 'Renewed'] as const

export const users = sqliteTable(
  'users',
  {
    // Internal immutable identifier. Existing Enterprise WeChat identifiers remain valid IDs.
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    username: text('username'),
    wechatUserId: text('wechat_userid'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull(),
    pinHash: text('pin_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_wechat_userid_unique').on(table.wechatUserId),
  ],
)

export const systemConfigs = sqliteTable('system_configs', {
  configKey: text('config_key').primaryKey(),
  configValue: text('config_value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const notificationLogs = sqliteTable(
  'notification_logs',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: notificationTypes }).notNull(),
    referenceId: text('reference_id').notNull(),
    recipientUserId: text('recipient_user_id').notNull(),
    reminderDate: text('reminder_date').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('notification_logs_dedupe_unique').on(
      table.type,
      table.referenceId,
      table.recipientUserId,
      table.reminderDate,
    ),
    index('notification_logs_reference_idx').on(table.referenceId),
  ],
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: auditActions }).notNull(),
    beforeValue: text('before_value'),
    afterValue: text('after_value'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('audit_logs_entity_idx').on(table.entityType, table.entityId, table.createdAt),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
)

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    contactPhone: text('contact_phone'),
    status: text('status', { enum: customerStatuses }).notNull(),
    lng: real('lng'),
    lat: real('lat'),
    address: text('address'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    saasExpireDate: integer('saas_expire_date', { mode: 'timestamp' }),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('customers_name_idx').on(table.name),
    index('customers_owner_id_idx').on(table.ownerId),
  ],
)

export const customerTags = sqliteTable(
  'customer_tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('customer_tags_name_unique').on(table.name),
  ],
)

export const customerTagAssignments = sqliteTable(
  'customer_tag_assignments',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id),
    tagId: text('tag_id').notNull().references(() => customerTags.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('customer_tag_assignments_unique').on(table.customerId, table.tagId),
    index('customer_tag_assignments_tag_customer_idx').on(table.tagId, table.customerId),
  ],
)

export const contacts = sqliteTable(
  'contacts',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    position: text('position'),
    phone: text('phone'),
    email: text('email'),
    wechat: text('wechat'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('contacts_customer_id_idx').on(table.customerId),
    index('contacts_customer_primary_idx').on(table.customerId, table.isPrimary),
  ],
)

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    amountCents: integer('amount_cents').notNull(),
    channel: text('channel'),
    originalPriceCents: integer('original_price_cents'),
    dealType: text('deal_type').notNull().default('New'),
    productName: text('product_name').notNull().default('未填写产品'),
    stage: text('stage', { enum: dealStages }).notNull(),
    probability: integer('probability').notNull().default(10),
    lostReason: text('lost_reason'),
    expectedCloseDate: integer('expected_close_date', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    startDate: integer('start_date', { mode: 'timestamp' }),
    durationYears: integer('duration_years'),
    giftMonths: integer('gift_months').notNull().default(0),
    expireDate: integer('expire_date', { mode: 'timestamp' }),
    renewalReminderDays: integer('renewal_reminder_days').notNull().default(30),
    softwareCostCents: integer('software_cost_cents'),
    taxCostCents: integer('tax_cost_cents'),
    rebateAmountCents: integer('rebate_amount_cents'),
    netProfitCents: integer('net_profit_cents'),
    idempotencyKey: text('idempotency_key'),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('deals_customer_id_idx').on(table.customerId),
    index('deals_stage_idx').on(table.stage),
    uniqueIndex('deals_idempotency_key_unique').on(table.idempotencyKey),
    index('deals_stage_deleted_created_id_idx').on(
      table.stage,
      table.isDeleted,
      table.createdAt,
      table.id,
    ),
  ],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    dealId: text('deal_id').references(() => deals.id),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: text('assignee_id')
      .notNull()
      .references(() => users.id),
    dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
    priority: text('priority', { enum: taskPriorities }).notNull().default('Normal'),
    status: text('status', { enum: taskStatuses }).notNull().default('Open'),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('tasks_customer_id_idx').on(table.customerId),
    index('tasks_assignee_status_due_idx').on(table.assigneeId, table.status, table.dueAt),
    index('tasks_deal_id_idx').on(table.dealId),
  ],
)

export const dealSplits = sqliteTable('deal_splits', {
  id: text('id').primaryKey(),
  dealId: text('deal_id')
    .notNull()
    .references(() => deals.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  splitAmountCents: integer('split_amount_cents').notNull(),
})

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  dealId: text('deal_id')
    .references(() => deals.id),
  type: text('type', { enum: activityTypes }).notNull(),
  notes: text('notes'),
  checkInLng: real('check_in_lng'),
  checkInLat: real('check_in_lat'),
  checkInAddress: text('check_in_address'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  index('activities_customer_id_idx').on(table.customerId),
  index('activities_deal_id_idx').on(table.dealId),
])

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    activityId: text('activity_id')
      .references(() => activities.id),
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('attachments_file_key_unique').on(table.fileKey),
    index('attachments_customer_id_idx').on(table.customerId),
    index('attachments_activity_id_idx').on(table.activityId),
  ],
)

export const contracts = sqliteTable(
  'contracts',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id),
    dealId: text('deal_id').notNull().references(() => deals.id),
    contractNumber: text('contract_number').notNull(),
    title: text('title').notNull(),
    status: text('status', { enum: contractStatuses }).notNull().default('Draft'),
    totalAmountCents: integer('total_amount_cents').notNull(),
    signedAt: integer('signed_at', { mode: 'timestamp' }),
    effectiveStartDate: integer('effective_start_date', { mode: 'timestamp' }),
    effectiveEndDate: integer('effective_end_date', { mode: 'timestamp' }),
    paymentDueAt: integer('payment_due_at', { mode: 'timestamp' }),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('contracts_contract_number_unique').on(table.contractNumber),
    index('contracts_customer_id_idx').on(table.customerId),
    index('contracts_deal_id_idx').on(table.dealId),
    index('contracts_status_idx').on(table.status),
  ],
)

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id),
    dealId: text('deal_id').notNull().references(() => deals.id),
    contractId: text('contract_id').notNull().references(() => contracts.id),
    invoiceNumber: text('invoice_number'),
    title: text('title').notNull(),
    content: text('content').notNull(),
    status: text('status', { enum: invoiceStatuses }).notNull().default('Draft'),
    amountCents: integer('amount_cents').notNull(),
    taxAmountCents: integer('tax_amount_cents').notNull().default(0),
    issuedAt: integer('issued_at', { mode: 'timestamp' }),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('invoices_invoice_number_unique').on(table.invoiceNumber),
    index('invoices_customer_id_idx').on(table.customerId),
    index('invoices_deal_id_idx').on(table.dealId),
    index('invoices_contract_id_idx').on(table.contractId),
    index('invoices_status_idx').on(table.status),
  ],
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id),
    dealId: text('deal_id').notNull().references(() => deals.id),
    contractId: text('contract_id').notNull().references(() => contracts.id),
    invoiceId: text('invoice_id').references(() => invoices.id),
    paymentNumber: text('payment_number').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status', { enum: paymentStatuses }).notNull().default('Pending'),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    note: text('note'),
    claimedBy: text('claimed_by').notNull().references(() => users.id),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('payments_payment_number_unique').on(table.paymentNumber),
    index('payments_customer_id_idx').on(table.customerId),
    index('payments_deal_id_idx').on(table.dealId),
    index('payments_contract_id_idx').on(table.contractId),
    index('payments_invoice_id_idx').on(table.invoiceId),
    index('payments_status_paid_at_idx').on(table.status, table.paidAt),
  ],
)

export const attachmentAssets = sqliteTable(
  'attachment_assets',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id').notNull().references(() => customers.id),
    dealId: text('deal_id').notNull().references(() => deals.id),
    contractId: text('contract_id').references(() => contracts.id),
    invoiceId: text('invoice_id').references(() => invoices.id),
    paymentId: text('payment_id').references(() => payments.id),
    assetType: text('asset_type', { enum: assetTypes }).notNull(),
    uploadStatus: text('upload_status', { enum: assetUploadStatuses }).notNull().default('Pending'),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes'),
    contentHash: text('content_hash'),
    version: integer('version').notNull().default(1),
    uploadedBy: text('uploaded_by').notNull().references(() => users.id),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('attachment_assets_object_key_unique').on(table.objectKey),
    index('attachment_assets_customer_id_idx').on(table.customerId),
    index('attachment_assets_deal_id_idx').on(table.dealId),
    index('attachment_assets_contract_id_idx').on(table.contractId),
    index('attachment_assets_invoice_id_idx').on(table.invoiceId),
    index('attachment_assets_payment_id_idx').on(table.paymentId),
    index('attachment_assets_status_idx').on(table.uploadStatus),
  ],
)
