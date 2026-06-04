# Contributing to LLM Benchmark

> `@xingp14/llm-benchmark@0.4.0` — 本地快速 LLM 大模型智力评测工具。
> This document explains how to file issues, send pull requests, and run the project locally.
> For design rationale and roadmap, see [`ROADMAP.md`](./ROADMAP.md).

Thanks for your interest in improving LLM Benchmark! 🎉
Contributions of all sizes — typo fixes, doc clarifications, new adapter providers, new scoring dimensions — are welcome.

## 🧭 Code of Conduct

By participating, you agree to follow the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Please be respectful and constructive. (A standalone `CODE_OF_CONDUCT.md` file is on the roadmap; in the meantime, the upstream Covenant applies.)

## 🐛 Reporting Bugs

**Please do not file security-sensitive bugs in public issues.** Use [GitHub Private Vulnerability Reporting](https://github.com/XingP14/llm-benchmark/security/advisories/new) — see [`SECURITY.md`](./SECURITY.md) for the full process.

For non-security bugs:

1. Search [existing issues](https://github.com/XingP14/llm-benchmark/issues?q=is%3Aissue) to avoid duplicates.
2. Open a new issue and include:
   - **What you did** (commands, config, code)
   - **What you expected** (one sentence)
   - **What happened** (actual output, stack trace, screenshot)
   - **Environment:** `@xingp14/llm-benchmark` version (`llm-bench --version` / `docker images xingp14/llm-benchmark`), Node.js version (>= 18), OS
3. Use a clear, lowercase, hyphen-separated title (e.g. `web: dashboard crashes when no evaluations exist`).

## 💡 Suggesting Features

Open an issue with the `enhancement` label and include:

- **Problem statement** — what workflow or pain point this addresses
- **Proposed solution** — high-level design (new adapter, new scoring dimension, new CLI flag, new Web UI section, etc.)
- **Alternatives considered** — why this approach over others
- **Affected module** — `src/core/evaluator.ts` / `src/core/scoring/` / `src/adapters/` / `src/web/` / `src/cli/` / `src/data/`

Maintainers will triage and reply within a few days. Large features (new adapter, new scoring dimension, schema migration) should be discussed in an issue **before** you start coding — this saves wasted PRs.

## 🔀 Pull Requests

### 1. Fork & branch

```bash
# Fork via GitHub UI, then:
git clone https://github.com/<your-username>/llm-benchmark.git
cd llm-benchmark
git remote add upstream https://github.com/XingP14/llm-benchmark.git
git checkout -b <type>/<short-topic>
```

Branch name conventions:

| Type | Example | Use for |
|------|---------|---------|
| `feat/` | `feat/adapter-mistral` | New user-facing capability |
| `fix/` | `fix/dashboard-render-empty` | Bug fixes |
| `docs/` | `docs/contributing-clarify` | Docs / comments / typos |
| `refactor/` | `refactor/scorer-extract` | Internal restructuring, no behavior change |
| `chore/` | `chore/deps-bump-better-sqlite3` | Tooling, deps, CI |

### 2. Develop

```bash
npm install
npm run build              # TypeScript must compile clean
npm run dev:web            # hot-reload Web UI on :3000 (API on :3000)
npm start                  # CLI: `ts-node src/index.ts`
```

Requirements: Node.js **>= 18** (CI runs on 20.x; see `.github/workflows/ci.yml`).

See [`docs/TESTING_STANDARD.md`](./docs/TESTING_STANDARD.md) for the test layout, coverage targets, and how to add a new benchmark dimension.

### 3. Test locally

We do **not** run `npm test` as part of PR CI yet (it is on the roadmap — see Story 3.3 in `ROADMAP.md`). Before requesting review:

```bash
npm run build              # TypeScript must compile clean
npm run lint               # ESLint (config: .eslintrc.cjs)
npx tsc --noEmit           # full type-check (catches lint gaps)
# Smoke-test the CLI:
npm start -- --version
npm start -- init
# Smoke-test the Web UI:
npm run build && npm run start:web
curl -s http://localhost:3000/api/health   # if available, else navigate to /
```

If your change touches `src/core/scoring/` or `src/adapters/`, also run the relevant Jest tests in `tests/` (file-scoped, e.g. `npx jest tests/scoring/dialogue.test.ts`).

### 4. Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — this lets `git log` stay searchable and aligns with future automated changelogs.

Format:

```
<type>(<scope>): <short summary>

<body explaining *why* (not *what* — the diff shows the what)

<footer with BREAKING CHANGE: ... or Refs: #123 if applicable>
```

Examples:

```
feat(adapter): add Mistral provider
fix(web): render history with 5-dimension filter
docs(security): add SECURITY.md vulnerability disclosure policy
chore(deps): move @types/* to devDependencies
```

Scopes (use the module name when relevant): `adapter`, `scoring`, `evaluator`, `web`, `cli`, `data`, `ci`, `deps`.

### 5. Push & open the PR

```bash
git push -u origin <your-branch>
# Open PR via GitHub UI against XingP14/llm-benchmark master
```

PR checklist:

- [ ] Title follows Conventional Commits
- [ ] Body explains the **why** and links the issue (e.g. `Closes #42`)
- [ ] `npm run build` compiles clean
- [ ] `npm run lint` produces 0 errors (warnings are OK; baseline is in `.eslintrc.cjs`)
- [ ] No stray `console.log` / `debugger` / commented-out code
- [ ] New CLI flag, REST endpoint, or scoring dimension is mentioned in the relevant `README.md` / `README.en.md` and `ROADMAP.md`
- [ ] Public API changes (new adapter contract, scoring dimension shape) are noted in the PR description — these need maintainer review before merge
- [ ] New adapter: includes a fixture in `src/data/` and a Jest test in `tests/adapters/`

## 🧱 Repository Layout (cheat sheet)

```
llm-benchmark/
├── src/
│   ├── index.ts              # CLI entry (ts-node)
│   ├── core/                 # evaluator + 5-dimension scoring
│   │   ├── evaluator.ts
│   │   └── scoring/          # dialogue / coding / function_calling / long_context / multi_turn
│   ├── adapters/             # 7 LLM providers (openai / anthropic / glm / deepseek / qwen / ollama / local)
│   ├── data/                 # benchmark questions (public dataset)
│   ├── cli/                  # CLI switch, config loader
│   ├── web/                  # Express server, routes, db (SQLite), WebSocket
│   └── __mocks__/            # Jest manual mocks
├── public/                   # Web UI static assets (HTML / JS / CSS)
├── tests/                    # Jest test suites (mirror src/)
├── docs/                     # ROADMAP, TESTING_STANDARD
├── docker/                   # Dockerfile
├── docker-compose.yml
├── config.example.json
├── jest.config.js
├── jest.setup.js
├── tsconfig.json
├── package.json              # @xingp14/llm-benchmark@0.4.0
├── README.md / README.en.md  # User-facing docs (zh / en)
├── ROADMAP.md                # Project roadmap
├── SECURITY.md               # Vulnerability reporting
├── CONTRIBUTING.md           # ← you are here
└── LICENSE                   # MIT
```

## 🚀 Release & Publishing

Maintainers handle releases. Two distribution channels:

| Channel | Artifact | Trigger | Notes |
|---|---|---|---|
| **npm** | `@xingp14/llm-benchmark` | Manual `npm publish` after `npm run build` | Requires login as `xingp14`; see `package.json#publishConfig` |
| **Docker Hub** | `xingp14/llm-benchmark:<tag>` | GitHub Actions on `v*` tag (`.github/workflows/docker.yml`) | Multi-arch (linux/amd64 + linux/arm64) |

Versioning follows [SemVer](https://semver.org/):

- **Patch** (`0.4.x`): bug fixes, doc fixes, dependency bumps — no API change
- **Minor** (`0.5.0`): new adapter, new scoring dimension, new CLI flag — backward-compatible
- **Major** (`1.0.0`): breaking CLI / API change — TBD; project is in 0.x pre-stable

You do **not** need to bump versions in your PR — maintainers will do that as part of release.

## ❓ Questions?

- **Bug?** Open an issue (see "Reporting Bugs" above).
- **Security?** Use [private reporting](https://github.com/XingP14/llm-benchmark/security/advisories/new) — see [`SECURITY.md`](./SECURITY.md).
- **Discussion / RFC?** Open an issue with the `discussion` label; for larger proposals (new adapter contract, new scoring dimension), draft a doc in `docs/` and link it.

Thanks for helping make LLM Benchmark better! 🐾
