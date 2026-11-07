import {
  sqliteTable,
  text,
  integer,
  blob,
  check,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const users = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('passwordHash').notNull(),
    createdAt: text('createdAt').notNull(),
    singleton: integer('singleton').notNull().default(1),
  },
  (table) => [
    check('one_owner', sql`${table.singleton} = 1`),
    uniqueIndex('one_owner_idx').on(table.singleton),
  ],
);
export const sessions = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('createdAt').notNull(),
  expiresAt: text('expiresAt').notNull(),
  lastSeenAt: text('lastSeenAt').notNull(),
});
export const auditEntries = sqliteTable('audit_entry', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  action: text('action').notNull(),
  targetType: text('targetType').notNull(),
  targetId: text('targetId').notNull(),
  targetName: text('targetName').notNull(),
  detail: text('detail').notNull(),
});
export const sourceControlConnections = sqliteTable(
  'source_control_connection',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    platform: text('platform', { enum: ['github', 'gitlab'] }).notNull(),
    baseUrl: text('baseUrl').notNull(),
    accountName: text('accountName').notNull(),
    grantedPermissions: text('grantedPermissions').notNull().default('[]'),
    tokenSealed: blob('tokenSealed', { mode: 'buffer' }).notNull(),
    tokenLast4: text('tokenLast4').notNull(),
    status: text('status', {
      enum: ['connected', 'needs_attention'],
    }).notNull(),
    statusReason: text('statusReason', {
      enum: ['invalid', 'expired', 'revoked', 'missing_permission'],
    }),
    missingPermissions: text('missingPermissions').notNull().default('[]'),
    lastCheckedAt: text('lastCheckedAt'),
    lastCheckResult: text('lastCheckResult'),
    createdAt: text('createdAt').notNull(),
    updatedAt: text('updatedAt').notNull(),
  },
);
export const errorEvents = sqliteTable('error_event', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  requestId: text('requestId').notNull(),
  route: text('route').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
});
