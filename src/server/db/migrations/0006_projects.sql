-- Projects (a downloaded repository plus a team), team assignments, and the
-- append-only usage record that the next feature writes to.
CREATE TABLE project(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  sourceControlConnectionId TEXT REFERENCES source_control_connection(id) ON DELETE SET NULL,
  repoFullName TEXT NOT NULL,
  repoRemoteId TEXT NOT NULL,
  baseBranch TEXT NOT NULL,
  downloadStatus TEXT NOT NULL CHECK(downloadStatus IN ('downloading','downloaded','download_failed')),
  downloadError TEXT,
  lastUpdatedAt TEXT,
  lastRefreshError TEXT,
  -- result of the last reachability check; readiness itself is never stored
  repositoryState TEXT NOT NULL DEFAULT 'ok' CHECK(repositoryState IN ('ok','repository_unavailable','base_branch_missing')),
  repositoryCheckedAt TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX project_connection ON project(sourceControlConnectionId);
CREATE TABLE team_assignment(
  projectId TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  agentId TEXT NOT NULL REFERENCES agent(id) ON DELETE RESTRICT,
  assignedAt TEXT NOT NULL,
  PRIMARY KEY(projectId, agentId)
);
CREATE INDEX team_assignment_agent ON team_assignment(agentId);
-- Written by the next feature. There is no update or delete path: the triggers refuse both.
CREATE TABLE usage_record(
  id TEXT PRIMARY KEY NOT NULL,
  projectId TEXT REFERENCES project(id) ON DELETE SET NULL,
  agentId TEXT REFERENCES agent(id) ON DELETE SET NULL,
  providerConnectionId TEXT REFERENCES provider_connection(id) ON DELETE SET NULL,
  projectName TEXT NOT NULL,
  agentName TEXT NOT NULL,
  agentRole TEXT NOT NULL,
  ticketId TEXT NOT NULL,
  ticketTitle TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  model TEXT NOT NULL,
  inputTokens INTEGER,
  outputTokens INTEGER,
  startedAt TEXT NOT NULL,
  endedAt TEXT NOT NULL,
  estimatedCostUsd TEXT,
  priceId TEXT
);
CREATE INDEX usage_record_project ON usage_record(projectId);
CREATE TRIGGER usage_record_no_update BEFORE UPDATE ON usage_record
WHEN NOT (
  -- the only changes allowed are foreign keys being cleared by ON DELETE SET NULL
  NEW.id IS OLD.id AND NEW.projectName IS OLD.projectName AND NEW.agentName IS OLD.agentName
  AND NEW.agentRole IS OLD.agentRole AND NEW.ticketId IS OLD.ticketId AND NEW.ticketTitle IS OLD.ticketTitle
  AND NEW.provider IS OLD.provider AND NEW.model IS OLD.model AND NEW.inputTokens IS OLD.inputTokens
  AND NEW.outputTokens IS OLD.outputTokens AND NEW.startedAt IS OLD.startedAt AND NEW.endedAt IS OLD.endedAt
  AND NEW.estimatedCostUsd IS OLD.estimatedCostUsd AND NEW.priceId IS OLD.priceId
  AND (NEW.projectId IS OLD.projectId OR NEW.projectId IS NULL)
  AND (NEW.agentId IS OLD.agentId OR NEW.agentId IS NULL)
  AND (NEW.providerConnectionId IS OLD.providerConnectionId OR NEW.providerConnectionId IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'usage records are append-only'); END;
CREATE TRIGGER usage_record_no_delete BEFORE DELETE ON usage_record
BEGIN SELECT RAISE(ABORT, 'usage records are append-only'); END;
