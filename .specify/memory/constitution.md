# Staplr Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

- Every behavior change MUST begin with an automated test that fails for the expected reason
  before any production code is written (Red → Green → Refactor).
- Each user story in a spec MUST map to at least one acceptance-level test; business logic MUST
  have unit tests; API contracts and data-access boundaries MUST have integration tests.
- A change MUST NOT be merged while any test is failing, skipped without a linked issue, or
  disabled to make the build pass.
- Bug fixes MUST include a regression test that reproduces the bug before the fix.

**Rationale**: With one maintainer and AI agents writing most of the code, tests are the main
evidence that code does what the spec says and keeps doing it.

### II. Security & Privacy by Default

- All external input (HTTP requests, query params, headers, uploads, webhooks) MUST be validated
  server-side against an explicit schema; client-side validation is a convenience only.
- Every endpoint and server action MUST enforce authentication and authorization explicitly;
  access to user data MUST be scoped to the signed-in user and covered by tests that prove
  requests without a valid session are denied.
- Secrets MUST NOT be committed to the repository, written to logs, or exposed to the client
  bundle. The application's own secrets MUST come from environment configuration or a secret
  manager. Secrets the user enters (access tokens, saved provider logins) MUST be encrypted at
  rest.
- The app MUST collect and retain only the personal data a spec explicitly requires; each such
  field MUST be documented in the feature's data model with its purpose.
- Database access MUST use parameterized queries or an ORM; output rendered to HTML MUST be
  escaped by default.
- Dependencies with known critical or high vulnerabilities MUST NOT ship to production.

**Rationale**: Each self-hosted Staplr installation holds its owner's repository tokens, paid AI
provider logins, and source code. One breach exposes all of them, and security added late costs
far more than security designed in.

### III. Accessible, Consistent User Experience

- All user-facing UI MUST meet WCAG 2.2 Level AA: full keyboard operability, visible focus,
  semantic markup, text alternatives, and sufficient color contrast in every supported theme.
- UI MUST be built from a shared design system (tokens and reusable components); one-off
  styling that duplicates an existing component is not allowed.
- Every screen MUST handle loading, empty, error, and success states explicitly, and error
  messages MUST tell the user what happened and what they can do next.
- Layouts MUST work from 320px mobile width through desktop without horizontal scrolling.
- UI changes MUST pass automated accessibility checks (for example, axe) in the test suite.

**Rationale**: Accessibility and consistency are much cheaper to build in from the start than
to retrofit, and they directly affect how users trust and adopt the product.

### IV. Simplicity & YAGNI

- Implement only what the current spec requires; speculative features, configuration options,
  and extension points MUST NOT be added "for later".
- Prefer the platform and framework defaults and the standard library over new dependencies;
  each new runtime dependency MUST be justified in the plan (need, alternatives considered,
  maintenance health).
- New architectural layers, services, or abstractions MUST be justified in the plan's
  Complexity Tracking section; an abstraction requires at least two concrete current uses.
- Start as a single deployable application; splitting into separate services requires a
  documented, measured need.

**Rationale**: A solo-maintained codebase must stay small enough for one person, and an AI
agent's context window, to understand fully.

### V. Spec-Driven Delivery

- Every non-trivial feature MUST flow through the Spec Kit workflow: specify → (clarify) →
  plan → tasks → implement, with artifacts stored under `specs/`.
- Specs MUST describe user value and measurable acceptance criteria, not implementation.
- Plans MUST include a Constitution Check that names each principle and states how the design
  complies, or records a justified exception.
- Trivial changes (typos, copy tweaks, dependency patch bumps) MAY skip the spec workflow but
  MUST still satisfy Principles I–IV.

**Rationale**: Written specs and plans are the shared memory between the maintainer and AI
agents. They keep work focused on the agreed outcome and make the decisions behind it reviewable.

## Technology & Operational Constraints

- The technology stack is chosen in the first feature plan and recorded there. Choices MUST
  favor well-maintained, widely adopted tools with strong typing support.
- Code MUST be statically typed where the language supports it (e.g., TypeScript `strict`).
- Linting, formatting, and type checks MUST run automatically and pass before merge.
- Database schema changes MUST be made through versioned, reversible migrations.
- The app MUST emit structured logs with request correlation IDs and MUST NOT log secrets or
  unnecessary personal data. Errors in production MUST be captured by an error-reporting tool
  that records each unhandled error with its request ID, route, and secret-free stack trace, and
  lets the user review them. The tool MAY run locally on the installation, and MUST do so
  whenever a feature forbids sending data to third-party services.
- Configuration MUST differ between environments only through environment variables.

## Development Workflow & Quality Gates

- Work happens on a feature branch per spec; `main` MUST always be deployable.
- Because the project is maintained by one person working with AI agents, the maintainer is the
  required reviewer for all AI-generated changes. Before merge the maintainer MUST read the diff
  and confirm the Constitution Check.
- A change is mergeable only when all gates pass: tests (Principle I), type checks, lint,
  accessibility checks for UI changes (Principle III), and dependency vulnerability scan
  (Principle II).
- Commits MUST be small and focused and use Conventional Commit messages
  (e.g., `feat:`, `fix:`, `docs:`).
- AI agents MUST NOT weaken or delete tests, disable checks, or bypass hooks to make a gate pass;
  doing so is grounds to reject the change.

## Governance

- This constitution supersedes all other development practices for Staplr. Where a template,
  guide, or agent instruction conflicts with it, the constitution wins.
- Amendments are made via `/speckit-constitution`, MUST include a Sync Impact Report, and take
  effect once committed by the maintainer.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR
  for adding a principle or section or materially expanding guidance, PATCH for clarifications
  and wording.
- Compliance is checked at three points: the Constitution Check in every plan, `/speckit-analyze`
  before implementation, and maintainer review before merge.
- Exceptions MUST be recorded in the relevant plan's Complexity Tracking with justification and,
  where applicable, a follow-up task to remove them.
- The maintainer reviews this constitution at least once per quarter for relevance.

**Version**: 1.0.2 | **Ratified**: 2026-11-08 | **Last Amended**: 2026-11-08
