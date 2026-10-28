# Realtime Fintech Dashboard

Angular 22 app (standalone components, zoneless change detection, OnPush by default) fed by a
market data producer written in Rust, compiled to WebAssembly and run in a Web Worker. It simulates
up to 50 instruments at up to 20,000 order-book updates per second and keeps the UI responsive.

**Live demo:** https://anzhelikadavidyan.github.io/realtime-fintech-dashboard/

## Prerequisites

| Tool      | Version                                           | Install                                                   |
| --------- | ------------------------------------------------- | --------------------------------------------------------- |
| Node      | `^22.22.3 \|\| ^24.15.0 \|\| >=26` (`.nvmrc`: 24) | `nvm install && nvm use`                                  |
| Rust      | stable, 1.88 or newer (edition 2024)              | [rustup](https://rustup.rs), then the Wasm target (below) |
| wasm-pack | recent release (tested with 0.15)                 | `cargo install wasm-pack` (or `brew install wasm-pack`)   |

```bash
rustup target add wasm32-unknown-unknown
```

## Getting started

```bash
npm run dev
```

`npm run dev` switches to the Node version in `.nvmrc` (installing it with nvm if needed), puts
`cargo` on the PATH when rustup's directory is missing from it (Homebrew's rustup is keg-only),
runs `npm ci` when `package-lock.json` changed since the last install, then runs `npm start`. The
manual equivalent is `nvm use && npm ci && npm start`.

`npm start` builds the Wasm package into `wasm/pkg` and serves the app at http://localhost:4200.
Open **Settings** to change the instrument count, batch size and batch interval; **Apply** starts a
fresh run with them.

## Scripts

| Command                                      | Purpose                                        |
| -------------------------------------------- | ---------------------------------------------- |
| `npm run dev`                                | Set up Node, Rust and deps, then `npm start`   |
| `npm start`                                  | Dev server at http://localhost:4200            |
| `npm run build`                              | Production build to `dist/findev/browser`      |
| `npm test`                                   | Angular unit tests (Vitest), in watch mode     |
| `npx ng test --watch=false`                  | Angular unit tests, single run (as CI runs it) |
| `npm run build:wasm`                         | Build the Rust producer into `wasm/pkg`        |
| `npm run lint`                               | ESLint (angular-eslint)                        |
| `npm run format`                             | Prettier write                                 |
| `npm run format:check`                       | Prettier check                                 |
| `cargo test --manifest-path wasm/Cargo.toml` | Rust unit and integration tests                |

`npm start`, `npm run build` and `npm test` build the Wasm package first. `npx ng …` does not, so
run `npm run build:wasm` once before using it on a fresh clone.

Before committing, run `npm run format:check`, `npm run lint`, `npx ng test --watch=false` and
`npm run build`. Commit messages are checked by commitlint (`chore: …`, `feat(FD-001-n1): …`,
`fix(FD-001-n1): …`).

## Architecture

```text
┌──────────────────────── Web Worker ────────────────────────┐        ┌──────────── Main thread ────────────┐
│                                                            │        │                                     │
│  MarketGenerator (Rust → Wasm)                             │        │  ProducerService                    │
│    seeded PRNG, random-walk order book per instrument      │        │    decodes snapshot → rows signal   │
│          │ generateBatch(n): Int32Array, n × 7 ints        │        │    drops snapshots of older runs    │
│          ▼                       every batchIntervalMs     │ post-  │          │                          │
│  MetricsAggregator                                         │ Message│          ▼                          │
│    O(1) accumulators per instrument (typed arrays)         │ ─────► │  Dashboard (OnPush, zoneless)       │
│          │                       every 100 ms, if changed  │ Float64│    computed rows + price trends     │
│          ▼                                                 │ Array, │    pure pipes for formatting        │
│  encodeMetrics → Float64Array (transferred, not copied)    │ trans- │                                     │
│                                                            │ ferred │  Settings → ProducerService.apply() │
│  ProducerEngine: idle → running ⇄ paused → finished        │ ◄───── │    init + start commands, runId     │
│  ProducerWorkerHost: loads Wasm, queues early commands     │ command│                                     │
└────────────────────────────────────────────────────────────┘        └─────────────────────────────────────┘
```

1. The worker loads the Wasm module and posts `ready`, or an `error` the UI shows with **Retry**.
2. `init` stores settings and `start` begins a run tagged with a `runId`. Every batch interval the
   engine asks the generator for `updatesPerBatch` updates of 7 integers each (instrument, bid,
   ask, bid and ask quantity, trade price and quantity, all in ticks and lots) and folds them into
   per-instrument metrics: bid, ask, spread, order-book imbalance, last price, volume and VWAP.
3. At most every 100 ms, and only if a batch arrived since the last one, the engine packs all
   metrics into one `Float64Array` and transfers it to the UI.
4. `ProducerService` ignores snapshots from older runs, decodes the rest into a signal, and the
   dashboard re-renders from it.

### Project layout

| Path                     | Contents                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `wasm/`                  | Rust crate: `MarketGenerator`, xorshift64\* PRNG, tests                           |
| `src/app/core/`          | Shared types and pure logic: settings, update layout, aggregator, codec, protocol |
| `src/app/worker/`        | Worker entry, host (Wasm loading, command routing) and `ProducerEngine`           |
| `src/app/state/`         | `ProducerService`: owns the worker, exposes status, rows and run info as signals  |
| `src/app/pages/`         | Lazy-loaded routes: dashboard, settings, not found                                |
| `src/app/layout/`, `ui/` | Top bar controls, formatting pipes, value cell, imbalance bar, toasts, tooltip    |

## Decisions and trade-offs

**Generate and aggregate in a Web Worker, in Rust/Wasm.** At the maximum setting the producer
makes 20,000 updates a second. Doing that off the main thread leaves the main thread for rendering
and input, and Wasm makes generation cheap and deterministic.
_Trade-off:_ contributors need a Rust toolchain and wasm-pack; the app has extra loading and error
states while the module downloads, and worker code is harder to debug than plain TypeScript.

**Send aggregated snapshots, not individual updates.** The worker folds every update into metrics
and posts one snapshot at a fixed rate, so the cost on the main thread does not grow with the
generation rate.
_Trade-off:_ the UI only sees the latest state, up to 100 ms old. Per-tick history (tick charts,
order-book replay) is not available in the UI without changing the protocol.

**Snapshot interval of 100 ms.** Measured on a production build with 50 instruments × 1,000
updates every 50 ms: a snapshot costs about 3.5 ms of main-thread work, so the UI uses about 3.5% of
the main thread at 100 ms, versus about 7% at 50 ms. No task came near the 50 ms long-task mark,
and a queued input waited at most 3.7 ms.
_Trade-off:_ faster refreshes cost more and are too fast to read; 250 ms is cheaper but the table
visibly lags the market.

**Packed `Float64Array`, transferred.** A snapshot is one flat buffer (10 numbers per instrument,
`null` as `NaN`) whose memory is moved to the main thread rather than structured-cloned as 50
objects.
_Trade-off:_ a small codec (`metrics-codec.ts`) has to stay in sync with `InstrumentMetrics`, and
the field order is a contract between worker and UI.

**Integer money.** Prices are integer ticks (cents) and quantities integer lots all the way from
Rust to formatting; only VWAP, a derived average, is fractional. Formatting uses cached
`Intl.NumberFormat` instances.
_Trade-off:_ sums of price × quantity are float64 and are exact only below 2^53, which is far beyond
what a session generates but is a real ceiling.

**Constant-memory metrics.** The aggregator keeps a few typed-array accumulators per instrument and
no update history, so memory stays flat however long a run lasts.
_Trade-off:_ windowed metrics (for example a 5-minute VWAP) cannot be computed from what is stored.

**Runs with ids.** Every Apply or Retry starts a new run with a new id, and snapshots from earlier
runs are dropped, so the screen never mixes old and new settings.
_Trade-off:_ applying settings resets all metrics; there is no live reconfiguration of a run.

**Pause does not make up time.** Resume continues with the next batch; nothing is generated for the
paused period.
_Trade-off:_ total updates no longer equal rate × elapsed time once a run has been paused.

**Seeded, deterministic producer.** xorshift64\* with a seed: the same seed and instrument count
replay the same market, which makes tests and bug reports reproducible.
_Trade-off:_ the PRNG is not cryptographically secure, and the random walk is a simple model, not a
realistic market.

**Zoneless, OnPush and signals.** Change detection runs only when a signal the template reads
changes, and each snapshot triggers one pass. Templates keep views stable between snapshots (for
example the price arrow element is reused when the direction flips), so a snapshot updates text
and classes instead of creating DOM.
_Trade-off:_ nothing may rely on Zone.js to render after `setTimeout` or a promise; every state
change has to go through a signal.

**No virtual scrolling.** The table is capped at 50 rows, below the size where virtualization pays
off.
_Trade-off:_ raising the instrument limit well past ~100 would need `@angular/cdk/scrolling`.

**Cache-busted Wasm URL.** wasm-bindgen expects a fixed `.wasm` file name, so the build writes a
content hash and the app requests `findev_wasm_bg.wasm?v=<hash>`. A deploy never pairs new
JavaScript with an old cached module.
_Trade-off:_ an extra build step (`scripts/wasm-hash.mjs`) and a generated file in `wasm/pkg`.

**GitHub Pages hosting.** Free static hosting deployed from `main`, built with the repository name
as base href; `404.html` is a copy of `index.html` so deep links load the app.
_Trade-off:_ deep links are served with HTTP status 404 even though the page works, and there are
no custom headers (for example cache control or CSP).

## CI/CD

| Workflow                                     | Runs on                                | Does                                                                                       |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)         | Pull requests; manual run from Actions | Rust: fmt, clippy, tests. Angular: format, lint, unit tests (JUnit report artifact), build |
| [`deploy.yml`](.github/workflows/deploy.yml) | Pushes to `main`                       | Runs `ci.yml` first; only if it passes, builds and deploys to GitHub Pages                 |

CI runs once per pull request push, and a newer push cancels the older run. On `main`, runs queue
so a deploy is never cut off halfway. To test a branch without opening a PR, use **Actions → CI →
Run workflow**.

[Dependabot](.github/dependabot.yml) opens weekly update PRs for actions, npm and cargo. Angular
and TypeScript are updated together; TypeScript minor and major versions are skipped because each
Angular release supports only one TypeScript minor — upgrade those with `ng update`.
