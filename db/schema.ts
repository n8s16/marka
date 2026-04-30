// Drizzle schema for Marka.
//
// The authoritative entity shapes and rules live in docs/DATA_MODEL.md. Read
// that first if anything here surprises you. Conventions enforced here:
//
//   - Tables are snake_case and singular (`wallet`, not `wallets`).
//   - IDs are UUID v4, generated client-side via utils/uuid.ts and stored as
//     text. The database never auto-increments.
//   - Currency is integer minor units (centavos). Never floats.
//   - Dates: full ISO 8601 strings for timestamps; YYYY-MM-DD for date-only;
//     YYYY-MM strings for periods.
//   - Booleans use integer({ mode: 'boolean' }) so they round-trip through
//     SQLite's INTEGER affinity cleanly.
//   - Every table has created_at/updated_at, both NOT NULL, populated via
//     Drizzle defaults rather than SQL DEFAULT clauses (so the values are
//     always JS-side ISO strings rather than SQLite's CURRENT_TIMESTAMP
//     space-separated form).
//   - Soft delete via `archived` flag on reference tables; event tables have
//     no archive flag (deleting a payment/expense/transfer is a content edit,
//     not an account-level decision).
//
// Foreign keys use real references() with onDelete actions per DATA_MODEL.
// The (bill_id, period) unique index on bill_payment is the schema-level
// enforcement of the period-uniqueness rule.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const nowIso = () => new Date().toISOString();

// ─── Reference tables ────────────────────────────────────────────────────────

export const wallet = sqliteTable('wallet', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon'),
  type: text('type', { enum: ['e_wallet', 'bank', 'cash'] }).notNull(),
  show_balance: integer('show_balance', { mode: 'boolean' }).notNull().default(false),
  // Only meaningful when show_balance is true. Centavos.
  opening_balance: integer('opening_balance'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull().$defaultFn(nowIso),
  updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
});

export const bill = sqliteTable(
  'bill',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Centavos.
    expected_amount: integer('expected_amount').notNull(),
    frequency: text('frequency', {
      enum: ['monthly', 'quarterly', 'yearly', 'custom'],
    }).notNull(),
    // Required when frequency = 'custom'; null otherwise. Validation lives in
    // /logic, not at the DB layer.
    interval_months: integer('interval_months'),
    // 1–31. Clamping to last-day-of-month happens in /logic/periods.ts; do
    // NOT add a CHECK constraint here that would reject due_day = 31.
    due_day: integer('due_day').notNull(),
    // YYYY-MM. Anchors the bill's first due-month.
    start_period: text('start_period').notNull(),
    default_wallet_id: text('default_wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'restrict' }),
    reminder_offset_days: integer('reminder_offset_days').notNull(),
    // Time-of-day "HH:MM". Stored as text since SQLite has no time type and
    // we want exact preservation.
    reminder_time: text('reminder_time').notNull(),
    auto_forecast: integer('auto_forecast', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    created_at: text('created_at').notNull().$defaultFn(nowIso),
    updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
  },
);

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  sort_order: integer('sort_order').notNull(),
  created_at: text('created_at').notNull().$defaultFn(nowIso),
  updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
});

// ─── Event tables ────────────────────────────────────────────────────────────

export const bill_payment = sqliteTable(
  'bill_payment',
  {
    id: text('id').primaryKey(),
    bill_id: text('bill_id')
      .notNull()
      .references(() => bill.id, { onDelete: 'cascade' }),
    wallet_id: text('wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'restrict' }),
    // Centavos. Actual paid amount; may differ from bill.expected_amount.
    amount: integer('amount').notNull(),
    // YYYY-MM-DD.
    paid_date: text('paid_date').notNull(),
    // YYYY-MM. The period this payment covers (NOT the date paid).
    period: text('period').notNull(),
    note: text('note'),
    created_at: text('created_at').notNull().$defaultFn(nowIso),
    updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
  },
  (t) => ({
    // Unique per DATA_MODEL.md: only one paid record per bill+period.
    // This is also the most common lookup, so the unique index doubles as
    // the read path.
    bill_period_unique: uniqueIndex('bill_payment_bill_id_period_unique').on(
      t.bill_id,
      t.period,
    ),
    paid_date_idx: index('bill_payment_paid_date_idx').on(t.paid_date),
  }),
);

export const expense = sqliteTable(
  'expense',
  {
    id: text('id').primaryKey(),
    description: text('description').notNull(),
    // Centavos. Nullable: some entries are amount-less placeholders (per DATA_MODEL.md).
    amount: integer('amount'),
    category_id: text('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
    wallet_id: text('wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'restrict' }),
    // YYYY-MM-DD.
    date: text('date').notNull(),
    note: text('note'),
    created_at: text('created_at').notNull().$defaultFn(nowIso),
    updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
  },
  (t) => ({
    date_idx: index('expense_date_idx').on(t.date),
    wallet_date_idx: index('expense_wallet_id_date_idx').on(t.wallet_id, t.date),
  }),
);

export const transfer = sqliteTable(
  'transfer',
  {
    id: text('id').primaryKey(),
    from_wallet_id: text('from_wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'restrict' }),
    to_wallet_id: text('to_wallet_id')
      .notNull()
      .references(() => wallet.id, { onDelete: 'restrict' }),
    // Centavos.
    amount: integer('amount').notNull(),
    // YYYY-MM-DD.
    date: text('date').notNull(),
    note: text('note'),
    created_at: text('created_at').notNull().$defaultFn(nowIso),
    updated_at: text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso),
  },
  (t) => ({
    from_wallet_date_idx: index('transfer_from_wallet_id_date_idx').on(
      t.from_wallet_id,
      t.date,
    ),
    to_wallet_date_idx: index('transfer_to_wallet_id_date_idx').on(
      t.to_wallet_id,
      t.date,
    ),
  }),
);

// Re-export `sql` so callers can avoid a second import for raw expressions if
// they ever need one. Most query helpers don't.
export { sql };
