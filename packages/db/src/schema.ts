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
    pinCode: text('pin_code').notNull().default('123456'),
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

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    contactPhone: text('contact_phone'),
    status: text('status').notNull(),
    lng: real('lng'),
    lat: real('lat'),
    address: text('address'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('customers_name_idx').on(table.name),
    index('customers_owner_id_idx').on(table.ownerId),
  ],
)

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    amount: integer('amount').notNull(),
    productName: text('product_name').notNull().default('未填写产品'),
    stage: text('stage', { enum: dealStages }).notNull(),
    expectedCloseDate: integer('expected_close_date', { mode: 'timestamp' }).notNull(),
    startDate: integer('start_date', { mode: 'timestamp' }),
    durationYears: integer('duration_years'),
    giftMonths: integer('gift_months').notNull().default(0),
    expireDate: integer('expire_date', { mode: 'timestamp' }),
    renewalReminderDays: integer('renewal_reminder_days').notNull().default(30),
    softwareCost: integer('software_cost'),
    taxCost: integer('tax_cost'),
    rebateAmount: integer('rebate_amount'),
    netProfit: integer('net_profit'),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('deals_customer_id_idx').on(table.customerId),
    index('deals_stage_idx').on(table.stage),
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
  splitAmount: integer('split_amount').notNull(),
})

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  dealId: text('deal_id')
    .notNull()
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
})

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
