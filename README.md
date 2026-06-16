# LLM Benchmark - 本地快速LLM评测工具

🎯 本地快速LLM大模型智力评测，支持多平台、多模型统一比较。

> 📖 **Other languages:** [English](./README.en.md) | 中文（本文件）

[![npm version](https://img.shields.io/npm/v/@xingp14/llm-benchmark.svg)](https://www.npmjs.com/package/@xingp14/llm-benchmark)
[![CI](https://github.com/XingP14/llm-benchmark/actions/workflows/ci.yml/badge.svg)](https://github.com/XingP14/llm-benchmark/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/v/xingp14/llm-benchmark?label=docker&sort=semver)](https://hub.docker.com/r/xingp14/llm-benchmark)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## 特性

- 🌐 **多平台支持**: OpenAI / Anthropic Claude / 智谱 GLM / DeepSeek / 通义千问 Qwen (DashScope) / Ollama 本地模型
- 📊 **统一评测**: 通用对话 + 代码能力 + 工具调用 + 长上下文理解 + 多轮对话一致性 五维度（v0.4.0 起）
- ⚡ **快速执行**: 本地批量评测，无需云服务
- 📈 **可视化报告**: 表格 + 5 维度彩色 score-bar 渐变进度条（JSON / Markdown / HTML 三种格式，未启用维度填 `-`）
- 🔄 **多模型对比**: 同时评测多个模型并生成对比报告
- 🐍 **沙盒执行**: 代码评测自动执行测试用例

## 安装

### 方式 1: npx 一键运行（推荐，无需安装）

```bash
# 初始化配置文件（会下载到当前目录）
npx @xingp14/llm-benchmark init

# 编辑 config.json 添加你的 API Key

# 运行评测
npx @xingp14/llm-benchmark run --config config.json
```

### 方式 2: 全局安装

```bash
npm install -g @xingp14/llm-benchmark
llm-bench --version
llm-bench init
```

### 方式 3: 从源码安装

```bash
git clone https://github.com/XingP14/llm-benchmark.git
cd llm-benchmark
npm install
npm run build
```

## 快速开始

```bash
# 1. 初始化配置
llm-bench init

# 2. 编辑 config.json 添加你的 API Key

# 3. 运行评测
llm-bench run --config config.json
```

## CLI 用法

```bash
# 初始化配置文件
llm-bench init

# 运行评测
llm-bench run --config config.json

# 对比多个模型
llm-bench compare model-a.json model-b.json

# 列出可用评测题
llm-bench list

# 查看版本号
llm-bench --version

# 显示帮助
llm-bench help
```

## Web UI / Docker 部署

除了 CLI 之外，v0.3.0 起提供 Web UI（Express + WebSocket 实时进度）和 SQLite 持久化。可本地启动，也可 Docker 一键部署。

### 本地启动 Web UI

```bash
# 构建
npm run build

# 启动 Web 服务器（默认 3033 端口）
npm run start:web
# 或开发模式
npm run dev:web
```

打开浏览器访问 <http://localhost:3033>，默认管理员账户：

- 用户名：`admin`
- 密码：取自 `ADMIN_PASSWORD` 环境变量，默认 `admin123`（**生产环境务必修改**）

### Docker 一键部署

```bash
# 设置环境变量（可选）
export JWT_SECRET="your-strong-jwt-secret"
export ADMIN_PASSWORD="your-strong-password"

# 启动
docker compose up -d

# 查看日志
docker compose logs -f
```

`docker-compose.yml` 默认将主机 `192.168.160.14:3033` 映射到容器 `3033`，数据持久化到 `./data/llm-bench.db`。如需修改监听地址，编辑 `docker-compose.yml` 的 `ports` 配置。

### 拉取预构建 Docker 镜像

无需本地构建，可直接从 [Docker Hub](https://hub.docker.com/r/xingp14/llm-benchmark) 拉取 CI 自动构建的官方镜像：

```bash
# 拉取最新镜像
docker pull xingp14/llm-benchmark:latest

# 启动容器（数据持久化到 named volume `llm-bench-data`）
docker run -d \
  --name llm-bench \
  -p 3033:3033 \
  -e JWT_SECRET="your-strong-jwt-secret" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -v llm-bench-data:/app/data \
  --restart unless-stopped \
  xingp14/llm-benchmark:latest
```

镜像由 `.github/workflows/docker.yml` 在打 `v*` tag 时自动构建并推送，可指定具体版本：

```bash
docker pull xingp14/llm-benchmark:0.4.0
```

### 健康检查

```bash
curl http://localhost:3033/api/health
# {"status":"ok","timestamp":"2026-06-01T..."}
```

### Web UI 提供的能力

- 🧩 浏览器内创建 / 编辑 / 删除评测配置
- ▶️ 一键启动评测，WebSocket 实时推送进度
- 📜 历史评测列表 + 详细结果（按配置/模型筛选）
- 🗃️ SQLite 持久化所有配置和结果，容器重启不丢失
- 🔐 JWT 鉴权，所有 `/api/*` 受保护

CLI 与 Web UI 共享同一份 SQLite 数据库，可混用。

### 暗黑模式

Web UI 自动跟随操作系统的暗黑模式设置（macOS / Windows / Linux 均支持 `prefers-color-scheme: dark`），无需手动切换；输入框、卡片、表格、滚动条都已适配。

## 支持的模型

| 平台 | 类型 | 示例模型 |
|------|------|----------|
| OpenAI | `openai` | GPT-4, GPT-3.5-turbo |
| Anthropic | `anthropic` | Claude 3 Haiku, Claude 3 Opus |
| 智谱 | `glm` | GLM-4, GLM-3-Turbo |
| DeepSeek | `deepseek` | deepseek-chat, deepseek-reasoner |
| 通义千问 | `qwen` / `tongyi` / `dashscope` | qwen-turbo, qwen-plus, qwen-max, qwen3-max |
| Ollama (本地) | `ollama` / `local` | llama3.2, qwen2.5, mistral, codellama, deepseek-r1 |
| 其他 | `openai` | 任何 OpenAI 兼容接口 |

## 配置文件

最小可用配置（OpenAI / Anthropic / 智谱 GLM）：

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

### DeepSeek（OpenAI 兼容，含推理模型回退）

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

> `deepseek-reasoner` 推理模型会返回 `reasoning_content` 字段，适配器会自动回退到该字段；其余 OpenAI 兼容字段正常解析。

### 通义千问 Qwen（DashScope 兼容模式）

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

> `type` 接受 `qwen` / `tongyi` / `dashscope` 三种写法（同一适配器）。其他可用模型：`qwen-plus`、`qwen-max`、`qwen3-max`。

### Ollama 本地模型（无需 API Key）

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

> 前提：本机已启动 Ollama 服务（`ollama serve`），并 `ollama pull llama3.2` 拉取模型。`type` 接受 `ollama` / `local` 两种写法。`apiKey` 字段必填但可填任意非空字符串（Ollama 默认无鉴权）。

## 评测维度

### 通用对话能力 (13题)
| 维度 | 描述 | 权重 |
|------|------|------|
| factual_accuracy | 事实准确性 | 1.0 |
| instruction_following | 指令遵循 | 1.5 |
| reasoning | 推理能力 | 2.0 |
| context_awareness | 上下文一致性 | 1.5 |
| safety | 安全性 | 2.0 |

### 代码能力 (11题)
| 维度 | 描述 | 权重 |
|------|------|------|
| syntax | 语法正确性 | 1.0 |
| string_processing | 字符串处理 | 1.5 |
| array_operations | 数组操作 | 1.5 |
| algorithms | 算法 | 2.0 |
| data_structures | 数据结构 | 1.5 |

### 工具调用 / Function Calling (5题) — v0.4.0 新增
| 维度 | 描述 | 权重 |
|------|------|------|
| 简单参数 | 单工具单参数调用 | 1.0 |
| 多工具选择 | 多个候选工具中正确选择 | 1.5 |
| 必填参数 | 必填字段全部到位 | 1.5 |
| 嵌套对象 | 嵌套 JSON 结构正确生成 | 2.0 |
| 数组参数 | 数组类型参数传递 | 1.5 |

> 评分规则：name + args 完全匹配 = 100；name 匹配 args 部分 = 70；name 匹配 args 错 = 40；name 不匹配 = 0。需要在 config.json 的 `benchmarks` 段显式开启 `"function_calling": true`（默认 `false`）。CLI 与 Web API 共用同一字段名。

### 长上下文理解 / Long Context (3题) — v0.4.0 新增
| 维度 | 描述 | 权重 |
|------|------|------|
| Needle in haystack | 32k+ 上下文中定位关键事实 | 1.5 |
| 长文档关键信息提取 | 单文档多段落要点抽取 | 1.5 |
| 多文档交叉对比 | 跨段引用与一致性核对 | 2.0 |

> 评分规则：基于 `keyFacts` 命中比例（100 / 命中比例×100 / 0）。需要模型 context window ≥ 32k，并在 config.json 的 `benchmarks` 段开启 `"long_context": true`（默认 `false`）。

### 多轮对话一致性 / Multi-Turn (3题) — v0.4.0 新增
| 维度 | 描述 | 权重 |
|------|------|------|
| 上下文保留 | 多轮后记住关键事实（豆豆/3 岁/逗猫棒/挑食） | 2.0 |
| 角色一致性 | persona 不跑题（中餐厨师不答西餐） | 1.5 |
| 逻辑一致性 | 多轮后不自相矛盾（钱包数学、跨段引用） | 2.0 |

> 评分规则：基础分 = `required` 命中比例 × 100，每个 `forbidden` 命中扣 20 分，钳制在 [0, 100]。考察模型在多轮上下文中保持事实/角色/逻辑一致性的能力，需要在 config.json 的 `benchmarks` 段开启 `"multi_turn": true`（默认 `false`）。

### 路线图 / Roadmap（v0.5.0 候选）

| 基准 | 类型 | 状态 | 来源 |
|------|------|------|------|
| `webdev_arena` | 全栈代码生成 / ELO 对抗评分 | 候选（v0.5.0） | [webdevarena.com](https://webdevarena.com) |
| `terminal_bench` | Agentic coding / 终端任务 | 候选（v0.5.0） | Terminal Bench 2.0 |
| `aa_omniscience` | 幻觉 + 知识覆盖 | 候选（v0.5.0） | Artificial Analysis |
| `metr_time_horizons` | Agentic task duration (GPT-5.2 352.2min 锚定) | 候选（v0.5.0） | [METR](https://metr.org/) (2026-H1 agentic duration leaderboard 主战场) |
| `benchlm_agentic` | Agentic eval 24 项 (Design2Code / Vision2Web / Native Evals) | 候选（v0.5.0） | [BenchLM.ai](https://benchlm.ai/) (2026-06-07 发布, 248 模型 × 225 基准) |
| `cyberseceval3` | LLM 安全 / 8 项风险 (offensive security) | 候选（v0.5.0） | Meta CyberSecEval 3 (2025-12 发布) |
| `swe_bench_pro` | Agentic SWE (多文件 / 长上下文 / 复杂工程) | 候选（v0.5.0） | [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02, Mythos-tier 主标杆) |
| `deepswe` | Agentic SWE (113 任务 / 91 开源 repo / 5 语言 Python+JS+Go+Java+Rust) | 候选（v0.5.0） | DeepSWE (2026-05-26 发布, GPT-5.5 70% 领先 +16 分) |
| `long_context_cluster` | 长上下文评测 cluster (62 tasks: LongBench v2 21 + Babilong 13 + InfiniteBench 18 + Phonebook 10) | 候选（v0.5.0） | EleutherAI/lm-evaluation-harness PR #3256 (2026-Q2, 4 基准 62 tasks 全实现, 0 从零开发) |
| `gpt_5_5_thinking_xhigh` | 顶级 Thinking xHigh Effort (LiveBench 综合 80.71) | 候选（v0.5.0） | [LiveBench 6 月 leaderboard](https://livebench.ai) (OpenAI 顶级 Thinking, 2026-06) |
| `gpt_5_4_thinking_xhigh` | 顶级 Thinking xHigh Effort (LiveBench 综合 80.28, 1.05M context) | 候选（v0.5.0） | [LiveBench 6 月 leaderboard](https://livebench.ai) (OpenAI 双 xHigh, 2026-06) |
| `claude_opus_4_6_thinking` | 顶级 Thinking High Effort (LiveBench 综合 76.33, 2026-05-29 新) | 候选（v0.5.0） | [LiveBench 6 月 leaderboard](https://livebench.ai) (Anthropic 双 Thinking, 2026-06) |
| `claude_mythos_5_1m` | Mythos 顶配 1M context (99% 召回, $10/$50) | 候选（v0.5.0） | [Vellum LLM Leaderboard](https://www.vellum.ai/llm-leaderboard) (2026-06, BenchLM.ai 1M 上下文档位) |
| `claude_opus_4_8_1m` | Opus 4.8 1M context ($5/$25) | 候选（v0.5.0） | [Vellum LLM Leaderboard](https://www.vellum.ai/llm-leaderboard) (2026-06, 1M 三档之一) |
| `vllm_serving_bench` | 推理服务吞吐量 + TTFT + GPU 利用率 (4 评测模式, ShareGPT/Sonnet/custom 数据集) | 候选（v0.5.0） | [vLLM 2026-05-11 Tops AA blog](https://vllm.ai/blog/2026-05-11-vllm-tops-artificial-analysis) + [vLLM 06-04 Nemotron 3 Ultra day-0 blog](https://vllm.ai/blog/2026-06-04-nemotron-3-ultra-vllm) (benchmark_serving.py 4 维度, 2026-06 推理服务 leaderboard 事实标准) |
| `process_aware_scoring` | Agentic trajectory-level 过程感知 scoring (5 模式: commit/test/retry/coverage/trajectory + pass/fail 双权重) | 候选（v0.5.0） | Princeton SWE-Bench Pro 2026-03-04 (agentic coding 走向复杂 feature 交付) + Anthropic 2026「2026 Agent 元年」18 页报告 (评测需捕获自主 agent 全过程行为) |
| `lm_eval_harness_v4_config` | lm-eval-harness v0.4.0 YAML config + Jinja2 prompt + HF/vLLM/MPS/GPT-NeoX 4 backend (config-driven 范式) | 候选（v0.5.0） | [EleutherAI lm-evaluation-harness v0.4.0](https://github.com/EleutherAI/lm-evaluation-harness) (2026-04-23 release, config-based task creation + Jinja2 + 4 backend + CoT BBH + Belebele + Lighter install 6 信号, HuggingFace OLM 6 基准 + CoT BBH + Belebele 多语言首批锚定) |
| `healthbench` | 临床医生对齐评测 (500 items, 临床医生写 rubric) | 候选（v0.5.0） | [Nature Medicine 2026-06-12 s41591-026-04431-5](https://www.nature.com/articles/s41591-026-04431-5) (通用 LLM > 专科 AI, 2026 Q2 medical/clinical leaderboard 主战场) |
| `medqa` | 医学知识评测 (500 USMLE-style questions, 多语言) | 候选（v0.5.0） | Nature Medicine 2026-06-12 (通用 LLM Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro 三顶级基线锚定) |
| `rcq_clinical` | 真实临床查询评测 (100 de-identified queries, 医生实测) | 候选（v0.5.0） | Nature Medicine 2026-06-12 s41591-026-04431-5 (全新发布, 通用 LLM > OpenEvidence + UpToDate Expert AI 专科工具, 4 评测模式 accuracy/safety/completeness/all) |
| `aa_agentperf_v1` | Agentic serving stack 评测 (active agents per deployment, 3 维度 active_agents / throughput_per_mw / gpu_utilization_concurrent, 并发 session 数 64) | 候选（v0.5.0） | [Artificial Analysis AA-AgentPerf 2026-06-14](https://wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/) (首个 agentic serving-stack 评测, NVIDIA GB300 NVL72 vs HGX H200 20×/MW 性能领先, model+harness+serving-stack 三件套第三腿) |
| `arc_agi_3` | 抽象推理 + agentic tasks (Kili 2026 Top 6 维 agent eval 类, 与 GAIA/τ2-Bench/WebArena 同列) | 候选（v0.5.0） | [ARC-AGI-3 2026](https://arcprize.org/blog/arc-agi-3-launch) (abstract reasoning + agentic tasks 首批锚定, Claude Fable 5 / GPT-5.4 / Claude Mythos 5 3 顶级基线, 2 模式 abstract/agentic) |
| `gdpval` | 真实专业工作评测 (OpenAI + 商业 tasks 联合发布, Kili 6 维 professional work 维, vs 学术 benchmark 范式转移) | 候选（v0.5.0） | [GDPval 2026](https://kili-technology.com/blog/ai-benchmarks-guide-the-top-evaluations-in-2026-and-why-theyre-not-enough) (real-world professional work, Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro 3 顶级基线, 5 任务类别 consulting/law/sales/engineering/all) |
| `terminal_bench_hard` | Terminal-Bench 2.0 hard tier 高难度 (Frontier coding + 长程 shell agent 主战场) | 候选（v0.5.0） | [Terminal-Bench 2026 hard](https://github.com/Terminal-Bench/) (Kili 6 维 coding 维 hard tier, Claude Opus 4.6 / GPT-5.4-high 2 顶级基线, 3 评分模式 pass_rate/duration_score/composite) |
| `hf_open_llm_leaderboard_v2` | Open-weights 评测主战场 (MMLU-Pro + BBH + 7 hard 基准 bundled, lm-eval-harness v0.4.0 同源) | 候选（v0.5.0） | [HuggingFace Open LLM Leaderboard v2](https://huggingface.co/open-llm-leaderboard) (open-weights 主战场, Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout 3 顶级基线, 9 bundled 基准 mmlu_pro/bbh/musr/ifeval/math/gpqa/math_hard) |
| `safety_bench_2026_suite` | 2026 顶级 safety 三件套 (Agent-SafetyBench + OS-HARM + CUAHarm, Kili 6 维 safety 维, 配合 cyberseceval3 形成完整 2026 safety 锚) | 候选（v0.5.0） | Kili AI Benchmarks 2026 Top 6 维 safety 类 (Claude Mythos 5 / GPT-5.4 / Gemini 3.1 Pro 3 顶级基线, 3 子套 agent_safety/os_harm/cua_harm/all) |
| `vllm_mrv2` | vLLM 0.8.0+ Model Runner V2 (默认 runner, GB200 56% throughput gain, serving 推理栈新基线) | 候选（v0.5.0） | [vLLM MRV2 Deployment Guide 2026](https://www.spheron.network/blog/vllm-model-runner-v2-mrv2-deployment-guide/) (GB200 56% throughput gain, 解耦 model forward + CUDA graph capture + 异步调度, Claude Opus 4.6 / Mythos 5 / DeepSeek V3.2 3 锚定, 4 hardware 模式 gb200/h100/h200/all) |
| `sglang_trtllm_dsa_nsa` | SGLang × TRT-LLM DSA NSA backend (Blackwell 3-5x speedup on DeepSeek V3.2, 2026 H1 最具突破性 serving 加速信号) | 候选（v0.5.0） | [SGLang vs vLLM vs TRT-LLM Benchmarks](https://www.spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks) (`--nsa-prefill-backend trtllm` + `--nsa-decode-backend trtllm` 启用, DeepSeek V3.2 1.6T MoE 1M 锚定, 3 backend trtllm/flashinfer/auto, 2 phase prefill/decode) |
| `deepseek_v3_2_long_context` | DeepSeek V3.2 1.6T MoE 1M long-context 开源 SOTA (49B activated, NSA backend 加速, 与 Mythos 5 / Opus 4.8 1M 闭源对位) | 候选（v0.5.0） | [DeepSeek V3.2 Release 2026-06](https://api-docs.deepseek.com/news/deepseek-v3-2-release) (open-weights 1M SOTA, 3 context 长度 128k/1m/2m, 3 模式 pass_retrieval/pass_reasoning/composite) |
| `qwen3_5_anchor` | Qwen 3.5 系列 Alibaba 通义开源 SOTA (Qwen3-4B Thinking LiveBench 64.1 / 235B A22B Thinking 62.2 / 397B 全栈上榜) | 候选（v0.5.0） | [Qwen 3.5 Alibaba 2026](https://qwen.alibaba.com/) (中国系开源 SOTA #1, 4 sub_model qwen3_4b_thinking/qwen3_235b_a22b_thinking/qwen3_397b/all) |
| `kimi_k2_6_thinking` | Kimi K2.6 / K2.5 Thinking Moonshot AI 长推理开源 (K2.6 Thinking LiveBench 72.17, K2.5 Thinking 69.07) | 候选（v0.5.0） | [Kimi K2.6 Moonshot AI 2026](https://www.kimi.com/blog/kimi-k2-6) (中国系开源 SOTA #2, 3 sub_model k2_6_thinking/k2_5_thinking/all) |
| `glm_5_anchor` | GLM-5 / GLM-5.1 Z.ai 智谱长 horizon agent workflows 开源 (GLM-5.1 Coding index 46.5) | 候选（v0.5.0） | [GLM-5 Z.ai 2026](https://www.z.ai/) (中国系开源 SOTA #3, 3 sub_model glm_5_1/glm_5/all) |
| `minimax_2_5_anchor` | MiniMax 2.5 / MiniMax-M2.5 MiniMax 公司新一代开源 SOTA (已被 vLLM 官方支持, 现役 LiveBench 上榜) | 候选（v0.5.0） | [MiniMax 2.5 vLLM 2026](https://github.com/vllm-project/vllm) (中国系开源 SOTA #4, 3 sub_model minimax_2_5/minimax_m2_5/all) |

> **2026-04-23 EleutherAI lm-evaluation-harness v0.4.0 config-driven 范式锚定** (lm_eval_harness_v4_config, harness config-compat + 4 backend): 2026-04-23 EleutherAI lm-evaluation-harness v0.4.0 正式发布 (https://github.com/EleutherAI/lm-evaluation-harness), 关键范式重定义 — (a) **「Config-based task creation and configuration」** YAML config 即可定义新 task, 无需写 Python src; (b) **「Easier import and sharing of externally-defined task config YAMLs」** 跨项目复用 config; (c) **「Support for Jinja2 prompt design, easy modification of prompts + prompt imports from Promptsource」** 模板化 prompt + Promptsource 互导; (d) **「More advanced configuration options, including output post-processing, answer extraction, and multiple LM generations per document, configurable fewshot settings」** 后处理 + 答案提取 + 多代 + few-shot 配; (e) **「Speedups and new modeling libraries supported, including: faster data-parallel HF model usage, vLLM support, MPS support with HuggingFace」** HF + vLLM + MPS (Apple Silicon) + GPT-NeoX 4 backend; (f) 2025-12 「Lighter install: Base package no longer includes」 减依赖体积; (g) **New tasks including CoT BIG-Bench-Hard + Belebele + user-defined task groupings** CoT BBH + Belebele 多语言 + 自定义 task 分组三信号; **核心信号**: 2026 H1 评测方法论主战场从「写 src/task.py」转「写 YAML config」, harness 评测门槛降低 10×, 与 llm-benchmark 06-09 23:03 已立的「config.example.json 增加 webdev-arena 基准配置入口」+ 23:23「BenchmarkConfig 真启用 webdev_arena」+ 06-10 22:34「harness drift JSDoc」+ 06-13 23:23「process_aware_scoring 过程感知」+ 04:03「vllm_serving_bench 推理服务」路线**直接对位** — 用户用 lm-eval-harness v0.4.0 YAML config 即可评测 60+ 学术基准 (ARC / HellaSwag / MMLU / TruthfulQA / Winogrande / GSM8k 等), llm-benchmark 用 config-driven 模式扩展 webdev_arena / lm_eval_harness_v4_config 首批锚定; **6 字段** (enabled + config_path + backend 4 选 1 + prompt_engine 3 选 1 + fewshot 默认 5 + post_process 3 选 1 + subset 9 选 1 + anchor_score 注入) — 与 `webdev_arena` (v0.5.0 首批 config-driven 范式) + `long_context_cluster` (62 tasks lm-eval-harness 同源 PR #3256) + `swe_bench_pro` (80.3% Fable-5) 形成「config-driven × 长上下文 × SWE」三维信号网, 抢 2026 H1 harness config-driven 范式话语权; 借力 lm-eval-harness v0.4.0 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 23:23 type stub 模式扩展 evaluator.ts 真 connection lm-eval-harness v0.4.0 YAML config (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.lm_eval_harness_v4_config` 字段下生效 (5min cron 不调真实 harness v0.4.0 endpoint, 仅占位)。

> **2026-06 顶级 Thinking + 1M-context Mythos-tier 首批锚定** (5 个新档位, type 段 7→12): 来源三处 leaderboard — (1) **LiveBench 6 月综合分** (污染-free): **GPT-5.5 Thinking xHigh Effort = 80.71** / **GPT-5.4 Thinking xHigh Effort = 80.28** / **Claude 4.6 Opus Thinking High Effort = 76.33** (2026-05-29 新) / **Claude 4.5 Opus Thinking High Effort = 75.96** / **Kimi K2.6 Thinking = 72.17**; (2) **Vellum LLM Leaderboard 1M-context 档位**: **Claude Mythos 5 1M context** (99% 召回, $10/$50) / **Claude Opus 4.8 1M context** ($5/$25); (3) **BenchLM.ai 2026-06**: **Claude Mythos 5 1M+ (99%)** / **Claude Fable 5 1M+ (96%)** / **GPT-5.4 1.05M**. 三维信号网形成 2026 Q2 顶级 Thinking 5 强 (OpenAI 5.4/5.5 双 xHigh + Anthropic 4.5/4.6 双 Thinking + Moonshot K2.6) + 1M Mythos 档 3 强 (Mythos 5 / Opus 4.8 / Fable 5) 首批锚定; 与 `long_context_cluster` 62 tasks / `swe_bench_pro` 80.3% Mythos-tier SWE 形成「thinking × long-context × SWE」三维信号网; 真启用需 v0.5.0 dispatch PR 沿 23:23 路段模式扩展 (估 30-45min 跨 6-9 轮 cron 累进)。当前仅在 `_external_benchmarks_roadmap.*` 字段下生效 (5min cron 不调真实 LiveBench / Vellum / BenchLM API, 仅占位)。

> ⚠️ **SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)**: Scale AI SWE-Bench Pro 验证器在约 **1/3 试验中给出错误 pass/fail 判定**, 即 `swe_bench_pro` 现行分数普遍存疑 (Claude Opus 曾利用「benchmark loophole」拿分)。决策前请**三角验证**: `swe_bench_pro` (benchlm.ai) ↔ `deepswe` (宽 spread) ↔ `vals.ai` SWE-bench Verified (Opus 4.8 88.60% ±1.42), 不要依赖单一 harness 排名。来源: [VentureBeat 2026-05-26 DeepSWE 报道](https://venturebeat.com/technology/deepswe-blows-up-the-ai-coding-leaderboard-crowns-gpt-5-5-and-finds-claude-opus-exploiting-a-benchmark-loophole)。与本表 SWE-bench 三源 cross-validation 段 + `src/core/evaluator.ts` 22:34 JSDoc harness drift 注释形成「验证器警告 + 多源数据 + harness drift 解释」三位一体。

> **2026-06 过程感知 scoring 范式锚定** (process_aware_scoring, agentic trajectory-level 维度): 2026-03-04 Princeton SWE-Bench Pro 发布明确 agentic coding 评测从「修 bug (pass/fail)」走向「复杂 feature 交付 (过程感知)」, 1 个 agent trajectory 不仅看最终 pass/fail, 还要评估「commit count / test run count / retry count / file coverage」等过程信号; 2026-01-16 业内讨论「Coding Agent 评测终于开始关注过程」 + 华泰证券 2026-02-09 「Agentic Coding 加速迭代」研报; 2026-06 Anthropic 「2026 是 Agent 元年」18 页报告 (https://new.qq.com/rain/a/20260211A02OZR00) 强调 agent 从「辅助」走向「自主」, 评测必须捕获自主 agent 全过程行为 — 评测方法论话语权已从「结果分数」转「过程+结果」双轨; **5 评测模式** (commit_count / test_run_count / retry_count / file_coverage / trajectory_score, default 'all') + **3 agentic 基准关联** (swe_bench_pro / terminal_bench / webdev_arena, default 'swe_bench_pro') + **pass/fail 双权重** (pass_fail_weight default 0.7 + process_weight default 0.3, 合计 1.0) + **anchor_score 注入** 字段; 与 `swe_bench_pro` (80.3% Fable-5) + `vllm_serving_bench` (推理服务 leaderboard) 形成「过程 × 结果 × 推理服务」三维信号网, 抢 2026 H1 agentic coding 评测方法论话语权; 借力 Princeton SWE-Bench Pro trajectory API 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 evaluator.ts 真 connection SWE-Bench Pro trajectory endpoint (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.process_aware_scoring` 字段下生效 (5min cron 不调真实 trajectory API, 仅占位)。

> **2026-06 vLLM serving benchmark 锚定** (vllm_serving_bench, 推理服务 leaderboard 事实标准): 2026-05-11 vLLM 官方博客「vLLM Tops the Artificial Analysis Leaderboard」明示 vLLM serving 在 **DeepSeek V3.2 / MiniMax-M2.5 / Qwen 3.5 397B** 跨 12 provider 排名**第一**, **TTFT < 1s @ 10K-token prompts**; 2026-06-04 vLLM Nemotron 3 Ultra day-0 博客含 `benchmarks/benchmark_serving.py` 仓库根 `/benchmarks/benchmark_serving.py` — 推理吞吐量 + TTFT + token/s + GPU 利用率 **4 维度**; 2026-06-03 Red Hat + DeepLearning.AI 「Fast & Efficient LLM Inference with vLLM」免费课程, 教 GuideLLM 基准 + vLLM Compressor + vLLM 部署全栈; leaderboard 主战场已从「单模型推理分数」转「推理服务吞吐量 + GPU 利用率」, vLLM benchmark_serving.py 是 2026 H1 推理评测事实标准; 与 `claude_mythos_5_1m` / `claude_opus_4_8_1m` / `swe_bench_pro` 形成「推理服务 × 1M context × agentic SWE」三维信号网; 借力 benchmark_serving.py 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 (估 30-45min 跨 6-9 轮 cron 累进)。当前仅在 `_external_benchmarks_roadmap.vllm_serving_bench` 字段下生效 (4 评测模式 + 3 数据集 + 注入 anchor_score, 5min cron 不调真实 vLLM serving endpoint, 仅占位)。

> **2026-06 长上下文评测 cluster 锚定** (long_context_cluster, 62 tasks): 4 基准全为 lm-evaluation-harness 0.4.0 同源实现 — **LongBench v2 (21 tasks)** / **Babilong (13 tasks)** / **InfiniteBench (18 tasks)** / **Phonebook (10 tasks)**, 锚定数据: **GPT-4-128k InfiniteBench KV Retrieval 89.0%** / **Llama-2-7B LongBench v2 2WikiMQA 32.8% F1** / **Llama-2-7B Phonebook Middle 54.2%**; 2026 商用上下文窗口: **Claude Mythos 5 = 1M+ (99%)** / **Claude Fable 5 = 1M+ (96%)** (BenchLM.ai 2026-06) / **GPT-5.4 = 1.05M**, 评测必须跟上; 与 `swe_bench_pro` 形成「代码能力 × 长上下文」双子锚, 借力 EleutherAI 62 tasks 开源实现, 0 从零开发; 真启用需 v0.5.0 dispatch PR 沿 23:23 路段模式扩展 `BenchmarkConfig` + evaluator.ts dispatch 分支 (估 30-45min 跨 6-9 轮 cron 累进)。当前仅在 `_external_benchmarks_roadmap.long_context_cluster` 字段下生效 (string free-form subset, 5min cron 不调真实 harness 0.4.0 PR #3256 API, 仅占位)。

> 这些为外部/对抗式第三方基准，调用方式与内置题库不同（需对应 API endpoint），不在 v0.4.0 `benchmarks: {true/false}` 开关内。`config.example.json` / `config-batch2.json` 已加入 `_external_benchmarks_roadmap` 示例段（含 `webdev_arena` 配置骨架），启用需同步扩展 `src/types/index.ts BenchmarkConfig` 并在 `src/core/evaluator.ts` 增加 dispatch 分支。

> **2026-06 Mythos-tier SWE 评测锚定**: `swe_bench_pro` 首条数据 **claude-fable-5 = 80.3%** (2026-06-09, Stripe 用它在 1 天迁移 5000 万行代码, 传统团队估算 2 个月), 是 Mythos-tier 主标杆。与 03:43 `src/core/evaluator.ts` JSDoc harness drift 注释 + 本表 SWE-bench 三源 cross-validation 段形成「type 段 + JSDoc 解释 + 用户可见活样本」三维信号网。

### Mythos-class 模型接入 (v0.5.0 candidates, 2026-06-11)

| Model ID | 来源 / 发布 | Tier | 路由默认 | 来源 |
|----------|------------|------|---------|------|
| `claude-fable-5` | Anthropic GA 2026-06-09 | Mythos-class (首个公开版) | `cyberseceval3 (suite=both)` + LiveCodeBench/Terminal-Bench | [thehackernews](https://thehackernews.com/2026/06/anthropic-releases-claude-fable-5-its.html) / [macrumors](https://www.macrumors.com/2026/06/09/anthropic-fable-5/) / [forbes](https://www.forbes.com/sites/zacharyfolk/2026/06/09/anthropic-releases-first-public-version-of-claude-mythos-with-major-safeguards/) |
| `claude-mythos-5` | Anthropic 2026-06-09 (更强版, cyberdefenders / US Gov) | Mythos-class | `cyberseceval3 (offensive 优先)` | Forbes 同上 |

> 配合 `Artificial Analysis Coding Index` (LiveCodeBench + SciCode + Terminal-Bench composite) 三角验证, 5min cron 不调真实 Anthropic API (Mythos-tier rate-limit), 真完整 routing PR 估 30-45min 跨 6-9 轮 cron 累进; 当前仅在 `_external_benchmarks_roadmap.*.model_id` 字段下生效 (string free-form, 不改 type). 见 `src/core/evaluator.ts` v0.5.0 model_id routing hint 注释 (2026-06-11)。

> **2026 H1 leaderboard 主战场信号**: BenchLM.ai 主打 agentic eval 24 项 + CyberSecEval3 拓展 offensive security 8 项, 与 METR time horizons (GPT-5.2 agentic task duration 352.2min) / AA Omniscience (幻觉 + 知识) 一起, 反映 leaderboard 已从「模型 × 知识」转「模型 × agentic + 安全」, 真启用需 v0.5.0 dispatch PR.

### SWE-bench 三源 cross-validation (2026-06, harness drift 系数活样本)

> 同一模型跨不同 SWE-bench harness 分数差异巨大, 决策前请三角验证。沿 [DigitalApplied "LLM Benchmark Methodology 2026"](https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide) 「harness-multiplier effect (同一模型同一基准不同 harness 可差 10-20 分) + confidence interval 三角验证」方法论, 配合 22:34 `src/core/evaluator.ts` JSDoc harness drift 注释。

| 模型 | vals.ai SWE-bench Verified (±CI) | swebench.com SWE-bench Verified | benchlm.ai SWE-bench Pro |
|------|-----------------------------------|----------------------------------|---------------------------|
| Claude Opus 4.8 | **88.60%** ±1.42 | — | 69.20% |
| Claude Opus 4.7 (Adaptive) | 82.00% | — | 64.30% |
| Claude Sonnet 4.6 | 77.40% | — | — |
| GPT-5.5 | 82.60% | — | — |
| GPT-5-2 Codex (high reasoning) | — | 72.80% | — |
| Gemini 3 Flash (high reasoning) | — | **75.80%** | — |
| DeepSeek V3.2 | — | 70.00% | — |
| Claude Mythos Preview | — | — | **77.80%** |

> ⚠️ **Harness drift 警示**: 同一 **Opus 4.8** 在 vals.ai SWE-bench Verified = 88.60% vs benchlm.ai SWE-bench Pro = 69.20%, 跨 **19.4 分差** (harness-multiplier effect 教科书案例)。决策前建议至少跑 3 个独立 harness 取均值 + 95% CI, 不要依赖单一 leaderboard 排名。数据源: [vals.ai/benchmarks/swebench](https://vals.ai/benchmarks/swebench) (2026-06) / [swebench.com](https://www.swebench.com) (2026-02-19 更新) / [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02)。

**v0.5.0 PR 进度**: `src/types/index.ts` `ExternalBenchmarkRoadmap` + `BenchmarkConfig._external_benchmarks_roadmap?` 类型声明 ✅ 全 **35 项** (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/deepswe/long_context_cluster/gpt_5_5_thinking_xhigh/gpt_5_4_thinking_xhigh/claude_opus_4_6_thinking/claude_mythos_5_1m/claude_opus_4_8_1m/`vllm_serving_bench`/`process_aware_scoring`/`lm_eval_harness_v4_config`/`healthbench`/`medqa`/`rcq_clinical` + `aa_agentperf_v1` 2026-06-16 03:23 cron + `arc_agi_3` / `gdpval` / `terminal_bench_hard` / `hf_open_llm_leaderboard_v2` / `safety_bench_2026_suite` 2026-06-16 22:23 cron (Kili 2026 Top 6 维 4 维盲点 + HF OLL v2 首批锚定: 抽象推理 + 真实专业工作 + terminal agentic 高难度 + open-weights 主战场 + safety 三件套, 23→28 项) + **`vllm_mrv2` / `sglang_trtllm_dsa_nsa` / `deepseek_v3_2_long_context` / `qwen3_5_anchor` / `kimi_k2_6_thinking` / `glm_5_anchor` / `minimax_2_5_anchor`** 2026-06-17 03:03 cron (2026-06 serving 推理新主战场 vLLM MRV2 GB200 56% + SGLang × TRT-LLM DSA NSA Blackwell 3-5x + DeepSeek V3.2 1.6T/49B/1M 开源 + Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 4 中国系开源 SOTA 现役模型, 28→35 项) / `src/index.ts` console.info 启用提示 ✅ / `src/core/evaluator.ts` dispatch 分支 ✅ 8 项 stub + **8 项 real fetch** (`webdev_arena` + `cyberseceval3` + `aa_omniscience` + `terminal_bench` + `benchlm_agentic` + `swe_bench_pro` + `process_aware_scoring` + `long_context_cluster` 真集成: POST + timeout / 4xx / 5xx 三段 try/catch + scores[] 注入, 2026-06-14 03:23 + 22:23 + 2026-06-15 00:03 + 03:03 + 04:03 + 05:23 + 06:43 + 2026-06-16 01:03 cron, **8/8 真实化, v0.5.0 dispatch PR 完整**) / `src/web/engine/evaluator.ts` v0.5.0 dispatch 钩子点 JSDoc 标注 ✅ (2026-06-12 01:03 cron) / `src/web/routes/evaluations.ts` 配置验收 ⏳ — **v0.5.0 dispatch 分支完成 (8/8 real fetch), 真完整 PR 估 30-45min**。

> **2026-06 serving 推理新主战场 + 4 开源 SOTA 现役模型首批锚定** (7 个新基准, type 段 28→35): 2026-06 serving 推理领域三重大事件汇总: (a) **vLLM Model Runner V2 (MRV2)** (spheron.network/blog/vllm-model-runner-v2-mrv2-deployment-guide/) 已发布稳定版, 在 **GB200 上 56% throughput gain over legacy runner**, H100 数据稍弱但同向, MRV2 解耦 model forward pass + CUDA graph capture + 异步调度, 是 vLLM 0.8.0+ 默认 runner, 服务端推理栈新基线; (b) **SGLang × TRT-LLM DSA NSA backend for DeepSeek V3.2** (spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks, Spheron 2026 H100 benchmarks) — SGLang 把 TRT-LLM DSA (DeepSeek Sparse Attention) kernels 集成进 Native Sparse Attention (NSA) backend, `--nsa-prefill-backend trtllm` + `--nsa-decode-backend trtllm` 启用后 Blackwell 上 **3x-5x speedup on DeepSeek V3.2**, 是 2026 H1 最具突破性的 serving 加速信号 (DeepSeek V3.2 1.6T total / 49B activated MoE, 1M context); (c) **2026-06 现役 4 开源 SOTA 模型全栈上榜**: **Qwen 3.5** (Alibaba 通义千问 3.5 系列, Qwen3-4B Thinking LiveBench 64.1 / 235B A22B Thinking 62.2 / 397B 全栈) + **Kimi K2.6 / K2.5 Thinking** (Moonshot AI 月之暗面, K2.6 Thinking LiveBench 72.17, K2.5 Thinking 69.07) + **GLM-5 / GLM-5.1** (Z.ai 智谱, 长 horizon agent workflows, Coding index 46.5) + **MiniMax 2.5 / MiniMax-M2.5** (MiniMax 新一代开源, 已被 vLLM 官方支持); — **三信号**: (1) serving 推理栈 2026 Q2 进入「vLLM MRV2 + SGLang TRT-LLM DSA NSA + Modular MAX」三足鼎立, Blackwell/H100 GPU 是新 benchmark 主战场, llm-benchmark 现 v0.5.0 type 段 `vllm_serving_bench` 是 vLLM legacy runner 时期立项, **未锚定 vLLM MRV2 + SGLang TRT-LLM DSA NSA serving 加速** = 评测维度缺 1 主战场; (2) DeepSeek V3.2 是 2026 H1 最强开源 MoE 模型 (1.6T total / 49B active / 1M context), 与 Mythos 5 / Opus 4.8 1M 顶级闭源模型对位, llm-benchmark 当前 `long_context_cluster` 06-14 02:43 立项只覆盖 Mythos 5 / Opus 4.8 闭源, **未锚定 DeepSeek V3.2 开源 1M 长上下文** = open-weights long-context 盲点; (3) Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 是 2026-06 LiveBench / LMSys Arena / Vellum leaderboard 4 大中国系开源 SOTA, 覆盖 long-horizon agent / thinking / coding / context 4 维, llm-benchmark v0.5.0 type 段当前 28 项 (06-16 22:23 完成 + `arc_agi_3` + `gdpval` + `terminal_bench_hard` + `hf_open_llm_leaderboard_v2` + `safety_bench_2026_suite`), 但**未把 vLLM MRV2 + SGLang TRT-LLM DSA NSA + DeepSeek V3.2 1M + Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 4 开源 SOTA 首批锚定** — 与 06-14 02:43 `long_context_cluster` (Mythos 1M+) 形成 "closed-source 1M × open-source 1M × serving 加速 × 现役 4 模型" 四盲点; **7 个新基准首批锚定** 全部补齐 serving-stack + 4 open-weights SOTA + 1M long-context 维度: (1) `vllm_mrv2` (serving 推理栈新基线 #1, 4 hardware 模式 gb200/h100/h200/all, Claude Opus 4.6 / Mythos 5 / DeepSeek V3.2 3 顶级基线) / (2) `sglang_trtllm_dsa_nsa` (serving 推理栈新基线 #2, Blackwell 3-5x speedup, 3 backend trtllm/flashinfer/auto, DeepSeek V3.2 锚定) / (3) `deepseek_v3_2_long_context` (open-weights 1M context SOTA, 3 context 长度 128k/1m/2m, 3 模式 pass_retrieval/pass_reasoning/composite) / (4) `qwen3_5_anchor` (中国系开源 SOTA #1, Qwen 3.5 系列 3 sub_model qwen3_4b_thinking / qwen3_235b_a22b_thinking / qwen3_397b) / (5) `kimi_k2_6_thinking` (中国系开源 SOTA #2, 2 sub_model k2_6_thinking / k2_5_thinking, LiveBench 72.17 / 69.07 锚定) / (6) `glm_5_anchor` (中国系开源 SOTA #3, 2 sub_model glm_5_1 / glm_5, 长 horizon agent) / (7) `minimax_2_5_anchor` (中国系开源 SOTA #4, 2 sub_model minimax_2_5 / minimax_m2_5, vLLM 官方支持); 配合 06-16 22:23 Kili 6 维 + HF OLL v2 (open-weights 主战场) + 06-15 22:43 OPeRA (agent 行为模拟) + 23:43 Coding Agent Index (model+harness 联合) + 06-12 04:03 SWE-bench Pro (Mythos-tier SWE) + 06-15 00:43 healthbench/medqa/rcq_clinical (medical) + 06-16 03:23 AA-AgentPerf (serving-stack) + 06-16 04:23 mythos_5_cyber_glasswing / tcs_anthropic_partnership + 06-14 02:43 long_context_cluster (Mythos 1M+) + 06-16 01:03 coding_agent_index_v1 + metr_v3_task_horizon + 06-16 05:23 LiveCodeBench v6 + Vellum + AA Intelligence Index 形成 "serving-stack (vLLM MRV2 + SGLang TRT-LLM DSA NSA + vllm_serving_bench) × 1M-long-context (closed Mythos + open DeepSeek V3.2) × open-weights SOTA 5 模型 (Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 / DeepSeek V3.2) × composite-leaderboard × agent-stack × agent-behavior × agent-reasoning (ARC-AGI-3) × professional-work (GDPval) × terminal-agentic-hard × open-weights (HF OLL v2) × safety-suite × SWE × security × medical × expert-reasoning × Mythos-tier" 十五维评测范式信号网; 抢 2026 Q2 serving 推理新主战场 (vLLM MRV2 + SGLang TRT-LLM DSA NSA Blackwell) + 现役 4 开源 SOTA + DeepSeek V3.2 1M 长上下文 + 中国系开源主导话语权; 借力 7 个新基准 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 evaluator.ts (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.{vllm_mrv2,sglang_trtllm_dsa_nsa,deepseek_v3_2_long_context,qwen3_5_anchor,kimi_k2_6_thinking,glm_5_anchor,minimax_2_5_anchor}` 字段下生效 (5min cron 不调真实 API, 仅占位)。

> **2026-06 Kili AI Benchmarks 2026 Top 6 维 + HF Open LLM Leaderboard v2 首批锚定** (5 个新基准, type 段 23→28): 2026-06 Kili Technology 「AI Benchmarks 2026: Top Evaluations and Their Limits」终极指南 (https://kili-technology.com/blog/ai-benchmarks-guide-the-top-evaluations-in-2026-and-why-theyre-not-enough) 列出 2026 顶级 AI benchmark 6 维分类: (a) **MMLU/MMLU-Pro/GPQA Diamond** (general knowledge + reasoning, 已锚定 06-15 23:43 `coding_agent_index_v1`) / (b) **Humanity's Last Exam** (expert-level frontier reasoning, 已锚定 06-15 22:43 `opera` + `hle`) / (c) **SWE-Bench/SEAL/LiveCodeBench/Terminal-Bench** (coding, SWE-Bench Pro 06-12 04:03 + LiveCodeBench v6 06-16 05:23 已锚, **Terminal-Bench 2.0 仍未 hard tier 锚定**) / (d) **GAIA/τ2-Bench/WebArena/ARC-AGI-3** (AI agent evaluation, **ARC-AGI-3 未锚定**) / (e) **GDPval** (real-world professional work, **GDPval 未锚定**) / (f) **Agent-SafetyBench/OS-HARM/CUAHarm** (safety, **OS-HARM/CUAHarm 未锚定, Agent-SafetyBench 也未锚定, cyberseceval3 06-14 22:23 是单点不是 2026 顶级 safety 集合**); 同期 2026-06-10 Hacker News 「How I topped HuggingFace Open LLM Leaderboard on two gaming GPUs」(https://news.ycombinator.com/item?id=47322887, 126 comments) 反映 Open LLM Leaderboard v2 已成 open-weights model 评测主战场, **HF Open LLM Leaderboard v2 未锚定** (`lm_eval_harness_v4_config` 06-13 是 backend 不是 leaderboard surface); **5 个新基准首批锚定** 全部补齐 6 维盲点: (1) `arc_agi_3` (Kili agent eval 维, 2 模式 abstract/agentic, Claude Fable 5 / GPT-5.4 / Claude Mythos 5 3 顶级基线) / (2) `gdpval` (Kili professional work 维, 5 任务类别 consulting/law/sales/engineering/all, Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro 3 顶级基线) / (3) `terminal_bench_hard` (Kili coding 维 hard tier, 3 评分模式 pass_rate/duration_score/composite, Claude Opus 4.6 / GPT-5.4-high 2 顶级基线) / (4) `hf_open_llm_leaderboard_v2` (open-weights 主战场, 9 bundled 基准 mmlu_pro/bbh/musr/ifeval/math/gpqa/math_hard, Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout 3 顶级基线) / (5) `safety_bench_2026_suite` (Kili safety 维三件套, 3 子套 agent_safety/os_harm/cua_harm/all, Claude Mythos 5 / GPT-5.4 / Gemini 3.1 Pro 3 顶级基线); 配合 06-15 22:43 OPeRA (agent 行为模拟) + 06-15 23:43 Coding Agent Index (model+harness 联合) + 06-12 04:03 SWE-bench Pro (Mythos-tier SWE) + 06-15 00:43 healthbench/medqa/rcq_clinical (medical) + 06-16 03:23 AA-AgentPerf (serving-stack) + 06-16 04:23 mythos_5_cyber_glasswing_v1 / tcs_anthropic_partnership_v1 (Mythos cybersecurity + enterprise adoption) 形成 "composite-leaderboard × agent-stack × agent-behavior × agent-reasoning (ARC-AGI-3) × professional-work (GDPval) × terminal-agentic-hard × open-weights (HF OLL v2) × safety-suite × SWE × long-context × security × medical × expert-reasoning × Mythos-tier" 十四维评测范式信号网; 抢 2026 Q2 Kili 6 维顶级 AI benchmark 体系 (2026-06 终极指南) + HF OLL v2 (open-weights 主流) 双话语权; 借力 5 个新基准 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 evaluator.ts (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.{arc_agi_3,gdpval,terminal_bench_hard,hf_open_llm_leaderboard_v2,safety_bench_2026_suite}` 字段下生效 (5min cron 不调真实 API, 仅占位)。


> **2026-06-14 Artificial Analysis AA-AgentPerf serving-stack 锚定** (`aa_agentperf_v1`, model+harness+serving-stack 三件套第三腿, type 段 22→23): 2026-06-14 (Sun) Artificial Analysis 发布全新基准 **AA-AgentPerf** (https://wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/), 关键信号: (a) **首个专门评测 agentic AI infrastructure 的 benchmark** — 度量 "在真实工作负载下, 一个推理部署能同时支持多少活跃 agents" (active agents per deployment, 含并发 agent coding / tool-use / session 切换 / GPU 利用率); (b) **NVIDIA Blackwell GB300 首轮登顶, GB300 NVL72 相对 HGX H200 跨 20× / MegaWatt 性能领先** + 「跨多个并发 agent sessions 保持 GPU 满载」为关键能力; (c) 时间窗口 06-09~06-14 同步: vLLM 06-15 登顶 Artificial Analysis (06-15 已立 `vllm_serving_bench`) + D-Matrix Corsair (Microsoft 背书, 推理 10× GPU / 能耗 1/5, CNBC 06-09) + AMD MI450 (Meta 6GW deal) + Nvidia 战略扩 CPU 抢 agentic workload — **2026 Q2 三大趋势汇合**: 评测从「单 model 分数」 → 「model + harness + **serving stack**」三件套, 加上 vLLM / D-Matrix / AMD MI450 三条 serving 路线分流; **3 评测维度**: `active_agents` (同时活跃 agent 数, default) | `throughput_per_mw` (每兆瓦吞吐量) | `gpu_utilization_concurrent` (并发 agent 时 GPU 利用率) + **concurrent_sessions 默认 64** (对位 GB300 NVL72 满载); 配合 06-15 23:43 `coding_agent_index_v1` (model+harness 联合打分) + `metr_v3_task_horizon` (agentic 时长跨度) 形成「model + harness + serving stack」三件套完整 agent-stack 评测信号网; 抢 2026 H2 serving-stack 评测话语权; 借力 Artificial Analysis AA-AgentPerf 公开数据 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 evaluator.ts 真 connection AA-AgentPerf API (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.aa_agentperf_v1` 字段下生效 (5min cron 不调真实 AA-AgentPerf API, 仅占位)。

> **2026-06 Nature Medicine 医学 leaderboard 三件套首批锚定** (`healthbench` 500 items / `medqa` 500 questions / `rcq_clinical` 100 de-identified queries, type 段 15→18): 2026-06-12 Nature 子刊 Nature Medicine 发表 "General-purpose large language models outperform specialized clinical AI tools on medical benchmarks" (https://www.nature.com/articles/s41591-026-04431-5), 关键发现: 通用 LLM (OpenAI **GPT-5.2** + Google **Gemini 3.1 Pro Preview** + Anthropic **Claude Opus 4.6**) 在 3 维医学评测**全部胜过**专科 AI 工具 (OpenEvidence + UpToDate Expert AI) — **(a) 500 HealthBench items 临床医生对齐** + **(b) 500 MedQA questions 医学知识** + **(c) RCQ (Real Clinical Queries) 100 de-identified queries 实测临床环境**; 同期 2026-06-09 Anthropic 发布 **Claude Fable 5** (Mythos-class 首个公开版, 「combines state-of-the-art vision with knowledge reasoning」) + 2026-06 Ramp AI Index (50,000+ US 公司发票+卡数据) Anthropic **34.4%** 企业采用首超 OpenAI **32.3%** — **三信号**: 2026 Q2 medical/clinical leaderboard 已成新主战场 (通用 LLM > 专科 AI 是 Nature 级证据) + Fable5 vision+knowledge 强 + 企业采用 Anthropic 首超 OpenAI; 与 `cyberseceval3` (Mythos 5 安全主战场) 形成 "security × medical" 双主战场对位, 配合 `swe_bench_pro` (Mythos-tier SWE 80.3%) + `long_context_cluster` (62 tasks 1M+ context) 形成 "SWE × long-context × security × medical" 四维 Mythos-tier 信号网; 借力 Nature Medicine 公开数据 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 evaluator.ts 真 connection HealthBench/MedQA/RCQ API (估 30-45min 跨 6-9 轮 cron 累进); 当前仅在 `_external_benchmarks_roadmap.{healthbench,medqa,rcq_clinical}` 字段下生效 (5min cron 不调真实 Nature Medicine benchmark API, 仅占位)。

## 🛠️ Companion tooling（推理服务 SLO 评测，与 llm-benchmark 互补）

llm-benchmark 定位「**模型质量评测**」（对话 / 编码 / 工具调用 / 长上下文 / 多轮 5 维度 + v0.5.0 15 项候选基准），不覆盖「**推理服务 SLO 评测**」。用户 production 部署前需要知道「这个模型在 vLLM serving 上 SLO 是否满足」，因此推荐互补工具：

### GuideLLM — SLO-aware Benchmarking for Real-World LLM Inference

- **GitHub**: [vllm-project/guidellm](https://github.com/neuralmagic/guidellm) (2026-06-06 README 更新)
- **定位**: **SLO-aware Benchmarking and Evaluation Platform for Optimizing Real-World LLM Inference**

**5 项关键能力**：
- (a) **端到端模拟** OpenAI-compatible + vLLM-native servers，真实负载与配置
- (b) **生成 workload patterns** 反映生产用法，**reproducibility sweep** 找出 safe operating ranges
- (c) **3 类负载模式**：`rate-based` / `concurrency` / `latency-targeted`
- (d) **双数据集支持**：real + synthetic multimodal datasets（controlled experiments + production-style eval）
- (e) **标准化 exportable reports** for dashboards

**双工具链 workflow**（production deploy 前）：
1. 用 **llm-benchmark** 拿「**模型质量分**」（dialogue / coding / function_calling / long_context / multi_turn 5 维度）
2. 用 **GuideLLM** 拿「**推理服务 SLO sweep**」（TTFT + 吞吐 + 并发安全区间）
3. 两个分数交叉，决策 production deploy

**评测维度对位表**（互补不重叠）：

| 评测维度 | llm-benchmark | GuideLLM |
|---------|---------------|----------|
| 模型质量（对话 / 编码 / 工具调用 / 多轮） | ✅ 主战场 | ❌ |
| 长上下文 (32k+ / 1M context) | ✅ `long_context` 维度 + `long_context_cluster` 62 tasks | ❌ |
| 推理延迟 (TTFT) | ❌ | ✅ 主战场 |
| 推理吞吐量 (token/s) | ❌ | ✅ 主战场 |
| SLO 安全区间 (safe operating range) | ❌ | ✅ 主战场 (reproducibility sweep) |
| 多模态数据集 | ❌ | ✅ (real + synthetic) |
| 跨 harness 三角验证 (LiveBench / Vals / BenchLM) | ✅ `src/core/evaluator.ts` JSDoc | ❌ |

**配套配置**：`BenchmarkConfig.companion_tools.guidellm?: { installed?: boolean; sweep_config?: string }`（roadmap-only，默认 undefined，5min cron 不调真实 GuideLLM endpoint）

**生态关系**：llm-benchmark 与 GuideLLM 是**互补**而非竞争 —— llm-benchmark 评「**模型本身**」，GuideLLM 评「**推理服务**」。配合 [vLLM serving bench (`vllm_serving_bench`)](https://vllm.ai/blog/2026-05-11-vllm-tops-artificial-analysis) + [vLLM 06-04 Nemotron 3 Ultra day-0 blog](https://vllm.ai/blog/2026-06-04-nemotron-3-ultra-vllm) 形成「**模型质量 × 推理服务 SLO**」双工具链入口，抢 2026 推理服务可重复 sweep 范式首日话语权。

## 输出报告

评测完成后会生成三种格式的报告：

- `benchmark-xxx.json` - 原始数据
- `benchmark-xxx.md` - Markdown 报告
- `benchmark-xxx.html` - 可视化 HTML 报告

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run start

# 运行测试
npm test

# 代码检查
npm run lint

# 构建
npm run build
```

## 版本历史

### v0.4.0 (2026-06-02)
- ✨ 包名重命名为 `@xingp14/llm-benchmark`，新增 `publishConfig.access: "public"`（已通过 `npm publish --dry-run` 验证：95 files / 46.7 kB ✅）
- ✨ 新增 GitHub Actions CI workflow（Node 20 + lint + build + `npm test --bail`）
- ✨ 新增 Docker Hub 自动构建 workflow（`v*` tag 触发，构建 `xingp14/llm-benchmark` 镜像）
- ✨ README 顶部加 GitHub Actions / Docker Hub / npm version / License / Node 徽章
- ✨ README 新增「拉取预构建 Docker 镜像」子章节（`docker pull` / `docker run` / tag pin 完整示例）
- ✨ 改用 `npx @xingp14/llm-benchmark` 一键运行引导
- ✨ 新增 DeepSeek adapter（`type: 'deepseek'`，OpenAI 兼容，含 `deepseek-chat` 默认 + `deepseek-reasoner` 推理回退）
- ✨ 新增 通义千问 Qwen (DashScope) adapter（`type: 'qwen' | 'tongyi' | 'dashscope'`，默认 `qwen-turbo`，支持 `qwen-plus` / `qwen-max` / `qwen3-max`）
- ✨ 新增 Ollama 本地模型 adapter（`type: 'ollama' | 'local'`，默认 `http://localhost:11434` + `llama3.2`，本地无需 API key）
- ✨ 新增「工具调用 / Function Calling」评测维度（5 题，Scorer.scoreFunctionCalling：name+args 100/70/40/0，CLI + Web + DB + API 全链路）
- ✨ 新增「长上下文理解 / Long Context」评测维度（3 题，需 32k+ context，Scorer.scoreLongContext 基于 keyFacts 命中比例，CLI + Web + DB + API 全链路）
- ✨ 新增「多轮对话一致性 / Multi-Turn」评测维度（3 题，Scorer.scoreMultiTurn 基于 required/forbidden 短语一致性校验，CLI + Web + DB + API 全链路）

### v0.3.0 (2026-05-23)
- ✨ 新增 Web UI（Express + WebSocket 实时进度）
- ✨ 新增 SQLite 数据库层（configs / evaluations / results）
- ✨ 新增 JWT 认证
- ✨ 新增 Docker / docker-compose 一键部署
- 🐛 修复评分系统 3 个 bug
- 🐛 解决 56 个 failing tests（SQLite race + 覆盖率）

### v0.2.0 (2026-05-23)
- ✨ 新增 Anthropic Claude 适配器
- ✨ 新增 智谱 GLM 适配器
- ✨ 新增 Python 沙盒执行器

### v0.1.0 (2026-05-23)
- 🎉 首次发布
- ✅ OpenAI 兼容接口支持
- ✅ 对话能力评测 (13题)
- ✅ 代码能力评测 (11题)
- ✅ 评测报告生成

## License

MIT

## 相关文档

- [SECURITY.md](./SECURITY.md) — 漏洞报告与安全策略
- [CONTRIBUTING.md](./CONTRIBUTING.md) — 贡献指南（PR 流程 / 提交规范 / 开发环境）
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — 社区行为准则 (Contributor Covenant v2.1)
- [CHANGELOG.md](./CHANGELOG.md) — 版本变更日志 (Keep a Changelog 1.1.0)
- [ROADMAP.md](./ROADMAP.md) — 项目路线图与近期规划
