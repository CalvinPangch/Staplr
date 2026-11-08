# Data Model: A Modern, Apple-Style Staplr with a Green Accent

No stored data changes. No migration, no new or changed API fields, no personal data.

Client-side derived data only:

- **Attention item** (Home, FR-010), computed in the browser from responses Home already can read:
  - from `GET /api/agents`: each agent with `readiness = not_ready` → `{ kind: 'agent', name,
    reason: reasons[0].message, href: /agents/{id} }`
  - from `GET /api/provider-connections`: each with `status = needs_relogin` → `{ kind:
    'connection', name, reason: lastCheckResult, href: /settings/providers }`
  - from `GET /api/source-control-connections`: each with `status = needs_attention`
  - from `GET /api/projects`: each `download_failed` or with a readiness reason
    `no_project_manager` → `{ kind: 'project', name, reason, href: /projects/{id} }`
  - Order: failed first, then needs attention; empty list → "Everything is ready."

- **Theme preference**: unchanged (stored in the browser as today).
