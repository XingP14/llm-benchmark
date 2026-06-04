# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.4.x   | :white_check_mark: |
| 0.3.x   | :white_check_mark: (security backports only, until 2026-12-31) |
| < 0.3.0 | :x:                |

Only the latest minor receives security patches. The project is in 0.x pre-stable; no LTS branches are promised.

## Reporting a Vulnerability

**Preferred channel: GitHub Private Vulnerability Reporting**
→ https://github.com/XingP14/llm-benchmark/security/advisories/new

**Fallback**: Open a private security discussion at
https://github.com/XingP14/llm-benchmark/discussions (mark as "Security").

**Do not** report security issues in public GitHub issues, pull requests, or
social media before coordinated disclosure.

### What to include

- **Package + version** affected (e.g. `@xingp14/llm-benchmark@0.4.0`)
- **Deployment mode** (CLI / npm global / Docker image `xingp14/llm-benchmark:<tag>` / local dev)
- **Vulnerability class** (RCE, SSRF, auth bypass, injection, DoS, …)
- **Reproduction steps** (minimal config + command that triggers the issue)
- **Impact assessment** (data exposure, privilege gained, blast radius)
- **Discoverer info** (name/handle for credit; can be anonymous)

## Response SLA

| Stage | Target |
|-------|--------|
| Acknowledge report | 7 days |
| Initial triage + severity classification | 14 days |
| Patch for High / Critical (CVSS ≥ 7.0) | 30 days |
| Patch for Medium / Low (CVSS < 7.0) | 90 days |
| Coordinated disclosure window (after patch) | +14 days |

Timelines may slip for issues requiring upstream LLM provider coordination or
breaking-change fixes; maintainer will keep reporter informed.

## Scope

### In scope (reviewer focus)

- `src/core/evaluator.ts` — adapter routing, prompt construction, result aggregation
- `src/core/scoring/` — 5-dimension Scorer logic (function_calling / long_context / multi_turn / dialogue / coding)
- `src/web/server.ts` + `src/web/routes/` — Express endpoints, JWT auth, WebSocket upgrade
- `src/web/db/database.ts` — SQLite schema, prepared statements, migrations
- `src/adapters/` — 7 LLM provider adapters (API key handling, request signing, response parsing)
- `src/cli/` — `src/index.ts` switch, config loading, file I/O
- `package.json` + `package-lock.json` — dependency manifest

### Out of scope

- **Upstream LLM provider security** (OpenAI, Anthropic, GLM, DeepSeek, Qwen, Ollama) — disclose to the provider directly
- **Node.js / Docker runtime vulnerabilities** — disclose to the runtime maintainer
- **Benchmark dataset content** (the questions live in `src/data/` and are public data; correctness issues ≠ security issues)
- **Public-internet deployment hardening** — the project assumes a private network + reverse-proxy; TLS termination, rate limiting, and WAF are the operator's responsibility
- **Theoretical issues without a working PoC** — reports must demonstrate impact, not just code-reading guesses

## Reporter Credit

Confirmed reporters will be credited (opt-in) in:

- The fix commit message footer (`Reported-by:`)
- The GitHub Security Advisory author list
- A future `CHANGELOG.md` entry when one is added

Anonymous reports are accepted; just say so in the disclosure.

## Security Architecture Notes

- **API keys** are read from `config.json` (`models[].apiKey` / `api_key`) or environment variables and passed to adapters per-request. They are never logged, never written to the SQLite database, and never included in Web UI responses.
- **JWT auth** uses `jsonwebtoken` with HS256 (default secret from `JWT_SECRET` env var; auto-generated dev fallback with warning printed to stderr).
- **WebSocket** rejects unauthenticated upgrade requests with close code 4001 / 4002 (see `src/web/server.ts`).
- **SQLite** uses parameterized queries throughout (`better-sqlite3` prepared statements); no string concatenation in SQL builders.
- **Web UI** is served from `public/` as static assets; the Express backend enforces the same-origin policy via CORS allowlist (default: same-origin only).

For deployment / TLS hardening, see `README.md` § Web UI / Docker 部署.

## Policy Version

v1.0 — 2026-06-04
