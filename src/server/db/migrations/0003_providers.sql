CREATE TABLE provider_connection(
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(name) BETWEEN 1 AND 80),
  authType TEXT NOT NULL CHECK(authType IN ('api_key','codex_login')),
  apiKeySealed BLOB,
  credentialBundleSealed BLOB,
  credentialRevision INTEGER NOT NULL DEFAULT 1 CHECK(credentialRevision >= 1),
  credentialExpiresAt TEXT,
  status TEXT NOT NULL CHECK(status IN ('connected','needs_relogin')),
  lastCheckedAt TEXT,
  lastCheckResult TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(provider, name),
  CHECK(
    (provider='claude' AND authType='api_key' AND apiKeySealed IS NOT NULL AND credentialBundleSealed IS NULL)
    OR
    (provider='codex' AND authType='codex_login' AND credentialBundleSealed IS NOT NULL AND apiKeySealed IS NULL)
  )
);
CREATE TABLE model_access(
  providerConnectionId TEXT NOT NULL REFERENCES provider_connection(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  credentialRevision INTEGER NOT NULL,
  catalogRevision TEXT NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('available','unavailable','unknown')),
  lastVerifiedAt TEXT,
  lastAttemptAt TEXT,
  checkError TEXT,
  PRIMARY KEY(providerConnectionId, model)
);
CREATE TABLE sandbox_login_session(
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL CHECK(provider = 'codex'),
  name TEXT,
  reloginOf TEXT REFERENCES provider_connection(id) ON DELETE SET NULL,
  containerId TEXT,
  status TEXT NOT NULL CHECK(status IN ('in_progress','succeeded','failed','cancelled','expired')),
  failureReason TEXT,
  lastActivityAt TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  resultConnectionId TEXT
);
