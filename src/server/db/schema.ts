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
export const providerConnections = sqliteTable('provider_connection', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['claude', 'codex'] }).notNull(),
  name: text('name').notNull(),
  authType: text('authType', { enum: ['api_key', 'codex_login'] }).notNull(),
  apiKeySealed: blob('apiKeySealed', { mode: 'buffer' }),
  credentialBundleSealed: blob('credentialBundleSealed', { mode: 'buffer' }),
  credentialRevision: integer('credentialRevision').notNull().default(1),
  credentialExpiresAt: text('credentialExpiresAt'),
  status: text('status', { enum: ['connected', 'needs_relogin'] }).notNull(),
  lastCheckedAt: text('lastCheckedAt'),
  lastCheckResult: text('lastCheckResult'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});
export const modelAccess = sqliteTable('model_access', {
  providerConnectionId: text('providerConnectionId').notNull(),
  model: text('model').notNull(),
  credentialRevision: integer('credentialRevision').notNull(),
  catalogRevision: text('catalogRevision').notNull(),
  availability: text('availability', {
    enum: ['available', 'unavailable', 'unknown'],
  }).notNull(),
  lastVerifiedAt: text('lastVerifiedAt'),
  lastAttemptAt: text('lastAttemptAt'),
  checkError: text('checkError'),
});
export const sandboxLoginSessions = sqliteTable('sandbox_login_session', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['codex'] }).notNull(),
  name: text('name'),
  reloginOf: text('reloginOf'),
  containerId: text('containerId'),
  status: text('status', {
    enum: ['in_progress', 'succeeded', 'failed', 'cancelled', 'expired'],
  }).notNull(),
  failureReason: text('failureReason'),
  lastActivityAt: text('lastActivityAt').notNull(),
  startedAt: text('startedAt').notNull(),
  endedAt: text('endedAt'),
  resultConnectionId: text('resultConnectionId'),
});
export const souls = sqliteTable('soul', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  roleType: text('roleType', {
    enum: ['project_manager', 'business_analyst', 'developer', 'qa', 'custom'],
  }).notNull(),
  description: text('description').notNull(),
  instructions: text('instructions').notNull(),
  isDefault: integer('isDefault', { mode: 'boolean' }).notNull().default(false),
  copiedFromId: text('copiedFromId'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  soulId: text('soulId').notNull(),
  provider: text('provider', { enum: ['claude', 'codex'] }).notNull(),
  providerConnectionId: text('providerConnectionId'),
  model: text('model').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});
