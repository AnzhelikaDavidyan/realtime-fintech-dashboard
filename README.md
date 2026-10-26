# Realtime Fintech Dashboard

Angular 22 app (standalone components, zoneless change detection, OnPush by default) fed by a
market data producer written in Rust, compiled to WebAssembly and run in a Web Worker.

Live demo: https://anzhelikadavidyan.github.io/realtime-fintech-dashboard/

## Requirements

- Node `^22.22.3 || ^24.15.0` — run `nvm use` (see `.nvmrc`)
- Rust (stable) with the `wasm32-unknown-unknown` target, and `wasm-pack`

## Scripts

| Command                                      | Purpose                                 |
| -------------------------------------------- | --------------------------------------- |
| `npm start`                                  | Dev server at http://localhost:4200     |
| `npm run build`                              | Production build to `dist/`             |
| `npm test`                                   | Angular unit tests (Vitest)             |
| `npm run build:wasm`                         | Build the Rust producer into `wasm/pkg` |
| `npm run lint`                               | ESLint (angular-eslint)                 |
| `npm run format`                             | Prettier write                          |
| `npm run format:check`                       | Prettier check                          |
| `cargo test --manifest-path wasm/Cargo.toml` | Rust unit and integration tests         |

`npm start`, `npm run build` and `npm test` build the Wasm package first.

## CI/CD

| Workflow                                     | Runs on                           | Does                                                                                       |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| [`ci.yml`](.github/workflows/ci.yml)         | Pull requests, pushes to branches | Rust: fmt, clippy, tests. Angular: format, lint, unit tests (JUnit report artifact), build |
| [`deploy.yml`](.github/workflows/deploy.yml) | Pushes to `main`                  | Runs `ci.yml` first; only if it passes, builds and deploys to GitHub Pages                 |

On pull requests and branches, a newer push cancels the older CI run. On `main`, runs queue so a
deploy is never cut off halfway.
