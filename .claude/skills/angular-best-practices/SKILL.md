---
name: angular-best-practices
description: Coding standards for this Angular 22 project (signals, zoneless, OnPush-by-default, standalone, control flow, RxJS, testing, a11y, performance). Use whenever writing, editing or reviewing any Angular/TypeScript/template/SCSS code in this repo.
---

# Angular best practices (findev)

Stack: Angular 22, standalone components, zoneless change detection, OnPush is the default strategy, Vitest, ESLint (angular-eslint) + Prettier, SCSS.

## Components

- Standalone only. No NgModules.
- Do not set `changeDetection` (OnPush is the v22 default). Use `ChangeDetectionStrategy.Eager` only with a written reason.
- Use `input()`, `input.required()`, `output()`, `model()`. Do not use `@Input`/`@Output` decorators.
- Use `viewChild()` / `contentChild()` signal queries, not decorators.
- Use `inject()`, not constructor injection.
- Keep components presentational and small (aim for under ~200 lines). Put state and IO in services.
- Template-facing members are `protected`; constants are `readonly`.
- Use `host: {}` in the decorator, not `@HostBinding` / `@HostListener`.
- Inline template/styles only for tiny components (≤ ~10 lines). Otherwise use separate files.
- File naming follows the v20+ style guide: `dashboard.ts`, `dashboard.html`, class `Dashboard` (no `.component` suffix).

## State & reactivity

- Signals first: `signal`, `computed`, `linkedSignal`, `resource`/`httpResource` for async reads.
- `effect()` only for side effects that leave Angular (DOM APIs, logging, storage). Never use it to sync one signal into another; use `computed`/`linkedSignal`.
- Never mutate signal values in place. Use `set`/`update` with new references.
- RxJS for streams (WebSockets, debounced input, complex async). Bridge with `toSignal`/`toObservable`.
- No manual `subscribe` in components without `takeUntilDestroyed()`. Prefer `toSignal` or the async-free signal path.
- Zoneless: never rely on `setTimeout`/zone to trigger rendering. Update a signal instead.

## Templates

- Built-in control flow (`@if`, `@for`, `@switch`, `@defer`). No `*ngIf`/`*ngFor`.
- Every `@for` has a stable `track` (an id, not `$index`, unless the list is static).
- No function calls in templates except signals and pure pipes. Derive values with `computed`.
- Use `[class.x]` / `[style.x]` bindings, not `ngClass`/`ngStyle`.
- Use `@defer` for heavy, below-the-fold widgets (charts, tables).
- Use `NgOptimizedImage` for static images.

## Routing

- Lazy-load every feature: `loadComponent` / `loadChildren`.
- Set `title` on each route. Use functional guards/resolvers.
- Use `withComponentInputBinding()` to bind route params to `input()` when needed.

## Services & HTTP

- `@Injectable({ providedIn: 'root' })` unless the service is feature-scoped.
- Typed HTTP responses. Map DTOs to domain models at the service boundary.
- Use functional interceptors (`withInterceptors`).
- No `any`. Use `unknown` and narrow. Prefer `interface`/`type` + `readonly` fields.

## Realtime / performance (fintech dashboard)

- Throttle or buffer high-frequency streams before they hit signals (e.g. `auditTime`, `bufferTime`) so the UI doesn't re-render on every tick.
- Keep large lists virtualized (`@angular/cdk/scrolling`) once they exceed ~100 rows.
- Keep heavy computation out of the main thread (Web Worker / WASM) when it shows in profiles.
- Watch the bundle: the initial budget is 500 kB warning / 1 MB error. Do not import whole libraries for one helper.
- Money values: never use floating-point arithmetic for amounts. Use integer minor units or a decimal library. Format with `Intl.NumberFormat` / `CurrencyPipe`.

## Styling

- Component styles are scoped. Global tokens are CSS custom properties in `src/styles.scss`.
- Support light and dark via the existing tokens. No hard-coded colors in components.
- Component style budget: 4 kB warning.

## Accessibility

- Semantic HTML first. Interactive elements are `<button>`/`<a>`, never clickable `<div>`s.
- Every control has a label. Use `aria-current` for active nav. Keyboard reachable, visible focus.
- The angular-eslint template a11y rules are on. Don't disable them inline.

## Testing

- Vitest via `ng test`. Test behaviour through the DOM / public API, not private members.
- Every new component, service or pipe gets a spec. Bug fixes add a regression test.
- Use `provideRouter`, `provideHttpClient(withFetch())` + `provideHttpClientTesting()` in TestBed. Await `fixture.whenStable()` (zoneless).

## Before finishing a change

Run `npm run format:check`, `npm run lint`, `npx ng test --watch=false`, `npm run build`. All must pass.

## Commits

Format is enforced by commitlint:

- `chore: <message>`: tooling, deps, config. No scope.
- `feat(FD-<task>-n<sub>): <message>`: e.g. `feat(FD-001-n1): add main banner`.
- `fix(FD-<task>-n<sub>): <message>`: e.g. `fix(FD-001-n1): optimize data load bug`.
  Only `chore`, `feat` and `fix`. Subject starts lowercase, no trailing period.
