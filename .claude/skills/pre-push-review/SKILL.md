---
name: pre-push-review
description: Senior Angular developer review of the commits about to be pushed, reporting optimization opportunities as non-blocking warnings. Run before every `git push` (a project hook requires it), or when the user asks for a pre-push review.
---

# Pre-push review (senior Angular developer)

Review what is about to be pushed and report **warnings only**. This review never blocks the push and never edits code on its own.

## 1. Collect the diff

```bash
git fetch --quiet origin 2>/dev/null || true
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo origin/main)
git rev-parse --verify --quiet "$UPSTREAM" >/dev/null || UPSTREAM=$(git rev-list --max-parents=0 HEAD | tail -1)
git log --oneline "$UPSTREAM"..HEAD
git diff --stat "$UPSTREAM"..HEAD
git diff "$UPSTREAM"..HEAD -- . ':(exclude)package-lock.json'
```

If there are no commits to push, say so, record the marker (step 4) and stop.

## 2. Review as a senior Angular developer

Judge against the `angular-best-practices` skill. Look for:

- **Performance:** re-render triggers, template function calls, missing/unstable `track`, unthrottled realtime streams, missing `@defer`/lazy routes, heavy imports, bundle growth.
- **Reactivity:** `effect()` used to sync state, signal mutation in place, leaking subscriptions, zone-dependent code.
- **Modern APIs:** decorators where signal APIs exist (`@Input`, `@ViewChild`, `@HostListener`), constructor injection, `*ngIf`/`ngClass`.
- **Architecture:** logic in components that belongs in services, duplication, `any`, weak typing, DTOs leaking into UI.
- **Correctness/safety:** float math on money, unhandled errors, XSS via `innerHTML`/`bypassSecurityTrust*`.
- **A11y:** missing labels, non-semantic interactive elements, focus handling.
- **Tests:** new or changed behaviour without specs.
- **Commits:** messages follow `chore: …` / `feat(FD-xxx-nN): …` / `fix(FD-xxx-nN): …`.

Only report real findings in the diff. Don't pad the list, and don't flag what lint already enforces.

## 3. Report

Print exactly this shape, most impactful first:

```
⚠️ Pre-push review: <N> suggestion(s) for <range>

1. [performance] src/app/x/x.ts:42: <what can be optimized and why>
   → <concrete suggested change>
2. ...

These are warnings, not blockers. The push can proceed.
```

If nothing is worth raising: `✅ Pre-push review: no optimization suggestions for <range>.`

## 4. Record the marker

After reporting, mark this HEAD as reviewed so the push hook lets the push through:

```bash
git rev-parse HEAD > "$(git rev-parse --git-path claude-pre-push-reviewed)"
```

Then continue with the push the user asked for. Don't stop to fix the warnings unless the user asks.
