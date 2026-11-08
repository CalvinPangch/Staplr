-- staplr:foreign-keys-off
-- Reverses 0010: souls come back from the archive. An agent whose instructions and role are
-- still what the upgrade wrote points at its old soul again; any other agent (edited since, or
-- created since) gets its own custom soul "<name> (from agent file)" holding its current text.

CREATE TABLE soul(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 80),
  roleType TEXT NOT NULL CHECK(roleType IN ('project_manager','business_analyst','developer','qa','custom')),
  description TEXT NOT NULL CHECK(length(description) <= 500),
  instructions TEXT NOT NULL CHECK(length(instructions) <= 20000),
  isDefault INTEGER NOT NULL DEFAULT 0 CHECK(isDefault IN (0,1)),
  copiedFromId TEXT REFERENCES soul(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
INSERT INTO soul(id, name, roleType, description, instructions, isDefault, copiedFromId, createdAt, updatedAt)
SELECT id, name, roleType, description, instructions, isDefault, copiedFromId, createdAt, updatedAt
FROM soul_archive;

-- The instructions are what follows the closing --- line and one blank line.
CREATE TABLE agent_downgrade AS
SELECT a.id AS agentId, a.name AS agentName, a.role AS role,
  CASE WHEN substr(rest, 1, 1) = char(10) THEN substr(rest, 2) ELSE rest END AS body
FROM (
  SELECT agent.*, substr(definition, instr(definition, char(10) || '---' || char(10)) + 5) AS rest
  FROM agent
) a;
ALTER TABLE agent_downgrade ADD COLUMN soulId TEXT;
UPDATE agent_downgrade SET soulId = (
  SELECT r.soulId FROM agent_soul_archive r JOIN soul s ON s.id = r.soulId
  WHERE r.agentId = agent_downgrade.agentId AND r.body = agent_downgrade.body
    AND s.roleType = agent_downgrade.role
);
UPDATE agent_downgrade SET soulId = 'from-agent-' || agentId WHERE soulId IS NULL;
INSERT INTO soul(id, name, roleType, description, instructions, isDefault, copiedFromId, createdAt, updatedAt)
SELECT soulId,
  CASE WHEN length(agentName) <= 62 THEN agentName || ' (from agent file)'
       ELSE substr(agentName, 1, 50) || ' ' || substr(agentId, 1, 8) || ' (from agent file)' END,
  role, '', substr(body, 1, 20000), 0, NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM agent_downgrade
WHERE soulId = 'from-agent-' || agentId;

-- An agent saved with no model goes back with the placeholder "none" (Not ready there).
CREATE TABLE agent_old(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 80),
  soulId TEXT NOT NULL REFERENCES soul(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  providerConnectionId TEXT REFERENCES provider_connection(id) ON DELETE SET NULL,
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
INSERT INTO agent_old(id, name, soulId, provider, providerConnectionId, model, createdAt, updatedAt)
SELECT a.id, a.name, d.soulId, a.provider, a.providerConnectionId, COALESCE(a.model, 'none'), a.createdAt, a.updatedAt
FROM agent a JOIN agent_downgrade d ON d.agentId = a.id;
DROP TABLE agent;
ALTER TABLE agent_old RENAME TO agent;
CREATE INDEX agent_soul ON agent(soulId);
CREATE INDEX agent_connection ON agent(providerConnectionId);

DROP TABLE agent_downgrade;
DROP TABLE agent_soul_archive;
DROP TABLE soul_archive;
DROP TABLE role_template;
