// packages/db/src/schema.ts
import {
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

export const dealStages = [
  'Leads',
  'Qualified',
  'Proposal',
  'Won',
  'Lost',
] as const

export const activityTypes = ['Call', 'Meeting', 'Email'] as const

export const users = sqliteTable('users', {
  // Enterprise WeChat UserId.
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull(),
})

export const customers = sqliteTable('customers', {
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id),
  amount: integer('amount').notNull(),
  stage: text('stage', { enum: dealStages }).notNull(),
  expectedCloseDate: integer('expected_close_date', { mode: 'timestamp' }).notNull(),
  startDate: integer('start_date', { mode: 'timestamp' }),
  durationYears: integer('duration_years'),
  expireDate: integer('expire_date', { mode: 'timestamp' }),
  renewalReminderDays: integer('renewal_reminder_days').notNull().default(30),
  softwareCost: integer('software_cost'),
  taxCost: integer('tax_cost'),
  rebateAmount: integer('rebate_amount'),
  netProfit: integer('net_profit'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

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
