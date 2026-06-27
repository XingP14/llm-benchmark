# Repository Hygiene

This file records what belongs in the LLM Benchmark repository and what must
stay local to a development host.

## Tracked Source

- Product source: `src/`, `public/`, `tests/`, `__mocks__/`
- Product docs: `README.md`, `README.en.md`, `ROADMAP.md`, `CHANGELOG.md`,
  `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `docs/`
- Package and build metadata: `package.json`, `package-lock.json`,
  `tsconfig.json`, `jest.config.js`, `jest.setup.js`, `.eslintrc.cjs`
- Docker metadata: `docker/`, `docker-compose.yml`, `.dockerignore`
- Safe examples: `config.example.json`

## Ignored Local State

These are intentionally ignored and should not be committed:

- dependency trees: `node_modules/`
- generated build output: `dist/`
- test coverage: `coverage/`
- runtime Web UI data: `data/`
- benchmark run outputs: `results/`
- local test databases: `test-data/`
- local runtime notes: `memory/`
- local configs and credentials: `config.json`, `config-*.json`,
  `config.local.json`, `*.local.json`, `.env*`, `.npmrc`
- Python and tooling caches: `__pycache__/`, `*.pyc`, `*.pyo`, `*.pyd`,
  `.cache/`, `.tmp/`

## Cleanup Rules

1. Use `git status --ignored --short` and `git clean -ndX` before deleting
   ignored files.
2. Do not run `git clean -fdX` blindly from the repository root. It can remove
   local databases, configs, and dependency trees that are useful for debugging.
3. Back up `data/`, `test-data/`, `results/`, and `memory/` before deleting them
   on a live host.
4. Keep `dist/` only as a local generated build product. The package publishes
   `dist`, but source control should keep it ignored and regenerate it with
   `npm run build`.
5. Keep `config.example.json` safe and generic. Real provider configs must stay
   local.

## Current Cleanup Decision

As of 2026-06-27, ignored local runtime directories were backed up and the
throwaway copies were removed from the working tree where safe. `node_modules/`
and `dist/` may remain locally to preserve fast verification and runtime smoke
tests, but they remain ignored.
