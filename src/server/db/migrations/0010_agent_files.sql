-- staplr:foreign-keys-off
-- Feature 003: souls are gone; each agent is one Markdown file (settings header + instructions).
-- The agent table is rebuilt (to drop soulId), which needs foreign keys off: see runFile in
-- src/server/db/migrate.ts. The header is written exactly as renderAgentFile in
-- src/shared/agent-file.ts writes it (a test checks this character for character).

-- Old souls and each agent's soul are kept so going back restores them.
CREATE TABLE soul_archive AS SELECT * FROM soul;

-- What the upgrade writes for each agent, worked out once.
CREATE TABLE agent_upgrade AS
SELECT
  a.id AS agentId,
  a.soulId AS soulId,
  s.roleType AS role,
  '---' || char(10)
    || 'name: ' || (CASE WHEN a.name <> trim(a.name)
         OR (length(a.name) >= 2 AND substr(a.name, 1, 1) IN ('"', '''') AND substr(a.name, -1, 1) = substr(a.name, 1, 1))
         THEN '"' || a.name || '"' ELSE a.name END) || char(10)
    || 'role: ' || s.roleType || char(10)
    || 'provider: ' || a.provider || char(10)
    || (CASE WHEN COALESCE(pc.name, '') = '' THEN 'connection:'
         ELSE 'connection: ' || (CASE WHEN pc.name <> trim(pc.name)
           OR (length(pc.name) >= 2 AND substr(pc.name, 1, 1) IN ('"', '''') AND substr(pc.name, -1, 1) = substr(pc.name, 1, 1))
           THEN '"' || pc.name || '"' ELSE pc.name END) END) || char(10)
    || (CASE WHEN a.model = '' THEN 'model:'
         ELSE 'model: ' || (CASE WHEN a.model <> trim(a.model)
           OR (length(a.model) >= 2 AND substr(a.model, 1, 1) IN ('"', '''') AND substr(a.model, -1, 1) = substr(a.model, 1, 1))
           THEN '"' || a.model || '"' ELSE a.model END) END) || char(10)
    || '---' || char(10) || char(10) AS header,
  CASE WHEN s.description <> '' THEN s.description || char(10) || char(10) || s.instructions
       ELSE s.instructions END AS fullBody,
  s.instructions AS shortBody,
  a.name AS agentName
FROM agent a
JOIN soul s ON s.id = a.soulId
LEFT JOIN provider_connection pc ON pc.id = a.providerConnectionId;

-- An agent whose description would push its file over 20,000 characters keeps its full
-- instructions without the description, and is named in the audit log.
CREATE TABLE agent_soul_archive AS
SELECT agentId, soulId,
  CASE WHEN length(header) + length(fullBody) > 20000 THEN shortBody ELSE fullBody END AS body
FROM agent_upgrade;

INSERT INTO audit_entry(id, at, action, targetType, targetId, targetName, detail)
SELECT lower(hex(randomblob(16))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'agents.upgraded',
  'agent', agentId, agentName, '{"descriptionLeftOut":true}'
FROM agent_upgrade
WHERE length(header) + length(fullBody) > 20000;

-- The file may exceed 20,000 characters only when an old soul's instructions alone did;
-- the editor then asks the owner to shorten it before the next save.
CREATE TABLE agent_new(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 80),
  role TEXT NOT NULL CHECK(role IN ('project_manager','business_analyst','developer','qa','custom')),
  provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
  providerConnectionId TEXT REFERENCES provider_connection(id) ON DELETE SET NULL,
  model TEXT CHECK(model IS NULL OR length(model) BETWEEN 1 AND 200),
  definition TEXT NOT NULL CHECK(length(definition) BETWEEN 1 AND 21000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
INSERT INTO agent_new(id, name, role, provider, providerConnectionId, model, definition, revision, createdAt, updatedAt)
SELECT a.id, a.name, u.role, a.provider, a.providerConnectionId, a.model, u.header || r.body, 1, a.createdAt, a.updatedAt
FROM agent a
JOIN agent_upgrade u ON u.agentId = a.id
JOIN agent_soul_archive r ON r.agentId = a.id;
DROP TABLE agent;
ALTER TABLE agent_new RENAME TO agent;
CREATE INDEX agent_connection ON agent(providerConnectionId);
CREATE INDEX agent_role ON agent(role);
DROP TABLE agent_upgrade;

-- Custom souls no agent used stay available as templates for new agents.
CREATE TABLE role_template(
  id TEXT PRIMARY KEY NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('project_manager','business_analyst','developer','qa','custom')),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK(length(body) <= 20502),
  createdAt TEXT NOT NULL
);
INSERT INTO role_template(id, role, label, body, createdAt)
SELECT id, roleType, name,
  CASE WHEN description <> '' THEN description || char(10) || char(10) || instructions ELSE instructions END,
  createdAt
FROM soul
WHERE isDefault = 0 AND id NOT IN (SELECT soulId FROM agent_soul_archive);

DROP TABLE soul;
