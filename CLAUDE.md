# Realtime Fintech Dashboard

Angular 22 app: standalone, zoneless, OnPush by default, Vitest, ESLint + Prettier. Node is pinned in `.nvmrc`.

## Rules

- Follow the `angular-best-practices` skill for all code changes.
- Before every `git push`, run the `pre-push-review` skill. It reports optimization warnings and doesn't block. A hook enforces that it ran.
- Before committing: `npm run format:check`, `npm run lint`, `npx ng test --watch=false`, `npm run build`.

## Commits (enforced by commitlint)

- `chore: <message>`: tooling, deps, config. No scope.
- `feat(FD-<task>-n<sub>): <message>`, e.g. `feat(FD-001-n1): add main banner`.
- `fix(FD-<task>-n<sub>): <message>`, e.g. `fix(FD-001-n1): optimize data load bug`.
- No other types. Subject in lowercase.

## Tasks

Work is tracked as `FD-<task>-n<sub>` (e.g. `FD-001-n1`). One commit per sub-task, scoped to that id.
