/** The spec's Status Vocabulary, shared by the server and the web app. */

export const providers = ['claude', 'codex'] as const;
export type Provider = (typeof providers)[number];

export const authTypes = ['api_key', 'codex_login'] as const;
export type AuthType = (typeof authTypes)[number];

export const sourceControlStatuses = ['connected', 'needs_attention'] as const;
export type SourceControlStatus = (typeof sourceControlStatuses)[number];

export const sourceControlReasons = [
  'invalid',
  'expired',
  'revoked',
  'missing_permission',
] as const;
export type SourceControlReason = (typeof sourceControlReasons)[number];

export const providerStatuses = ['connected', 'needs_relogin'] as const;
export type ProviderStatus = (typeof providerStatuses)[number];

export const modelAvailabilities = [
  'available',
  'unavailable',
  'unknown',
] as const;
export type ModelAvailability = (typeof modelAvailabilities)[number];

export const readinessStates = ['ready', 'not_ready'] as const;
export type Readiness = (typeof readinessStates)[number];

export const readinessReasonCodes = [
  'needs_relogin',
  'no_provider_connection',
  'model_unavailable',
  'download_failed',
  'repository_unavailable',
  'base_branch_missing',
  'source_control_needs_attention',
  'no_project_manager',
  'agent_not_ready',
] as const;
export type ReadinessReasonCode = (typeof readinessReasonCodes)[number];

export const downloadStatuses = [
  'downloading',
  'downloaded',
  'download_failed',
] as const;
export type DownloadStatus = (typeof downloadStatuses)[number];

export const sandboxStatuses = [
  'in_progress',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const;
export type SandboxStatus = (typeof sandboxStatuses)[number];

export const roleTypes = [
  'project_manager',
  'business_analyst',
  'developer',
  'qa',
  'custom',
] as const;
export type RoleType = (typeof roleTypes)[number];

/** Board columns in their fixed order: New, Review, Testing, End (FR-044). */
export const ticketStatuses = ['new', 'review', 'testing', 'end'] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const ticketLabels: Record<TicketStatus, string> = {
  new: 'New',
  review: 'Review',
  testing: 'Testing',
  end: 'End',
};
