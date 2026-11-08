# API Changes: One Agent, One Markdown File

Changes to `specs/001-agent-team-orchestration/contracts/openapi.yaml`. All endpoints keep the
existing rules: signed-in session required, Origin checked on writes, bodies validated with Zod,
errors as `application/problem+json`.

## Removed

| Endpoint | After this feature |
|---|---|
| `GET /api/souls`, `POST /api/souls` | 404 |
| `GET/PUT/DELETE /api/souls/{id}` | 404 |
| `POST /api/souls/{id}/copy` | 404 |

Schemas `Soul`, `SoulInput` are removed.

## Agent (response schema, changed)

```yaml
Agent:
  required: [id, name, role, provider, providerConnectionId, model, definition, revision,
             readiness, reasons, projects]
  properties:
    id: { type: string }
    name: { type: string }
    role: { enum: [project_manager, business_analyst, developer, qa, custom] }
    provider: { enum: [claude, codex] }
    providerConnectionId: { type: [string, 'null'] }
    connectionName: { type: [string, 'null'], description: As written in the file }
    model: { type: [string, 'null'] }
    definition: { type: string, maxLength: 20000, description: The agent file, exactly as saved }
    revision: { type: integer, minimum: 1 }
    readiness: { enum: [ready, not_ready] }
    reasons: { type: array, items: { $ref: '#/components/schemas/ReadinessReason' } }
    projects: { type: array, items: { $ref: '#/components/schemas/Ref' } }
```

`soulId` is removed. `role` was already present and is now the agent's own.

## Agent writes (changed)

| Endpoint | Body | Success | Errors |
|---|---|---|---|
| `POST /api/agents` | `{ definition }` | `201 Agent` (revision 1) | `422 agent_file_invalid` |
| `PUT /api/agents/{id}` | `{ definition, revision }` | `200 Agent` (revision + 1) | `404`, `409 agent_changed`, `422 agent_file_invalid` |
| `DELETE /api/agents/{id}` | — | `204` (unchanged) | `404`, `409` (on a team, unchanged) |

`agent_file_invalid` problem body:

```json
{
  "code": "agent_file_invalid",
  "message": "The agent file has 2 problems. Fix them and save again.",
  "details": {
    "problems": [
      { "line": 3, "field": "role", "message": "Unknown role \"dev\". Use project_manager, business_analyst, developer, qa or custom." },
      { "line": 6, "field": "model", "message": "gpt-6-astra is not verified for Work Codex. Use Check availability or choose another model." }
    ]
  }
}
```

The one-Project-Manager rule is reported in the same list (`field: "role"`), naming each project.

`agent_changed` (409): "This agent was changed somewhere else since you opened it. Reload to see
the latest version; your text is kept so you can copy it." with `details.revision` = the current
revision.

## Templates (new)

| Endpoint | Success |
|---|---|
| `GET /api/agent-templates` | `200 { templates: AgentTemplate[] }` |

```yaml
AgentTemplate:
  required: [id, role, label, kind, definition]
  properties:
    id: { type: string }
    role: { enum: [project_manager, business_analyst, developer, qa, custom] }
    label: { type: string }
    kind: { enum: [shipped, kept], description: kept = from a custom soul no agent used at upgrade }
    definition: { type: string, description: A ready agent file with role set and other settings empty }
```

## Provider connection rename (behaviour change)

`PATCH /api/provider-connections/{id}` (rename) and the source-control rename are unchanged in
shape; renaming a provider connection now also rewrites the `connection:` line of every agent file
that uses it (each agent's `revision` + 1).

## Audit actions

New entries keep using `agent.created`, `agent.updated`, `agent.deleted`. `agent.updated.detail`
lists only the changed setting names and whether the instructions changed:
`{ "changed": ["model", "instructions"] }`. The file text is never written to the audit log.
`soul.*` actions remain in history and keep their labels.
