# LLM Benchmark - Local LLM Evaluation Tool

🎯 Fast, local LLM intelligence benchmarking. Compare multiple models across multiple providers in one run.

[![npm version](https://img.shields.io/npm/v/@xingp14/llm-benchmark.svg)](https://www.npmjs.com/package/@xingp14/llm-benchmark)
[![CI](https://github.com/XingP14/llm-benchmark/actions/workflows/ci.yml/badge.svg)](https://github.com/XingP14/llm-benchmark/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/v/xingp14/llm-benchmark?label=docker&sort=semver)](https://hub.docker.com/r/xingp14/llm-benchmark)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

> 📖 **Other languages:** [中文 (zh-CN)](./README.md)

## Features

- 🌐 **Multi-provider support**: OpenAI / Anthropic Claude / Zhipu GLM / DeepSeek / Qwen (DashScope) / Ollama (local)
- 📊 **Unified evaluation**: 5 dimensions — General Dialogue, Coding, Function Calling, Long Context, Multi-Turn Consistency (since v0.4.0)
- ⚡ **Fast local execution**: Batch-evaluate models with no cloud dependency
- 📈 **Visual reports**: Table rankings + per-dimension coloured score-bar gradients (JSON / Markdown / HTML — missing dimensions rendered as `-`)
- 🔄 **Multi-model comparison**: Run several models in parallel and produce a side-by-side report
- 🐍 **Sandboxed execution**: Coding benchmarks automatically run test cases

## Installation

### Option 1: `npx` one-shot (recommended, no install)

```bash
# Generate a starter config file in the current directory
npx @xingp14/llm-benchmark init

# Edit config.json to add your API keys

# Run the evaluation
npx @xingp14/llm-benchmark run --config config.json
```

### Option 2: Global install

```bash
npm install -g @xingp14/llm-benchmark
llm-bench --version
llm-bench init
```

### Option 3: From source

```bash
git clone https://github.com/XingP14/llm-benchmark.git
cd llm-benchmark
npm install
npm run build
```

## Quick start

```bash
# 1. Initialize config
llm-bench init

# 2. Edit config.json to add your API keys

# 3. Run the evaluation
llm-bench run --config config.json
```

## CLI usage

```bash
# Generate a starter config
llm-bench init

# Run an evaluation
llm-bench run --config config.json

# Compare two result files
llm-bench compare model-a.json model-b.json

# List available benchmark questions
llm-bench list

# Show version
llm-bench --version

# Show help
llm-bench help
```

## Web UI / Docker deployment

Since v0.3.0 there is also a Web UI (Express + WebSocket for real-time progress) backed by SQLite. Run it locally or via Docker.

### Local Web UI

```bash
# Build
npm run build

# Start the web server (defaults to port 3033)
npm run start:web
# or development mode
npm run dev:web
```

Open <http://localhost:3033> in your browser. Default admin account:

- Username: `admin`
- Password: from the `ADMIN_PASSWORD` environment variable, defaults to `admin123` (**change this in production**)

### Docker Compose

```bash
# Optional: set environment variables
export JWT_SECRET="your-strong-jwt-secret"
export ADMIN_PASSWORD="your-strong-password"

# Start
docker compose up -d

# Tail logs
docker compose logs -f
```

`docker-compose.yml` maps host `192.168.160.14:3033` to container `3033` and persists the SQLite database to `./data/llm-bench.db`. Edit the `ports` section of `docker-compose.yml` to change the listen address.

### Pull the prebuilt Docker image

Skip the local build — pull the official image from [Docker Hub](https://hub.docker.com/r/xingp14/llm-benchmark). It is built and pushed automatically by `.github/workflows/docker.yml` on every `v*` tag.

```bash
# Pull the latest image
docker pull xingp14/llm-benchmark:latest

# Run it (data is persisted to a named volume `llm-bench-data`)
docker run -d \
  --name llm-bench \
  -p 3033:3033 \
  -e JWT_SECRET="your-strong-jwt-secret" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -v llm-bench-data:/app/data \
  --restart unless-stopped \
  xingp14/llm-benchmark:latest
```

Pin a specific version:

```bash
docker pull xingp14/llm-benchmark:0.4.0
```

### Health check

```bash
curl http://localhost:3033/api/health
# {"status":"ok","timestamp":"2026-06-01T..."}
```

### What the Web UI gives you

- 🧩 Create / edit / delete benchmark configs in the browser
- ▶️ One-click run with WebSocket-pushed real-time progress
- 📜 Historical evaluation list + detailed results (filter by config/model)
- 🗃️ SQLite-backed persistence for configs and results — survives container restarts
- 🔐 JWT auth, every `/api/*` is protected

The CLI and the Web UI share the same SQLite database — mix and match.

### Dark mode

The Web UI automatically follows the operating system's dark mode setting (macOS / Windows / Linux all support `prefers-color-scheme: dark`); no manual toggle required — inputs, cards, tables and scrollbars are all adapted.

## Supported models

| Provider | `type` value | Example models |
|----------|--------------|----------------|
| OpenAI | `openai` | GPT-4, GPT-3.5-turbo |
| Anthropic | `anthropic` | Claude 3 Haiku, Claude 3 Opus |
| Zhipu | `glm` | GLM-4, GLM-3-Turbo |
| DeepSeek | `deepseek` | deepseek-chat, deepseek-reasoner |
| Qwen | `qwen` / `tongyi` / `dashscope` | qwen-turbo, qwen-plus, qwen-max, qwen3-max |
| Ollama (local) | `ollama` / `local` | llama3.2, qwen2.5, mistral, codellama, deepseek-r1 |
| Other | `openai` | Any OpenAI-compatible endpoint |

## Configuration

Minimal config (OpenAI / Anthropic / Zhipu GLM):

```json
{
  "models": [
    {
      "name": "gpt-4",
      "endpoint": "https://api.openai.com/v1",
      "apiKey": "sk-your-key",
      "type": "openai",
      "model": "gpt-4"
    },
    {
      "name": "claude-3",
      "endpoint": "https://api.anthropic.com",
      "apiKey": "sk-ant-your-key",
      "type": "anthropic",
      "model": "claude-3-haiku-20240307"
    },
    {
      "name": "glm-4",
      "endpoint": "https://open.bigmodel.cn/api/paas/v4",
      "apiKey": "your-key",
      "type": "glm",
      "model": "glm-4"
    }
  ],
  "benchmarks": {
    "dialogue": true,
    "coding": true
  },
  "output": "./results"
}
```

### DeepSeek (OpenAI-compatible, with reasoning-model fallback)

```json
{
  "models": [
    {
      "name": "deepseek-chat",
      "endpoint": "https://api.deepseek.com/v1",
      "apiKey": "sk-your-deepseek-key",
      "type": "deepseek",
      "model": "deepseek-chat"
    },
    {
      "name": "deepseek-reasoner",
      "endpoint": "https://api.deepseek.com/v1",
      "apiKey": "sk-your-deepseek-key",
      "type": "deepseek",
      "model": "deepseek-reasoner"
    }
  ],
  "benchmarks": { "dialogue": true, "coding": true }
}
```

> The `deepseek-reasoner` reasoning model returns a `reasoning_content` field; the adapter automatically falls back to it. Other OpenAI-compatible fields are parsed normally.

### Qwen / DashScope (compatible mode)

```json
{
  "models": [
    {
      "name": "qwen-turbo",
      "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "apiKey": "sk-your-dashscope-key",
      "type": "qwen",
      "model": "qwen-turbo"
    }
  ],
  "benchmarks": { "dialogue": true, "coding": true }
}
```

> `type` accepts `qwen` / `tongyi` / `dashscope` (all map to the same adapter). Other available models: `qwen-plus`, `qwen-max`, `qwen3-max`.

### Ollama (local, no API key required)

```json
{
  "models": [
    {
      "name": "ollama-llama",
      "endpoint": "http://localhost:11434",
      "apiKey": "ollama",
      "type": "ollama",
      "model": "llama3.2"
    }
  ],
  "benchmarks": { "dialogue": true, "coding": true }
}
```

> Prerequisite: Ollama must be running locally (`ollama serve`) and the model pulled (`ollama pull llama3.2`). `type` accepts `ollama` / `local`. The `apiKey` field is required but any non-empty string works (Ollama has no auth by default).

## Evaluation dimensions

### General Dialogue (13 questions)
| Sub-dimension | Description | Weight |
|---------------|-------------|--------|
| factual_accuracy | Factual accuracy | 1.0 |
| instruction_following | Instruction following | 1.5 |
| reasoning | Reasoning ability | 2.0 |
| context_awareness | Context consistency | 1.5 |
| safety | Safety | 2.0 |

### Coding (11 questions)
| Sub-dimension | Description | Weight |
|---------------|-------------|--------|
| syntax | Syntax correctness | 1.0 |
| string_processing | String manipulation | 1.5 |
| array_operations | Array operations | 1.5 |
| algorithms | Algorithms | 2.0 |
| data_structures | Data structures | 1.5 |

### Function Calling (5 questions) — new in v0.4.0
| Sub-dimension | Description | Weight |
|---------------|-------------|--------|
| Simple parameters | Single tool, single argument | 1.0 |
| Multi-tool selection | Pick the right one from many candidates | 1.5 |
| Required parameters | All required fields present | 1.5 |
| Nested objects | Nested JSON shapes | 2.0 |
| Array parameters | Array-typed arguments | 1.5 |

> Scoring: name + args both correct = 100; name correct, args partial = 70; name correct, args wrong = 40; name wrong = 0. Enable in `config.json` under `benchmarks` with `"function_calling": true` (defaults to `false`). The same field name is used by both CLI and the Web API.

### Long Context (3 questions) — new in v0.4.0
| Sub-dimension | Description | Weight |
|---------------|-------------|--------|
| Needle in haystack | Locate a key fact in 32k+ context | 1.5 |
| Long-doc key-fact extraction | Multi-paragraph key points | 1.5 |
| Multi-doc cross-reference | Cross-segment consistency | 2.0 |

> Scoring: based on `keyFacts` hit ratio (100 / hit-ratio × 100 / 0). Requires a model context window ≥ 32k. Enable in `config.json` under `benchmarks` with `"long_context": true` (defaults to `false`).

### Multi-Turn Consistency (3 questions) — new in v0.4.0
| Sub-dimension | Description | Weight |
|---------------|-------------|--------|
| Context retention | Remember key facts across turns (e.g. name/age/preferences) | 2.0 |
| Persona consistency | Stay in character (e.g. a Chinese chef does not answer Western cuisine questions) | 1.5 |
| Logical consistency | No self-contradiction across turns | 2.0 |

> Scoring: base = `required` phrase hit ratio × 100; each `forbidden` phrase hit subtracts 20; clamped to [0, 100]. Enable in `config.json` under `benchmarks` with `"multi_turn": true` (defaults to `false`).

### Roadmap (v0.5.0 candidates)

| Benchmark | Type | Status | Source |
|-----------|------|--------|--------|
| `webdev_arena` | Full-stack code gen / ELO pairwise scoring | Candidate (v0.5.0) | [webdevarena.com](https://webdevarena.com) |
| `terminal_bench` | Agentic coding / terminal tasks | Candidate (v0.5.0) | Terminal Bench 2.0 |
| `aa_omniscience` | Hallucination + knowledge coverage | Candidate (v0.5.0) | Artificial Analysis |
| `benchlm_agentic` | Agentic eval suite (Design2Code / Vision2Web / Native Evals, 24 evals) | Candidate (v0.5.0) | [BenchLM.ai](https://benchlm.ai/) (launched 2026-06-07, 248 models × 225 benchmarks) |
| `cyberseceval3` | LLM security / 8 risks (offensive security) | Candidate (v0.5.0) | Meta CyberSecEval 3 (launched 2025-12) |
| `swe_bench_pro` | Agentic SWE (multi-file / long-context / complex engineering) | Candidate (v0.5.0) | [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02, Mythos-tier anchor) |

> These are external / adversarial third-party benchmarks with different invocation patterns than the built-in question banks, so they are not toggled via the v0.4.0 `benchmarks: {true/false}` block. A skeleton `_external_benchmarks_roadmap` section (including `webdev_arena`) has been added to `config.example.json` / `config-batch2.json`. Enabling requires extending `src/types/index.ts BenchmarkConfig` and adding a dispatch branch in `src/core/evaluator.ts`.

> **2026-06 Mythos-tier SWE anchor**: first data point for `swe_bench_pro` is **claude-fable-5 = 80.3%** (2026-06-09, Stripe migrated 50M lines in 1 day with it; a traditional team estimated 2 months), the Mythos-tier main yardstick. Together with the 03:43 `src/core/evaluator.ts` JSDoc harness-drift note and the SWE-bench three-source cross-validation table below, it forms a "type-segment + JSDoc explanation + user-visible live sample" three-dimensional signal mesh.

### Mythos-class model access (v0.5.0 candidates, 2026-06-11)

| Model ID | Source / launch | Tier | Default route | Source |
|----------|-----------------|------|---------------|--------|
| `claude-fable-5` | Anthropic GA 2026-06-09 | Mythos-class (first public) | `cyberseceval3 (suite=both)` + LiveCodeBench/Terminal-Bench | [thehackernews](https://thehackernews.com/2026/06/anthropic-releases-claude-fable-5-its.html) / [macrumors](https://www.macrumors.com/2026/06/09/anthropic-fable-5/) / [forbes](https://www.forbes.com/sites/zacharyfolk/2026/06/09/anthropic-releases-first-public-version-of-claude-mythos-with-major-safeguards/) |
| `claude-mythos-5` | Anthropic 2026-06-09 (stronger, cyberdefenders / US Gov) | Mythos-class | `cyberseceval3 (offensive 优先)` | Forbes (same) |

> Use `Artificial Analysis Coding Index` (LiveCodeBench + SciCode + Terminal-Bench composite) for triangulation. The 5-min cron does not call the real Anthropic API (Mythos-tier rate-limit). Full routing PR estimated 30-45min spanning 6-9 cron rounds; currently effective only via `_external_benchmarks_roadmap.*.model_id` (free-form string, no type change for backward compatibility). See `src/core/evaluator.ts` v0.5.0 model_id routing hint note (2026-06-11).

> **2026 H1 leaderboard signals**: BenchLM.ai's agentic eval suite (24 evals) + CyberSecEval3's expansion into offensive security (8 risks) join METR time horizons (GPT-5.2 agentic task duration 352.2min) and AA Omniscience (hallucination + knowledge) as leading indicators that leaderboards have shifted from "model × knowledge" to "model × agentic + security". Real enabling requires the v0.5.0 dispatch PR.

### SWE-bench three-source cross-validation (2026-06, live harness-drift samples)

> The same model scores very differently across SWE-bench harnesses — always triangulate before making decisions. Per [DigitalApplied "LLM Benchmark Methodology 2026"](https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide) "harness-multiplier effect (same model, same benchmark, different harness can swing 10–20 pts) + confidence interval triangulation"; complements the 22:34 JSDoc harness-drift note in `src/core/evaluator.ts`.

| Model | vals.ai SWE-bench Verified (±CI) | swebench.com SWE-bench Verified | benchlm.ai SWE-bench Pro |
|-------|-----------------------------------|----------------------------------|---------------------------|
| Claude Opus 4.8 | **88.60%** ±1.42 | — | 69.20% |
| Claude Opus 4.7 (Adaptive) | 82.00% | — | 64.30% |
| Claude Sonnet 4.6 | 77.40% | — | — |
| GPT-5.5 | 82.60% | — | — |
| GPT-5-2 Codex (high reasoning) | — | 72.80% | — |
| Gemini 3 Flash (high reasoning) | — | **75.80%** | — |
| DeepSeek V3.2 | — | 70.00% | — |
| Claude Mythos Preview | — | — | **77.80%** |

> ⚠️ **Harness drift warning**: the same **Opus 4.8** scores **88.60%** on vals.ai SWE-bench Verified vs **69.20%** on benchlm.ai SWE-bench Pro — a **19.4-point gap**, a textbook harness-multiplier effect. Before deciding on a model, run at least three independent harnesses, take the mean, and report a 95% CI; do not rely on a single leaderboard ranking. Sources: [vals.ai/benchmarks/swebench](https://vals.ai/benchmarks/swebench) (2026-06) / [swebench.com](https://www.swebench.com) (updated 2026-02-19) / [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02).

> **v0.5.0 PR progress**: type declaration ✅ for all 5 entries (`webdev_arena` / `terminal_bench` / `aa_omniscience` / `benchlm_agentic` / `cyberseceval3`, 2026-06-10 00:24 + 06:43 cron) / `src/index.ts` console.info hint ✅ / `src/core/evaluator.ts` dispatch branches ✅ skeleton for all 5 entries (route entry, 2026-06-10 01:43 + 22:23 cron) / `src/web/routes/evaluations.ts` config acceptance ⏳ — full PR estimated 30-45min (spanning 6-9 cron rounds); v0.5.0 will not be released before the full PR lands.

## Output reports

After each evaluation run, three report files are produced:

- `benchmark-xxx.json` — raw data
- `benchmark-xxx.md` — Markdown report
- `benchmark-xxx.html` — visual HTML report (per-dimension score bars + detail cards)

## Development

```bash
# Install dependencies
npm install

# Dev mode
npm run start

# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```

## Version history

### v0.4.0 (2026-06-02)
- ✨ Renamed package to `@xingp14/llm-benchmark`, added `publishConfig.access: "public"` (verified with `npm publish --dry-run`: 95 files / 46.7 kB ✅)
- ✨ Added GitHub Actions CI workflow (Node 20 + lint + build + `npm test --bail`)
- ✨ Added Docker Hub auto-build workflow (builds `xingp14/llm-benchmark` on every `v*` tag)
- ✨ Added GitHub Actions / Docker Hub / npm version / License / Node badges at the top of README
- ✨ Added a new "Pull the prebuilt Docker image" subsection (with full `docker pull` / `docker run` / tag-pin examples)
- ✨ Switched the quick-start to `npx @xingp14/llm-benchmark`
- ✨ Added DeepSeek adapter (`type: 'deepseek'`, OpenAI-compatible, with `deepseek-chat` default + `deepseek-reasoner` reasoning fallback)
- ✨ Added Qwen (DashScope) adapter (`type: 'qwen' | 'tongyi' | 'dashscope'`, default `qwen-turbo`, also supports `qwen-plus` / `qwen-max` / `qwen3-max`)
- ✨ Added Ollama local-model adapter (`type: 'ollama' | 'local'`, default `http://localhost:11434` + `llama3.2`, no API key needed)
- ✨ Added Function Calling dimension (5 questions, `Scorer.scoreFunctionCalling`: name+args 100/70/40/0, CLI + Web + DB + API wired up end-to-end)
- ✨ Added Long Context dimension (3 questions, requires 32k+ context, `Scorer.scoreLongContext` based on keyFacts hit ratio, CLI + Web + DB + API wired up end-to-end)
- ✨ Added Multi-Turn Consistency dimension (3 questions, `Scorer.scoreMultiTurn` based on required/forbidden phrase checks, CLI + Web + DB + API wired up end-to-end)

### v0.3.0 (2026-05-23)
- ✨ Added Web UI (Express + WebSocket for real-time progress)
- ✨ Added SQLite data layer (configs / evaluations / results)
- ✨ Added JWT auth
- ✨ Added Docker / docker-compose one-shot deployment
- 🐛 Fixed 3 scoring bugs
- 🐛 Stabilized 56 failing tests (SQLite race + coverage)

### v0.2.0 (2026-05-23)
- ✨ Added Anthropic Claude adapter
- ✨ Added Zhipu GLM adapter
- ✨ Added Python sandbox executor

### v0.1.0 (2026-05-23)
- 🎉 First release
- ✅ OpenAI-compatible endpoint support
- ✅ Dialogue evaluation (13 questions)
- ✅ Coding evaluation (11 questions)
- ✅ Report generation

## License

MIT

## Documentation

- [SECURITY.md](./SECURITY.md) — Vulnerability reporting & security policy
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Contributing guide (PR workflow / commits / dev setup)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Community code of conduct (Contributor Covenant v2.1)
- [CHANGELOG.md](./CHANGELOG.md) — Versioned changelog (Keep a Changelog 1.1.0)
- [ROADMAP.md](./ROADMAP.md) — Project roadmap & near-term plans
