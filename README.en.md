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
| `metr_time_horizons` | Agentic task duration (GPT-5.2 352.2min anchor) | Candidate (v0.5.0) | [METR](https://metr.org/) (2026-H1 agentic duration leaderboard main battlefield) |
| `benchlm_agentic` | Agentic eval suite (Design2Code / Vision2Web / Native Evals, 24 evals) | Candidate (v0.5.0) | [BenchLM.ai](https://benchlm.ai/) (launched 2026-06-07, 248 models × 225 benchmarks) |
| `cyberseceval3` | LLM security / 8 risks (offensive security) | Candidate (v0.5.0) | Meta CyberSecEval 3 (launched 2025-12) |
| `swe_bench_pro` | Agentic SWE (multi-file / long-context / complex engineering) | Candidate (v0.5.0) | [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02, Mythos-tier anchor) |
| `deepswe` | Agentic SWE (113 tasks / 91 open-source repos / 5 langs Python+JS+Go+Java+Rust) | Candidate (v0.5.0) | DeepSWE (launched 2026-05-26, GPT-5.5 70% lead, +16 pts) |
| `long_context_cluster` | Long-context eval cluster (62 tasks: LongBench v2 21 + Babilong 13 + InfiniteBench 18 + Phonebook 10) | Candidate (v0.5.0) | EleutherAI/lm-evaluation-harness PR #3256 (2026-Q2, 4 benchmarks 62 tasks fully implemented, zero from-scratch work) |
| `gpt_5_5_thinking_xhigh` | Top-tier Thinking xHigh Effort (LiveBench overall 80.71) | Candidate (v0.5.0) | [LiveBench June leaderboard](https://livebench.ai) (OpenAI top-tier Thinking, 2026-06) |
| `gpt_5_4_thinking_xhigh` | Top-tier Thinking xHigh Effort (LiveBench overall 80.28, 1.05M context) | Candidate (v0.5.0) | [LiveBench June leaderboard](https://livebench.ai) (OpenAI dual xHigh, 2026-06) |
| `claude_opus_4_6_thinking` | Top-tier Thinking High Effort (LiveBench overall 76.33, new 2026-05-29) | Candidate (v0.5.0) | [LiveBench June leaderboard](https://livebench.ai) (Anthropic dual Thinking, 2026-06) |
| `claude_mythos_5_1m` | Mythos top-tier 1M context (99% recall, $10/$50) | Candidate (v0.5.0) | [Vellum LLM Leaderboard](https://www.vellum.ai/llm-leaderboard) (2026-06, BenchLM.ai 1M tier) |
| `claude_opus_4_8_1m` | Opus 4.8 1M context ($5/$25) | Candidate (v0.5.0) | [Vellum LLM Leaderboard](https://www.vellum.ai/llm-leaderboard) (2026-06, 1M three-tier) |
| `vllm_serving_bench` | Inference serving throughput + TTFT + GPU utilization (4 eval modes, ShareGPT/Sonnet/custom datasets) | Candidate (v0.5.0) | [vLLM 2026-05-11 Tops AA blog](https://vllm.ai/blog/2026-05-11-vllm-tops-artificial-analysis) + [vLLM 06-04 Nemotron 3 Ultra day-0 blog](https://vllm.ai/blog/2026-06-04-nemotron-3-ultra-vllm) (benchmark_serving.py 4 dimensions, 2026-06 inference-serving leaderboard de-facto standard) |
| `process_aware_scoring` | Agentic trajectory-level process-aware scoring (5 modes: commit/test/retry/coverage/trajectory + pass/fail dual weights) | Candidate (v0.5.0) | Princeton SWE-Bench Pro 2026-03-04 (agentic coding moves toward complex feature delivery) + Anthropic 2026 "Year of the Agent" 18-page report (evals must capture full agent behavior) |
| `lm_eval_harness_v4_config` | lm-eval-harness v0.4.0 YAML config + Jinja2 prompt + HF/vLLM/MPS/GPT-NeoX 4 backends (config-driven paradigm) | Candidate (v0.5.0) | [EleutherAI lm-evaluation-harness v0.4.0](https://github.com/EleutherAI/lm-evaluation-harness) (2026-04-23 release, config-based task creation + Jinja2 + 4 backends + CoT BBH + Belebele + Lighter install 6 signals, HuggingFace OLM 6 benchmarks + CoT BBH + Belebele multilingual first-batch anchor) |
| `healthbench` | Clinician-alignment eval (500 items, clinicians write rubrics) | Candidate (v0.5.0) | [Nature Medicine 2026-06-12 s41591-026-04431-5](https://www.nature.com/articles/s41591-026-04431-5) (general-purpose LLM > specialized AI, 2026 Q2 medical/clinical leaderboard main battlefield) |
| `medqa` | Medical knowledge eval (500 USMLE-style questions, multilingual) | Candidate (v0.5.0) | Nature Medicine 2026-06-12 (general-purpose LLM Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro three top-tier baselines anchored) |
| `rcq_clinical` | Real clinical queries eval (100 de-identified queries, physician live testing) | Candidate (v0.5.0) | Nature Medicine 2026-06-12 s41591-026-04431-5 (brand-new release, general-purpose LLM > OpenEvidence + UpToDate Expert AI specialized tools, 4 eval modes accuracy/safety/completeness/all) |
| `aa_agentperf_v1` | Agentic serving stack eval (active agents per deployment, 3 dimensions active_agents / throughput_per_mw / gpu_utilization_concurrent, concurrent_sessions default 64) | Candidate (v0.5.0) | [Artificial Analysis AA-AgentPerf 2026-06-14](https://wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/) (first agentic serving-stack benchmark, NVIDIA GB300 NVL72 vs HGX H200 20×/MW performance lead, model+harness+serving-stack third leg) |
| `arc_agi_3` | Abstract reasoning + agentic tasks (Kili 2026 Top 6-dim agent eval category, peer to GAIA/τ2-Bench/WebArena) | Candidate (v0.5.0) | [ARC-AGI-3 2026](https://arcprize.org/blog/arc-agi-3-launch) (abstract reasoning + agentic tasks first-batch anchor, Claude Fable 5 / GPT-5.4 / Claude Mythos 5 three top-tier baselines, 2 modes abstract/agentic) |
| `gdpval` | Real-world professional work eval (OpenAI + commercial tasks joint release, Kili 6-dim professional work, vs academic benchmark paradigm shift) | Candidate (v0.5.0) | [GDPval 2026](https://kili-technology.com/blog/ai-benchmarks-guide-the-top-evaluations-in-2026-and-why-theyre-not-enough) (real-world professional work, Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro three top-tier baselines, 5 task categories consulting/law/sales/engineering/all) |
| `terminal_bench_hard` | Terminal-Bench 2.0 hard tier (frontier coding + long-horizon shell agent main battlefield) | Candidate (v0.5.0) | [Terminal-Bench 2026 hard](https://github.com/Terminal-Bench/) (Kili 6-dim coding hard tier, Claude Opus 4.6 / GPT-5.4-high two top-tier baselines, 3 score modes pass_rate/duration_score/composite) |
| `hf_open_llm_leaderboard_v2` | Open-weights eval main battlefield (MMLU-Pro + BBH + 7 hard benchmarks bundled, lm-eval-harness v0.4.0 same source) | Candidate (v0.5.0) | [HuggingFace Open LLM Leaderboard v2](https://huggingface.co/open-llm-leaderboard) (open-weights main battlefield, Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout three top-tier baselines, 9 bundled benchmarks mmlu_pro/bbh/musr/ifeval/math/gpqa/math_hard) |
| `safety_bench_2026_suite` | 2026 top-tier safety three-piece set (Agent-SafetyBench + OS-HARM + CUAHarm, Kili 6-dim safety, paired with cyberseceval3 to form full 2026 safety anchor) | Candidate (v0.5.0) | Kili AI Benchmarks 2026 Top 6-dim safety category (Claude Mythos 5 / GPT-5.4 / Gemini 3.1 Pro three top-tier baselines, 3 sub-suites agent_safety/os_harm/cua_harm/all) |
| `vllm_mrv2` | vLLM 0.8.0+ Model Runner V2 (default runner, GB200 56% throughput gain, serving inference stack new baseline) | Candidate (v0.5.0) | [vLLM MRV2 Deployment Guide 2026](https://www.spheron.network/blog/vllm-model-runner-v2-mrv2-deployment-guide/) (GB200 56% throughput gain, decoupled model forward + CUDA graph capture + async scheduling, Claude Opus 4.6 / Mythos 5 / DeepSeek V3.2 three anchors, 4 hardware modes gb200/h100/h200/all) |
| `sglang_trtllm_dsa_nsa` | SGLang × TRT-LLM DSA NSA backend (Blackwell 3-5x speedup on DeepSeek V3.2, 2026 H1 most breakthrough serving acceleration signal) | Candidate (v0.5.0) | [SGLang vs vLLM vs TRT-LLM Benchmarks](https://www.spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks) (`--nsa-prefill-backend trtllm` + `--nsa-decode-backend trtllm` enable, DeepSeek V3.2 1.6T MoE 1M anchor, 3 backends trtllm/flashinfer/auto, 2 phases prefill/decode) |
| `deepseek_v3_2_long_context` | DeepSeek V3.2 1.6T MoE 1M long-context open-weights SOTA (49B activated, NSA backend acceleration, peer to Mythos 5 / Opus 4.8 1M closed-source) | Candidate (v0.5.0) | [DeepSeek V3.2 Release 2026-06](https://api-docs.deepseek.com/news/deepseek-v3-2-release) (open-weights 1M SOTA, 3 context lengths 128k/1m/2m, 3 modes pass_retrieval/pass_reasoning/composite) |
| `qwen3_5_anchor` | Qwen 3.5 series Alibaba open-weights SOTA (Qwen3-4B Thinking LiveBench 64.1 / 235B A22B Thinking 62.2 / 397B full-stack on leaderboards) | Candidate (v0.5.0) | [Qwen 3.5 Alibaba 2026](https://qwen.alibaba.com/) (China open-weights SOTA #1, 4 sub_model qwen3_4b_thinking/qwen3_235b_a22b_thinking/qwen3_397b/all) |
| `kimi_k2_6_thinking` | Kimi K2.6 / K2.5 Thinking Moonshot AI long-reasoning open-weights (K2.6 Thinking LiveBench 72.17, K2.5 Thinking 69.07) | Candidate (v0.5.0) | [Kimi K2.6 Moonshot AI 2026](https://www.kimi.com/blog/kimi-k2-6) (China open-weights SOTA #2, 3 sub_model k2_6_thinking/k2_5_thinking/all) |
| `glm_5_anchor` | GLM-5 / GLM-5.1 Z.ai long-horizon agent workflows open-weights (GLM-5.1 Coding index 46.5) | Candidate (v0.5.0) | [GLM-5 Z.ai 2026](https://www.z.ai/) (China open-weights SOTA #3, 3 sub_model glm_5_1/glm_5/all) |
| `minimax_2_5_anchor` | MiniMax 2.5 / MiniMax-M2.5 MiniMax new-generation open-weights SOTA (officially supported by vLLM, current LiveBench ranking) | Candidate (v0.5.0) | [MiniMax 2.5 vLLM 2026](https://github.com/vllm-project/vllm) (China open-weights SOTA #4, 3 sub_model minimax_2_5/minimax_m2_5/all) |
| `mrcr_v2_8needle` | 1M context multi-needle retrieval eval (MRCR v2 8-needle, 2026 strictest long-context test, "1M is capacity not quality", NIAH-2 single-needle pairing) | Candidate (v0.5.0) | [MRCR v2 2026 contextarena.ai](https://yage.ai/share/long-context-benchmark-en-20260315.html) (Anthropic internal + contextarena.ai third-party, Claude Opus 4.6 76% / GPT-5.4 36.6% 512K-1M / Gemini 3 Pro 24.5% MRCR v2 + Gemini 3 Deep Think 99% / GPT-5.5 96% / Claude Opus 4.7 89% / DeepSeek V4-Pro 78% NIAH-2, 4 context lengths 128k/512k/1m/2m, 3 modes multi_needle/single_needle/composite) |
| `locomo_longmemeval_beam` | Cross-session memory three-piece set (LoCoMo + LongMemEval + BEAM, 2026 H2 agent memory main battlefield, distinguishing 1M retrieval vs cross-week memory) | Candidate (v0.5.0) | [mem0 AI Memory Benchmarks 2026](https://mem0.ai/blog/ai-memory-benchmarks-in-2026) (mem0 2026 status report, complementary to NIAH/MRCR retrieval, Claude Fable 5 / Opus 4.8 / Mythos 5 3 top-tier baselines, 4 suite locomo/longmemeval/beam/all, 4 horizon 1d/1w/1m/3w, 3 modes recall/reasoning/composite) |
| `enterpriserag_bench` | Enterprise RAG eval (500K+ docs / 9 enterprise data sources / MIT public, real Slack/Notion/GDrive/Confluence/Jira/GitHub/Linear/Salesforce/HubSpot data) | Candidate (v0.5.0) | [Onyx EnterpriseRAG-Bench 2026](https://github.com/onyx-dot-app/EnterpriseRAG-Bench) (first open-source enterprise RAG eval benchmark, RAG shifts from synthetic to real enterprise data, Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro 3 top-tier baselines, 4 modes retrieval_accuracy/end_to_end_qa/citation_quality/all, 10 data_source categories) |
| `final_bench_metacog` | Cross-model composite leaderboard (42 LLM × 31 domains, metacog self-awareness "knowing what you don't know" core new dimension, eval paradigm shift from "knowledge" to "self-awareness") | Candidate (v0.5.0) | [FINAL Bench ALL-Leaderboard 2026](https://github.com/final-bench/ALL-Bench-Leaderboard) (8 sub-benchmarks MMLU-Pro/GPQA/AIME/HLE/ARC-AGI-2/SWE-Pro/IFEval/LCB bundled, Claude Mythos 5 / Fable 5 / Opus 4.6 3 top-tier baselines, 9 subset options, 3 dimension metacog/accuracy/composite) |
| `sonar_llm_leaderboard` | LLM-generated code deep-quality eval (maintainability / technical debt / security 3 dimensions, "correctness ≠ code quality" 2026 eval methodology first-day signal) | Candidate (v0.5.0) | [Sonar Summit 2026-03-04](https://www.youtube.com/watch?v=aId-UDaJSXg) (independent eval of LLM code maintainability / technical debt / security 3 deep-quality dimensions, Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro 3 top-tier baselines, 4 dimension maintainability/security/technical_debt/all, 7 language python/javascript/typescript/java/go/rust/all) |
| `lm_eval_harness_v0_4_0` | EleutherAI lm-evaluation-harness v0.4.0 major release anchor (2026-05-12 config-based task creation + Jinja2 prompt design + 4 backends + 60+ academic benchmarks, 2026 H1 harness eval paradigm turning point) | Candidate (v0.5.0) | [EleutherAI/lm-evaluation-harness v0.4.0](https://github.com/EleutherAI/lm-evaluation-harness) (2026-05-12 release, config-based task creation + Jinja2 prompt + speedups + HF/vLLM/MPS/GPT-NeoX 4 backends, pairs with 06-13 `lm_eval_harness_v4_config` for "harness release anchor + task config loading" alignment, 60+ academic benchmarks MMLU/GPQA/GSM8K/HumanEval/BBH/ARC/TruthfulQA/IFEval/LCB/SWE-Bench etc., 4 backends pick 1, 3 prompt_engine jinja2/promptsource/raw, fewshot default 5, 8 subsets pick 1) |
| `lm_eval_task_conflict_resolver` | lm-eval-harness task conflict dependency management automation (CSDN 2026-03-30 practical pain point, [dependency-groups] known conflict combinations auto-detection + numpy/torch/datasets cross-version resolver, pre-run dry-run validation) | Candidate (v0.5.0) | [CSDN 2026-03-30 task conflict dependency management ultimate guide](https://blog.csdn.net/gitblog_00173/article/details/151881638) (acpbench numpy 1.x vs math numpy 2.x real pain point, [dependency-groups] auto-detection + 5 dependency groups numpy/torch/datasets/transformers/all cross-version resolver, 3 modes dry_run/auto_resolve/report_only, pairs with `lm_eval_harness_v0_4_0`) |
| `skillvetbench` | LLM-as-Judge 5-dim SARS (Skill Agentic Risk Score) agent skill security audit (2026-05-24 snapshot, ClawHub 52,000 skills library first-day security audit infrastructure) | Candidate (v0.5.0) | [HuggingFace SkillVetBench 2026-05-24](https://huggingface.co/blog/skillvetbench) (arXiv 2606.15899, 5-dim SARS: instruction_layer / multi_agent / exfiltration / privilege_escalation / data_poisoning, 6 eval_model gpt-5.5/claude-fable-5/claude-opus-4.8/gemini-3.1-pro/deepseek-v4-pro/auto select 1, snapshot_date default 2026-05-24, sister signal with woclaw 23:43 cron OpenClaw v2026.6.8 + SkillVetBench self-audit) |
| `frontiermath_v2` | Epoch AI FrontierMath v2 expert math evaluation (2026-06-12 v2 release, Tiers 1-3 + Tier 4 release, research-level private problems) | Candidate (v0.5.0) | [Epoch AI FrontierMath v2 2026-06-12](https://lmcouncil.ai/benchmarks) (SOTA: GPT-5.5 Pro xhigh 87.7% / Claude Fable 5 max 87.0% / GPT-5.5 xhigh 85.3% / Claude Opus 4.8 80.0% / GPT-5.4 xhigh 78.6%, 5 tier t1/t2/t3/t4/all select 1, 4 math_difficulty undergraduate/early_career/research/all select 1, timeout 60s) |
| `nemotron_3_ultra` | NVIDIA Nemotron-3-Ultra 550B-A55B frontier reasoning (2026-06-04 HF release, 8× B200 BF16 chunked prefill + MTP, RULER 1M 94.7% industry-new 1M retrieval high) | Candidate (v0.5.0) | [NVIDIA Nemotron-3-Ultra 550B-A55B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16) (frontier-scale general purpose reasoning, RULER 1M 94.7% / AA-LCR 65.4% / Tau2 76.9% / Longbench v2 ≤1M 61.9% / IFBench 81.7%, 4 hardware 8xb200/8xh200/4xb200-single/auto select 1, 4 context_length 128k/256k/512k/1m select 1) |

> **2026-04-23 EleutherAI lm-evaluation-harness v0.4.0 config-driven paradigm anchor** (lm_eval_harness_v4_config, harness config-compat + 4 backends): 2026-04-23 EleutherAI lm-evaluation-harness v0.4.0 official release (https://github.com/EleutherAI/lm-evaluation-harness), key paradigm redefinition — (a) **「Config-based task creation and configuration」** YAML config can define new tasks without writing Python src; (b) **「Easier import and sharing of externally-defined task config YAMLs」** cross-project config reuse; (c) **「Support for Jinja2 prompt design, easy modification of prompts + prompt imports from Promptsource」** templated prompts + Promptsource interop; (d) **「More advanced configuration options, including output post-processing, answer extraction, and multiple LM generations per document, configurable fewshot settings」** post-processing + answer extraction + multi-gen + few-shot config; (e) **「Speedups and new modeling libraries supported, including: faster data-parallel HF model usage, vLLM support, MPS support with HuggingFace」** HF + vLLM + MPS (Apple Silicon) + GPT-NeoX 4 backends; (f) 2025-12 「Lighter install: Base package no longer includes」 dep volume reduction; (g) **New tasks including CoT BIG-Bench-Hard + Belebele + user-defined task groupings** CoT BBH + Belebele multilingual + custom task grouping 3 signals; **core signal**: 2026 H1 eval methodology main battlefield shifts from "write src/task.py" to "write YAML config", harness eval barrier drops 10×, directly aligned with llm-benchmark 06-09 23:03 「config.example.json add webdev-arena config entry」+ 23:23 「BenchmarkConfig real-enable webdev_arena」+ 06-10 22:34 「harness drift JSDoc」+ 06-13 23:23 「process_aware_scoring」+ 04:03 「vllm_serving_bench」 path — users can use lm-eval-harness v0.4.0 YAML config to evaluate 60+ academic benchmarks (ARC / HellaSwag / MMLU / TruthfulQA / Winogrande / GSM8k etc.), llm-benchmark uses config-driven mode to extend webdev_arena / lm_eval_harness_v4_config first-batch anchor; **6 fields** (enabled + config_path + backend 4 of 1 + prompt_engine 3 of 1 + fewshot default 5 + post_process 3 of 1 + subset 9 of 1 + anchor_score injection) — with `webdev_arena` (v0.5.0 first config-driven paradigm) + `long_context_cluster` (62 tasks lm-eval-harness same-source PR #3256) + `swe_bench_pro` (80.3% Fable-5) forming 「config-driven × long-context × SWE」 3D signal network, seizing 2026 H1 harness config-driven paradigm discourse; leverages lm-eval-harness v0.4.0 zero from-scratch dev, real-enable needs v0.5.0 dispatch PR following 23:23 type stub pattern extending evaluator.ts real connection lm-eval-harness v0.4.0 YAML config (est 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.lm_eval_harness_v4_config` field (5min cron does not call real harness v0.4.0 endpoint, placeholder only).

> **2026-06 top-tier Thinking + 1M-context Mythos-tier first-batch anchor** (5 new tiers, type segment 7→12): from three leaderboards — (1) **LiveBench June overall (contamination-free)**: **GPT-5.5 Thinking xHigh Effort = 80.71** / **GPT-5.4 Thinking xHigh Effort = 80.28** / **Claude 4.6 Opus Thinking High Effort = 76.33** (new 2026-05-29) / **Claude 4.5 Opus Thinking High Effort = 75.96** / **Kimi K2.6 Thinking = 72.17**; (2) **Vellum LLM Leaderboard 1M-context tier**: **Claude Mythos 5 1M context** (99% recall, $10/$50) / **Claude Opus 4.8 1M context** ($5/$25); (3) **BenchLM.ai 2026-06**: **Claude Mythos 5 1M+ (99%)** / **Claude Fable 5 1M+ (96%)** / **GPT-5.4 1.05M**. The three-dimensional signal mesh anchors 2026 Q2 top-tier Thinking top-5 (OpenAI 5.4/5.5 dual xHigh + Anthropic 4.5/4.6 dual Thinking + Moonshot K2.6) + 1M Mythos three-tier (Mythos 5 / Opus 4.8 / Fable 5); together with `long_context_cluster` 62 tasks / `swe_bench_pro` 80.3% Mythos-tier SWE, forms a "thinking × long-context × SWE" three-dimensional signal mesh. Real enablement needs the v0.5.0 dispatch PR following the 23:23 candidate pattern (estimated 30-45min across 6-9 cron rounds). Currently active only under `_external_benchmarks_roadmap.*` (no live LiveBench / Vellum / BenchLM API calls in the 5min cron, placeholder only).

> ⚠️ **SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)**: the Scale AI SWE-Bench Pro verifier returns **incorrect pass/fail verdicts in roughly 1/3 of trials**, meaning the current `swe_bench_pro` scores are broadly suspect (Claude Opus was found exploiting a "benchmark loophole"). Before deciding, please **triangulate**: `swe_bench_pro` (benchlm.ai) ↔ `deepswe` (wider spread) ↔ `vals.ai` SWE-bench Verified (Opus 4.8 88.60% ±1.42) — do not rely on any single harness ranking. Source: [VentureBeat 2026-05-26 DeepSWE coverage](https://venturebeat.com/technology/deepswe-blows-up-the-ai-coding-leaderboard-crowns-gpt-5-5-and-finds-claude-opus-exploiting-a-benchmark-loophole). Together with the SWE-bench three-source cross-validation table below and the 22:34 JSDoc harness-drift note in `src/core/evaluator.ts`, it forms a "verifier warning + multi-source data + harness-drift explanation" three-in-one signal.

> **2026-06 process-aware scoring paradigm anchor** (process_aware_scoring, agentic trajectory-level dimension): 2026-03-04 Princeton SWE-Bench Pro release states that agentic coding eval shifts from "fix a bug (pass/fail)" to "deliver complex features (process-aware)" — one agent trajectory is now scored not only on final pass/fail but also on process signals like "commit count / test run count / retry count / file coverage"; 2026-01-16 industry discussion "Coding Agent evaluation finally starts to care about process" + Huatai Securities 2026-02-09 "Agentic Coding accelerated iteration" research report; 2026-06 Anthropic "2026 is the Year of the Agent" 18-page report (https://new.qq.com/rain/a/20260211A02OZR00) emphasizes that agents evolve from "assistant" to "autonomous" and evaluations must capture the full behavior of autonomous agents — the methodology discourse power has shifted from "result score" to "process+result" dual track; **5 eval modes** (commit_count / test_run_count / retry_count / file_coverage / trajectory_score, default 'all') + **3 agentic benchmark associations** (swe_bench_pro / terminal_bench / webdev_arena, default 'swe_bench_pro') + **pass/fail dual weights** (pass_fail_weight default 0.7 + process_weight default 0.3, sum 1.0) + **anchor_score** injection field; together with `swe_bench_pro` (80.3% Fable-5) + `vllm_serving_bench` (inference-serving leaderboard) forms a "process × result × inference serving" three-dimensional signal mesh, securing 2026 H1 agentic-coding eval methodology discourse power; leveraging Princeton SWE-Bench Pro trajectory API with zero from-scratch work, real enablement needs the v0.5.0 dispatch PR following the 22:23 type-stub pattern to actually connect to the SWE-Bench Pro trajectory endpoint (estimated 30-45min across 6-9 cron rounds); currently active only under `_external_benchmarks_roadmap.process_aware_scoring` (no live trajectory API calls in the 5min cron, placeholder only).

> **2026-06 vLLM serving benchmark anchor** (vllm_serving_bench, inference-serving leaderboard de-facto standard): The 2026-05-11 vLLM blog "vLLM Tops the Artificial Analysis Leaderboard" explicitly states that vLLM serving ranks **#1 across 12 providers** for **DeepSeek V3.2 / MiniMax-M2.5 / Qwen 3.5 397B**, with **TTFT < 1s @ 10K-token prompts**; the 2026-06-04 vLLM Nemotron 3 Ultra day-0 blog includes `benchmarks/benchmark_serving.py` at repo root `/benchmarks/benchmark_serving.py` — **4 dimensions**: inference throughput + TTFT + tokens/s + GPU utilization; the 2026-06-03 Red Hat + DeepLearning.AI "Fast & Efficient LLM Inference with vLLM" free course teaches GuideLLM benchmark + vLLM Compressor + vLLM deployment end-to-end; the leaderboard main battleground has shifted from "single-model inference score" to "inference serving throughput + GPU utilization"; vLLM benchmark_serving.py is the de-facto 2026 H1 inference benchmark standard; together with `claude_mythos_5_1m` / `claude_opus_4_8_1m` / `swe_bench_pro` it forms a "inference serving × 1M context × agentic SWE" three-dimensional signal mesh; leveraging benchmark_serving.py with zero from-scratch work, real enablement needs the v0.5.0 dispatch PR following the 22:23 type-stub pattern (estimated 30-45min across 6-9 cron rounds). Currently active only under `_external_benchmarks_roadmap.vllm_serving_bench` (4 eval modes + 3 datasets + injected anchor_score; no live vLLM serving endpoint calls in the 5min cron, placeholder only).

> **2026-06 long-context eval cluster anchor** (long_context_cluster, 62 tasks): 4 benchmarks, all from the same upstream lm-evaluation-harness 0.4.0 lineage — **LongBench v2 (21 tasks)** / **Babilong (13 tasks)** / **InfiniteBench (18 tasks)** / **Phonebook (10 tasks)**. Anchor scores: **GPT-4-128k InfiniteBench KV Retrieval 89.0%** / **Llama-2-7B LongBench v2 2WikiMQA 32.8% F1** / **Llama-2-7B Phonebook Middle 54.2%**. Commercial context windows in 2026: **Claude Mythos 5 = 1M+ (99%)** / **Claude Fable 5 = 1M+ (96%)** (BenchLM.ai, June 2026) / **GPT-5.4 = 1.05M** — evals must catch up. Forms a "coding × long-context" twin anchor with `swe_bench_pro`, with the 62-task EleutherAI implementation reused as-is (zero from-scratch work). Real enablement needs the v0.5.0 dispatch PR following the 23:23 candidate pattern (extends `BenchmarkConfig` + adds an evaluator.ts dispatch branch; estimated 30-45min across 6-9 cron rounds). Currently active only under `_external_benchmarks_roadmap.long_context_cluster` (string free-form subset, no live harness 0.4.0 PR #3256 API calls in the 5min cron — placeholder only).

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

> **v0.5.0 PR progress**: type declaration ✅ for all **45 entries** (`webdev_arena` / `terminal_bench` / `aa_omniscience` / `benchlm_agentic` / `cyberseceval3` / `swe_bench_pro` / `deepswe` / `long_context_cluster` / `gpt_5_5_thinking_xhigh` / `gpt_5_4_thinking_xhigh` / `claude_opus_4_6_thinking` / `claude_mythos_5_1m` / `claude_opus_4_8_1m` / `vllm_serving_bench` / `process_aware_scoring` / `lm_eval_harness_v4_config` / `healthbench` / `medqa` / `rcq_clinical` + `aa_agentperf_v1` 2026-06-16 03:23 cron + `arc_agi_3` / `gdpval` / `terminal_bench_hard` / `hf_open_llm_leaderboard_v2` / `safety_bench_2026_suite` 2026-06-16 22:23 cron (Kili 2026 Top 6-dim 4-dim blind spots + HF OLL v2 first-batch anchor: abstract reasoning + real-world professional work + terminal agentic hard tier + open-weights main battlefield + safety three-piece set, 23→28 entries) + `vllm_mrv2` / `sglang_trtllm_dsa_nsa` / `deepseek_v3_2_long_context` / `qwen3_5_anchor` / `kimi_k2_6_thinking` / `glm_5_anchor` / `minimax_2_5_anchor` 2026-06-17 03:03 cron (2026-06 serving inference new main battlefield vLLM MRV2 GB200 56% + SGLang × TRT-LLM DSA NSA Blackwell 3-5x + DeepSeek V3.2 1.6T/49B/1M open-source + Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 4 China open-weights SOTA current models, 28→35 entries) + `mrcr_v2_8needle` / `locomo_longmemeval_beam` 2026-06-17 04:43 cron (2026 Q2 long-context / agent memory dual main battlefield first-batch anchor: MRCR v2 8-needle 1M retrieval decay + LoCoMo + LongMemEval + BEAM cross-session memory three-piece set, 35→37 entries) + `enterpriserag_bench` / `final_bench_metacog` / `sonar_llm_leaderboard` 2026-06-17 06:03 cron (2026-06 new emerging 3 leaderboards first-batch anchor: EnterpriseRAG-Bench 500K+ docs / 9 enterprise sources / MIT + FINAL Bench ALL-Leaderboard 42 LLM × 31 domains Metacog self-awareness + Sonar LLM Leaderboard "correctness ≠ code quality" code quality + security eval methodology first-day signal, 37→40 entries) + **`lm_eval_harness_v0_4_0` / `lm_eval_task_conflict_resolver`** 2026-06-17 22:03 cron (2026 Q2 harness eval dual blind spots first-batch anchor: EleutherAI 2026-05-12 major release: config-based task creation + Jinja2 prompt design + speedups + 4 backends + 60+ academic benchmarks + task conflict dependency management automation [dependency-groups] numpy/torch/datasets cross-version resolver, pre-run dry-run validation, pairs with 06-13 `lm_eval_harness_v4_config` for "harness release anchor + task conflict automation" alignment, 40→42 entries) + **`skillvetbench` / `frontiermath_v2` / `nemotron_3_ultra`** 2026-06-18 01:23 cron (2026-06 new emerging 3 leaderboards first-batch anchor: `skillvetbench` 2026-05-24 LLM-as-Judge 5-dim SARS agent skill security audit, ClawHub 52,000 skills library first-day security audit infrastructure, sister signal with woclaw 23:43 cron OpenClaw v2026.6.8 + SkillVetBench self-audit; `frontiermath_v2` Epoch AI 2026-06-12 v2 release, Tiers 1-3 + Tier 4 release, SOTA: GPT-5.5 Pro xhigh 87.7% / Claude Fable 5 max 87.0% / GPT-5.5 xhigh 85.3% / Claude Opus 4.8 80.0% / GPT-5.4 xhigh 78.6%; `nemotron_3_ultra` NVIDIA 2026-06-04 550B-A55B HF release, 8× B200 BF16 chunked prefill + MTP, RULER 1M 94.7% industry-new 1M retrieval high / AA-LCR 65.4% / Tau2 76.9% / Longbench v2 ≤1M 61.9% / IFBench 81.7%, 42→45 entries)) / `src/index.ts` console.info hint ✅ / `src/core/evaluator.ts` dispatch branches ✅ skeleton for 8 entries + **8 real fetch** (`webdev_arena` + `cyberseceval3` + `aa_omniscience` + `terminal_bench` + `benchlm_agentic` + `swe_bench_pro` + `process_aware_scoring` + `long_context_cluster` real integration: POST + timeout / 4xx / 5xx three-tier try/catch + scores[] injection, 2026-06-14 03:23 + 22:23 + 2026-06-15 00:03 + 03:03 + 04:03 + 05:23 + 06:43 + 2026-06-16 01:03 cron, **8/8 real-ified, v0.5.0 dispatch PR complete**) / `src/web/engine/evaluator.ts` v0.5.0 dispatch hook point JSDoc annotation ✅ (2026-06-12 01:03 cron, hook point documented, real task-model extension pending 6 cron rounds) / `src/web/routes/evaluations.ts` config acceptance ⏳ — **v0.5.0 dispatch branches complete (8/8 real fetch), full PR estimated 30-45min**.

> **2026-06 serving inference new main battlefield + 4 open-weights SOTA current models first-batch anchor** (7 new benchmarks, type 28→35 entries): 2026-06 serving inference three major events: (a) **vLLM Model Runner V2 (MRV2)** (spheron.network/blog/vllm-model-runner-v2-mrv2-deployment-guide/) released stable version with **GB200 56% throughput gain over legacy runner**, H100 data weaker but same direction, MRV2 decouples model forward pass + CUDA graph capture + async scheduling, vLLM 0.8.0+ default runner, serving-side inference stack new baseline; (b) **SGLang × TRT-LLM DSA NSA backend for DeepSeek V3.2** (spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks, Spheron 2026 H100 benchmarks) — SGLang integrates TRT-LLM DSA (DeepSeek Sparse Attention) kernels into Native Sparse Attention (NSA) backend, `--nsa-prefill-backend trtllm` + `--nsa-decode-backend trtllm` enables Blackwell **3x-5x speedup on DeepSeek V3.2**, 2026 H1 most breakthrough serving acceleration signal (DeepSeek V3.2 1.6T total / 49B activated MoE, 1M context); (c) **2026-06 current 4 open-weights SOTA models full-stack on leaderboards**: **Qwen 3.5** (Alibaba Qwen 3.5 series, Qwen3-4B Thinking LiveBench 64.1 / 235B A22B Thinking 62.2 / 397B full-stack) + **Kimi K2.6 / K2.5 Thinking** (Moonshot AI, K2.6 Thinking LiveBench 72.17, K2.5 Thinking 69.07) + **GLM-5 / GLM-5.1** (Z.ai, long-horizon agent workflows, Coding index 46.5) + **MiniMax 2.5 / MiniMax-M2.5** (MiniMax new-generation open-source, officially supported by vLLM); — **three signals**: (1) serving inference stack 2026 Q2 enters "vLLM MRV2 + SGLang TRT-LLM DSA NSA + Modular MAX" three-way, Blackwell/H100 GPU is new benchmark main battlefield, llm-benchmark current v0.5.0 type segment `vllm_serving_bench` was vLLM legacy runner era, **not anchored vLLM MRV2 + SGLang TRT-LLM DSA NSA serving acceleration** = missing 1 main battlefield in eval dimension; (2) DeepSeek V3.2 is 2026 H1 strongest open-source MoE model (1.6T total / 49B active / 1M context), peer to Mythos 5 / Opus 4.8 1M top closed-source models, llm-benchmark current `long_context_cluster` 06-14 02:43 anchored only Mythos 5 / Opus 4.8 closed-source, **not anchored DeepSeek V3.2 open-source 1M long-context** = open-weights long-context blind spot; (3) Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 are 2026-06 LiveBench / LMSys Arena / Vellum leaderboard 4 China open-weights SOTA, covering long-horizon agent / thinking / coding / context 4 dimensions, llm-benchmark v0.5.0 type segment current 28 entries (06-16 22:23 complete + `arc_agi_3` + `gdpval` + `terminal_bench_hard` + `hf_open_llm_leaderboard_v2` + `safety_bench_2026_suite`), but **not yet anchored vLLM MRV2 + SGLang TRT-LLM DSA NSA + DeepSeek V3.2 1M + Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 4 open-weights SOTA first-batch** — with 06-14 02:43 `long_context_cluster` (Mythos 1M+) forming "closed-source 1M × open-source 1M × serving acceleration × current 4 models" four blind spots; **7 new benchmarks first-batch anchor** fully cover serving-stack + 4 open-weights SOTA + 1M long-context dimensions: (1) `vllm_mrv2` (serving inference stack new baseline #1, 4 hardware modes gb200/h100/h200/all, Claude Opus 4.6 / Mythos 5 / DeepSeek V3.2 3 top-tier baselines) / (2) `sglang_trtllm_dsa_nsa` (serving inference stack new baseline #2, Blackwell 3-5x speedup, 3 backends trtllm/flashinfer/auto, DeepSeek V3.2 anchor) / (3) `deepseek_v3_2_long_context` (open-weights 1M context SOTA, 3 context lengths 128k/1m/2m, 3 modes pass_retrieval/pass_reasoning/composite) / (4) `qwen3_5_anchor` (China open-weights SOTA #1, Qwen 3.5 series 3 sub_model qwen3_4b_thinking / qwen3_235b_a22b_thinking / qwen3_397b) / (5) `kimi_k2_6_thinking` (China open-weights SOTA #2, 2 sub_model k2_6_thinking / k2_5_thinking, LiveBench 72.17 / 69.07 anchor) / (6) `glm_5_anchor` (China open-weights SOTA #3, 2 sub_model glm_5_1 / glm_5, long-horizon agent) / (7) `minimax_2_5_anchor` (China open-weights SOTA #4, 2 sub_model minimax_2_5 / minimax_m2_5, vLLM official support); together with 06-16 22:23 Kili 6-dim + HF OLL v2 (open-weights main battlefield) + 06-15 22:43 OPeRA (agent behavior sim) + 23:43 Coding Agent Index (model+harness joint) + 06-12 04:03 SWE-bench Pro (Mythos-tier SWE) + 06-15 00:43 healthbench/medqa/rcq_clinical (medical) + 06-16 03:23 AA-AgentPerf (serving-stack) + 06-16 04:23 mythos_5_cyber_glasswing / tcs_anthropic_partnership + 06-14 02:43 long_context_cluster (Mythos 1M+) + 06-16 01:03 coding_agent_index_v1 + metr_v3_task_horizon + 06-16 05:23 LiveCodeBench v6 + Vellum + AA Intelligence Index forms "serving-stack (vLLM MRV2 + SGLang TRT-LLM DSA NSA + vllm_serving_bench) × 1M-long-context (closed Mythos + open DeepSeek V3.2) × open-weights SOTA 5 models (Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 / DeepSeek V3.2) × composite-leaderboard × agent-stack × agent-behavior × agent-reasoning (ARC-AGI-3) × professional-work (GDPval) × terminal-agentic-hard × open-weights (HF OLL v2) × safety-suite × SWE × security × medical × expert-reasoning × Mythos-tier" 15-dim eval paradigm signal mesh; seizing 2026 Q2 serving inference new main battlefield (vLLM MRV2 + SGLang TRT-LLM DSA NSA Blackwell) + current 4 open-weights SOTA + DeepSeek V3.2 1M long-context + China open-source dominant discourse; leveraging 7 new benchmarks zero from-scratch dev, real-enable needs v0.5.0 dispatch PR following 22:23 type stub pattern extending evaluator.ts (estimated 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.{vllm_mrv2,sglang_trtllm_dsa_nsa,deepseek_v3_2_long_context,qwen3_5_anchor,kimi_k2_6_thinking,glm_5_anchor,minimax_2_5_anchor}` fields (5min cron does not call real APIs, placeholder only).

> **2026-06 Kili AI Benchmarks 2026 Top 6-dim + HF Open LLM Leaderboard v2 first-batch anchor** (5 new benchmarks, type 23→28 entries): 2026-06 Kili Technology "AI Benchmarks 2026: Top Evaluations and Their Limits" ultimate guide (https://kili-technology.com/blog/ai-benchmarks-guide-the-top-evaluations-in-2026-and-why-theyre-not-enough) lists 2026 top AI benchmark 6-dim classification: (a) **MMLU/MMLU-Pro/GPQA Diamond** (general knowledge + reasoning, anchored 06-15 23:43 `coding_agent_index_v1`) / (b) **Humanity's Last Exam** (expert-level frontier reasoning, anchored 06-15 22:43 `opera` + `hle`) / (c) **SWE-Bench/SEAL/LiveCodeBench/Terminal-Bench** (coding, SWE-Bench Pro 06-12 04:03 + LiveCodeBench v6 06-16 05:23 anchored, **Terminal-Bench 2.0 still no hard tier anchor**) / (d) **GAIA/τ2-Bench/WebArena/ARC-AGI-3** (AI agent evaluation, **ARC-AGI-3 not anchored**) / (e) **GDPval** (real-world professional work, **GDPval not anchored**) / (f) **Agent-SafetyBench/OS-HARM/CUAHarm** (safety, **OS-HARM/CUAHarm not anchored, Agent-SafetyBench not anchored, cyberseceval3 06-14 22:23 is single point not 2026 top safety suite**); same window 2026-06-10 Hacker News "How I topped HuggingFace Open LLM Leaderboard on two gaming GPUs" (https://news.ycombinator.com/item?id=47322887, 126 comments) reflects Open LLM Leaderboard v2 is open-weights model eval main battlefield, **HF Open LLM Leaderboard v2 not anchored** (`lm_eval_harness_v4_config` 06-13 is backend not leaderboard surface); **5 new benchmarks first-batch anchor** fully cover 6-dim blind spots: (1) `arc_agi_3` (Kili agent eval dim, 2 modes abstract/agentic, Claude Fable 5 / GPT-5.4 / Claude Mythos 5 3 top-tier baselines) / (2) `gdpval` (Kili professional work dim, 5 task categories consulting/law/sales/engineering/all, Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro 3 top-tier baselines) / (3) `terminal_bench_hard` (Kili coding dim hard tier, 3 score modes pass_rate/duration_score/composite, Claude Opus 4.6 / GPT-5.4-high 2 top-tier baselines) / (4) `hf_open_llm_leaderboard_v2` (open-weights main battlefield, 9 bundled benchmarks mmlu_pro/bbh/musr/ifeval/math/gpqa/math_hard, Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout 3 top-tier baselines) / (5) `safety_bench_2026_suite` (Kili safety dim three-piece set, 3 sub-suites agent_safety/os_harm/cua_harm/all, Claude Mythos 5 / GPT-5.4 / Gemini 3.1 Pro 3 top-tier baselines); together with 06-15 22:43 OPeRA (agent behavior sim) + 06-15 23:43 Coding Agent Index (model+harness joint) + 06-12 04:03 SWE-bench Pro (Mythos-tier SWE) + 06-15 00:43 healthbench/medqa/rcq_clinical (medical) + 06-16 03:23 AA-AgentPerf (serving-stack) + 06-16 04:23 mythos_5_cyber_glasswing_v1 / tcs_anthropic_partnership_v1 (Mythos cybersecurity + enterprise adoption) forms "composite-leaderboard × agent-stack × agent-behavior × agent-reasoning (ARC-AGI-3) × professional-work (GDPval) × terminal-agentic-hard × open-weights (HF OLL v2) × safety-suite × SWE × long-context × security × medical × expert-reasoning × Mythos-tier" 14-dim eval paradigm signal mesh; seizing 2026 Q2 Kili 6-dim top AI benchmark system (2026-06 ultimate guide) + HF OLL v2 (open-weights mainstream) dual discourse; leveraging 5 new benchmarks zero from-scratch dev, real-enable needs v0.5.0 dispatch PR following 22:23 type stub pattern extending evaluator.ts (estimated 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.{arc_agi_3,gdpval,terminal_bench_hard,hf_open_llm_leaderboard_v2,safety_bench_2026_suite}` fields (5min cron does not call real APIs, placeholder only).



> **2026-06-14 Artificial Analysis AA-AgentPerf serving-stack anchor** (`aa_agentperf_v1`, model+harness+serving-stack third leg, type segment 22→23): 2026-06-14 (Sun) Artificial Analysis released brand-new benchmark **AA-AgentPerf** (https://wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/), key signals: (a) **first benchmark specifically evaluating agentic AI infrastructure** — measures "how many active agents can one inference deployment simultaneously support under real workloads" (active agents per deployment, including concurrent agent coding / tool-use / session switching / GPU utilization); (b) **NVIDIA Blackwell GB300 tops first round, GB300 NVL72 vs HGX H200 across 20× / MegaWatt performance lead** + "maintains GPU full-load across multiple concurrent agent sessions" as key capability; (c) time window 06-09~06-14 sync: vLLM 06-15 tops Artificial Analysis (06-15 already anchored `vllm_serving_bench`) + D-Matrix Corsair (Microsoft-backed, 10× GPU inference / 1/5 energy, CNBC 06-09) + AMD MI450 (Meta 6GW deal) + Nvidia strategic CPU expansion for agentic workload — **2026 Q2 three-trend convergence**: eval shifts from "single model score" → "model + harness + **serving stack**" three-piece set, plus vLLM / D-Matrix / AMD MI450 three serving routes diverge; **3 eval dimensions**: `active_agents` (simultaneous active agent count, default) | `throughput_per_mw` (throughput per megawatt) | `gpu_utilization_concurrent` (GPU utilization during concurrent agents) + **concurrent_sessions default 64** (anchored to GB300 NVL72 full-load); pairs with 06-15 23:43 `coding_agent_index_v1` (model+harness joint scoring) + `metr_v3_task_horizon` (agentic duration span) forming "model + harness + serving stack" three-piece complete agent-stack eval signal mesh; grabs 2026 H2 serving-stack eval discourse power; leveraging Artificial Analysis AA-AgentPerf public data zero from-scratch dev, real enablement needs v0.5.0 dispatch PR following 22:23 type stub pattern extending evaluator.ts real connection AA-AgentPerf API (estimated 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.aa_agentperf_v1` field (5min cron does not call real AA-AgentPerf API, placeholder only).

> **2026-06 Nature Medicine medical leaderboard three-piece set first-batch anchor** (`healthbench` 500 items / `medqa` 500 questions / `rcq_clinical` 100 de-identified queries, type segment 15→18): 2026-06-12 Nature sub-journal Nature Medicine published "General-purpose large language models outperform specialized clinical AI tools on medical benchmarks" (https://www.nature.com/articles/s41591-026-04431-5), key finding: general-purpose LLMs (OpenAI **GPT-5.2** + Google **Gemini 3.1 Pro Preview** + Anthropic **Claude Opus 4.6**) **outperformed** specialized AI tools (OpenEvidence + UpToDate Expert AI) across 3 medical eval dimensions — **(a) 500 HealthBench items clinician alignment** + **(b) 500 MedQA questions medical knowledge** + **(c) RCQ (Real Clinical Queries) 100 de-identified queries tested in live clinical environment**; concurrently 2026-06-09 Anthropic released **Claude Fable 5** (Mythos-class first public release, "combines state-of-the-art vision with knowledge reasoning") + 2026-06 Ramp AI Index (50,000+ US company invoice+card data) Anthropic **34.4%** enterprise adoption first surpassing OpenAI **32.3%** — **three signals**: 2026 Q2 medical/clinical leaderboard becomes new main battlefield (general-purpose LLM > specialized AI is Nature-grade evidence) + Fable5 vision+knowledge strong + enterprise adoption Anthropic first surpassing OpenAI; forms "security × medical" dual main battlefield pairing with `cyberseceval3` (Mythos 5 security main battlefield), with `swe_bench_pro` (Mythos-tier SWE 80.3%) + `long_context_cluster` (62 tasks 1M+ context) forming "SWE × long-context × security × medical" four-dimensional Mythos-tier signal mesh; leveraging Nature Medicine public data zero from-scratch dev, real enablement needs v0.5.0 dispatch PR following 22:23 type stub pattern extending evaluator.ts real connection HealthBench/MedQA/RCQ API (estimated 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.{healthbench,medqa,rcq_clinical}` fields (5min cron does not call real Nature Medicine benchmark API, placeholder only).

> **2026-06 new emerging 3 leaderboards first-batch anchor** (`enterpriserag_bench` 500K+ docs / 9 enterprise sources / MIT + `final_bench_metacog` 42 LLM × 31 dimension Metacog self-awareness + `sonar_llm_leaderboard` "correctness ≠ code quality" code quality + security eval methodology first-day signal, type 37→40): 2026-06 multi-source emerging leaderboard summary: (a) **Onyx EnterpriseRAG-Bench** (https://github.com/onyx-dot-app/EnterpriseRAG-Bench, 2026-06, 500K+ docs / 9 enterprise sources / MIT public) — **first open-source enterprise RAG eval benchmark**, 9 categories of enterprise data sources (Slack / Notion / Google Drive / Confluence / Jira / GitHub / Linear / Salesforce / HubSpot) real enterprise data, MIT license, "how your RAG solution stacks up on real company data", shifting RAG eval from synthetic to real enterprise data, with 06-14 22:23 `cyberseceval3` (Mythos 5 security) + 06-15 00:43 `healthbench` (Nature Medicine general LLM > specialized AI) forming "RAG real scenario" new blind spot; (b) **FINAL Bench ALL-Leaderboard** (https://github.com/final-bench/ALL-Bench-Leaderboard, 2026-06) — spanning **42 LLM × 31 eval domains** (including MMLU-Pro / GPQA / AIME / HLE / ARC-AGI-2 / Metacog / SWE-Pro / IFEval / LCB) composite leaderboard, **metacog score is core new dimension** — "metacog (metacognition) evaluates LLM's ability to 'know what you don't know'", is 2026 Q2 eval paradigm shift from "knowledge" to "self-awareness" first-day signal; (c) **Sonar LLM Leaderboard** (Sonar Summit 2026-03-04, https://www.youtube.com/watch?v=aId-UDaJSXg) — independent eval of LLM-generated code's **maintainability / technical debt / security vulnerabilities three deep quality dimensions**, "why traditional functional benchmarks not enough", "correctness ≠ code quality" is 2026 eval methodology first-day signal; same period ARC-AGI-2 2026 frontier top LLMs first time cross 50% threshold, "real reasoning" eval has become leaderboard main battlefield, with 06-16 22:23 established `arc_agi_3` (agentic abstract reasoning) forming "ARC-AGI-2 (real reasoning) + ARC-AGI-3 (agentic reasoning)" tiered pairing — **three new benchmarks first-batch anchor** filling "**RAG real data × self-awareness (metacog) × code quality + security**" three blind spots: (1) `enterpriserag_bench` (4 modes retrieval_accuracy/end_to_end_qa/citation_quality/all, 10 data_source categories Slack/Notion/GDrive/Confluence/Jira/GitHub/Linear/Salesforce/HubSpot/all, 3 anchors Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview); (2) `final_bench_metacog` (8 sub-benchmarks MMLU-Pro/GPQA/AIME/HLE/ARC-AGI-2/SWE-Pro/IFEval/LCB bundled, 3 dimension metacog (self-awareness) / accuracy / composite, 3 anchors Claude Mythos 5 / Fable 5 / Opus 4.6); (3) `sonar_llm_leaderboard` (4 dimension maintainability/security/technical_debt/all, 7 language python/javascript/typescript/java/go/rust/all, 3 anchors Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro); together with 06-17 04:43 `mrcr_v2_8needle` + `locomo_longmemeval_beam` (1M retrieval × cross-session memory) + 06-17 03:03 7 entries serving-stack / open-weights SOTA + 06-16 22:23 Kili 6-dim + HF OLL v2 + 06-16 05:23 AA Intelligence Index + LiveCodeBench v6 + Vellum + 06-15 22:43 OPeRA + HLE + 06-15 23:43 Coding Agent Index + METR v3 + 06-15 00:43 healthbench/medqa/rcq_clinical + 06-14 22:23 cyberseceval3 + 06-12 04:03 SWE-bench Pro + 06-14 02:43 long_context_cluster forming "RAG real data × metacog self-awareness × code quality + security × 1M retrieval × cross-session memory × serving acceleration × open-weights SOTA × composite-leaderboard × agent-stack × agent-behavior × agent-reasoning × professional-work × terminal-agentic × open-weights (HF OLL v2) × safety-suite × SWE × security × medical × expert-reasoning × Mythos-tier" twenty-dimension eval paradigm signal network; seizing 2026 Q2 eval paradigm four-turn discourse power (RAG real scenario / self-awareness / code quality / composite matrix), with 06-16 22:23 Kili 6-dim top AI eval system first-day; leveraging Onyx EnterpriseRAG-Bench (MIT license) + FINAL Bench (open-source) + Sonar (independent eval) public data zero from-scratch development, real enablement requires v0.5.0 dispatch PR along 22:23 type stub mode extending evaluator.ts (est 30-45min across 6-9 cron rounds); currently only effective under `_external_benchmarks_roadmap.{enterpriserag_bench,final_bench_metacog,sonar_llm_leaderboard}` fields (5min cron does not call real API, only placeholder).

## 🛠️ Companion tooling (inference-service SLO evaluation, complementary to llm-benchmark)

llm-benchmark focuses on **model quality evaluation** (dialogue / coding / function_calling / long_context / multi_turn 5 dimensions + v0.5.0 15 candidate benchmarks), and does **not** cover **inference-service SLO evaluation**. Users who want to production-deploy a model need to know "does this model meet SLO on vLLM serving?" — and that is exactly what the complementary tool below provides:

### GuideLLM — SLO-aware Benchmarking for Real-World LLM Inference

- **GitHub**: [vllm-project/guidellm](https://github.com/neuralmagic/guidellm) (2026-06-06 README update)
- **Positioning**: **SLO-aware Benchmarking and Evaluation Platform for Optimizing Real-World LLM Inference**

**5 key capabilities**:
- (a) **End-to-end simulation** of OpenAI-compatible + vLLM-native servers, with real workloads and configs
- (b) **Generated workload patterns** reflecting production usage, with **reproducibility sweep** to find safe operating ranges
- (c) **3 load modes**: `rate-based` / `concurrency` / `latency-targeted`
- (d) **Dual dataset support**: real + synthetic multimodal datasets (controlled experiments + production-style eval)
- (e) **Standardized exportable reports** for dashboards

**Dual-toolchain workflow** (before production deploy):
1. Use **llm-benchmark** to get **model quality scores** (dialogue / coding / function_calling / long_context / multi_turn 5 dimensions)
2. Use **GuideLLM** to get **inference-service SLO sweep** (TTFT + throughput + concurrency-safe range)
3. Cross-reference both scores to make the production deploy decision

**Evaluation-dimension mapping table** (complementary, not overlapping):

| Evaluation dimension | llm-benchmark | GuideLLM |
|---------|---------------|----------|
| Model quality (dialogue / coding / function_calling / multi_turn) | ✅ Primary | ❌ |
| Long-context (32k+ / 1M context) | ✅ `long_context` dimension + `long_context_cluster` 62 tasks | ❌ |
| Inference latency (TTFT) | ❌ | ✅ Primary |
| Inference throughput (token/s) | ❌ | ✅ Primary |
| SLO safe operating range | ❌ | ✅ Primary (reproducibility sweep) |
| Multimodal datasets | ❌ | ✅ (real + synthetic) |
| Cross-harness triangulation (LiveBench / Vals / BenchLM) | ✅ `src/core/evaluator.ts` JSDoc | ❌ |

**Companion config**: `BenchmarkConfig.companion_tools.guidellm?: { installed?: boolean; sweep_config?: string }` (roadmap-only, defaults to `undefined`, 5min cron does NOT call real GuideLLM endpoint)

**Ecosystem relationship**: llm-benchmark and GuideLLM are **complementary**, not competitive — llm-benchmark evaluates the **model itself**, GuideLLM evaluates the **inference service**. Combined with [vLLM serving bench (`vllm_serving_bench`)](https://vllm.ai/blog/2026-05-11-vllm-tops-artificial-analysis) + [vLLM 06-04 Nemotron 3 Ultra day-0 blog](https://vllm.ai/blog/2026-06-04-nemotron-3-ultra-vllm), this forms a **model-quality × inference-service SLO** dual-toolchain entry point, securing first-day voice in the 2026 reproducible inference-service sweep paradigm.
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
