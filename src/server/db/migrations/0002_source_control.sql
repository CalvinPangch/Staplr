CREATE TABLE source_control_connection(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 80),
  platform TEXT NOT NULL CHECK(platform IN ('github','gitlab')),
  baseUrl TEXT NOT NULL,
  accountName TEXT NOT NULL,
  grantedPermissions TEXT NOT NULL DEFAULT '[]',
  tokenSealed BLOB NOT NULL,
  tokenLast4 TEXT NOT NULL CHECK(length(tokenLast4) BETWEEN 1 AND 4),
  status TEXT NOT NULL CHECK(status IN ('connected','needs_attention')),
  statusReason TEXT CHECK(statusReason IS NULL OR statusReason IN ('invalid','expired','revoked','missing_permission')),
  missingPermissions TEXT NOT NULL DEFAULT '[]',
  lastCheckedAt TEXT,
  lastCheckResult TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
