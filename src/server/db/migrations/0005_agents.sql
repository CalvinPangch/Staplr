-- Agents: a soul (role) plus a provider connection and model.
-- Disconnecting a provider keeps the agent and clears the link (it becomes Not ready).
CREATE TABLE agent(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 80),
  soulId TEXT NOT NULL REFERENCES soul(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  providerConnectionId TEXT REFERENCES provider_connection(id) ON DELETE SET NULL,
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX agent_soul ON agent(soulId);
CREATE INDEX agent_connection ON agent(providerConnectionId);
