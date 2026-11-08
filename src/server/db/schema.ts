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
  discoveryStatus: text('discoveryStatus', {
    enum: ['not_started', 'running', 'finished', 'failed'],
  })
    .notNull()
    .default('not_started'),
  discoveryError: text('discoveryError'),
  modelsRefreshedAt: text('modelsRefreshedAt'),
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
/** Feature 003: an agent is one Markdown file; the columns are a parsed copy of its header. */
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role', {
    enum: ['project_manager', 'business_analyst', 'developer', 'qa', 'custom'],
  }).notNull(),
  provider: text('provider', { enum: ['claude', 'codex'] }).notNull(),
  providerConnectionId: text('providerConnectionId'),
  model: text('model'),
  definition: text('definition').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});
/** Templates kept from custom souls that no agent used at the 0010 upgrade. */
export const roleTemplates = sqliteTable('role_template', {
  id: text('id').primaryKey(),
  role: text('role', {
    enum: ['project_manager', 'business_analyst', 'developer', 'qa', 'custom'],
  }).notNull(),
  label: text('label').notNull(),
  body: text('body').notNull(),
  createdAt: text('createdAt').notNull(),
});
export const projects = sqliteTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceControlConnectionId: text('sourceControlConnectionId'),
  repoFullName: text('repoFullName').notNull(),
  repoRemoteId: text('repoRemoteId').notNull(),
  baseBranch: text('baseBranch').notNull(),
  downloadStatus: text('downloadStatus', {
    enum: ['downloading', 'downloaded', 'download_failed'],
  }).notNull(),
  downloadError: text('downloadError'),
  lastUpdatedAt: text('lastUpdatedAt'),
  lastRefreshError: text('lastRefreshError'),
  repositoryState: text('repositoryState', {
    enum: ['ok', 'repository_unavailable', 'base_branch_missing'],
  })
    .notNull()
    .default('ok'),
  repositoryCheckedAt: text('repositoryCheckedAt'),
  deletedAt: text('deletedAt'),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
});
export const teamAssignments = sqliteTable('team_assignment', {
  projectId: text('projectId').notNull(),
  agentId: text('agentId').notNull(),
  assignedAt: text('assignedAt').notNull(),
});
export const usageRecords = sqliteTable('usage_record', {
  id: text('id').primaryKey(),
  projectId: text('projectId'),
  agentId: text('agentId'),
  providerConnectionId: text('providerConnectionId'),
  projectName: text('projectName').notNull(),
  agentName: text('agentName').notNull(),
  agentRole: text('agentRole').notNull(),
  // no foreign key: the ticket may be deleted later
  ticketId: text('ticketId').notNull(),
  // snapshot at write time
  ticketTitle: text('ticketTitle').notNull(),
  provider: text('provider', { enum: ['claude', 'codex'] }).notNull(),
  model: text('model').notNull(),
  inputTokens: integer('inputTokens'),
  outputTokens: integer('outputTokens'),
  startedAt: text('startedAt').notNull(),
  endedAt: text('endedAt').notNull(),
  estimatedCostUsd: text('estimatedCostUsd'),
  priceId: text('priceId'),
});
export const modelPrices = sqliteTable('model_price', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['claude', 'codex'] }).notNull(),
  model: text('model').notNull(),
  // USD per million tokens as decimal text; null means Unknown
  inputPricePerMTok: text('inputPricePerMTok'),
  outputPricePerMTok: text('outputPricePerMTok'),
  priceSource: text('priceSource'),
  pricesAsOf: text('pricesAsOf'),
  effectiveFrom: text('effectiveFrom').notNull(),
  // null means this is the current price
  effectiveUntil: text('effectiveUntil'),
  source: text('source', { enum: ['default', 'user', 'official'] }).notNull(),
});
export const tickets = sqliteTable('ticket', {
  id: text('id').primaryKey(),
  projectId: text('projectId').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', {
    enum: ['new', 'review', 'testing', 'end'],
  }).notNull(),
  // 0-based and contiguous within (projectId, status)
  position: integer('position').notNull(),
  createdAt: text('createdAt').notNull(),
  updatedAt: text('updatedAt').notNull(),
  statusChangedAt: text('statusChangedAt').notNull(),
});
export const discoveredModels = sqliteTable('discovered_model', {
  providerConnectionId: text('providerConnectionId').notNull(),
  model: text('model').notNull(),
  label: text('label').notNull(),
  listedAt: text('listedAt').notNull(),
});
export const priceRefresh = sqliteTable('price_refresh', {
  provider: text('provider', { enum: ['claude', 'codex'] }).primaryKey(),
  lastAttemptAt: text('lastAttemptAt'),
  lastSuccessAt: text('lastSuccessAt'),
  lastError: text('lastError'),
});
