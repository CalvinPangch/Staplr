import {
  sqliteTable,
  text,
  integer,
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
export const errorEvents = sqliteTable('error_event', {
  id: text('id').primaryKey(),
  at: text('at').notNull(),
  requestId: text('requestId').notNull(),
  route: text('route').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
});
