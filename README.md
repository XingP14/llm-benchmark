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
| `benchlm_agentic` | Agentic eval 24 项 (Design2Code / Vision2Web / Native Evals) | 候选（v0.5.0） | [BenchLM.ai](https://benchlm.ai/) (2026-06-07 发布, 248 模型 × 225 基准) |
| `cyberseceval3` | LLM 安全 / 8 项风险 (offensive security) | 候选（v0.5.0） | Meta CyberSecEval 3 (2025-12 发布) |
| `swe_bench_pro` | Agentic SWE (多文件 / 长上下文 / 复杂工程) | 候选（v0.5.0） | [benchlm.ai/benchmarks/swePro](https://benchlm.ai/benchmarks/swePro) (2026-06-02, Mythos-tier 主标杆) |
| `deepswe` | Agentic SWE (113 任务 / 91 开源 repo / 5 语言 Python+JS+Go+Java+Rust) | 候选（v0.5.0） | DeepSWE (2026-05-26 发布, GPT-5.5 70% 领先 +16 分) |
| `long_context_cluster` | 长上下文评测 cluster (62 tasks: LongBench v2 21 + Babilong 13 + InfiniteBench 18 + Phonebook 10) | 候选（v0.5.0） | EleutherAI/lm-evaluation-harness PR #3256 (2026-Q2, 4 基准 62 tasks 全实现, 0 从零开发) |

> ⚠️ **SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)**: Scale AI SWE-Bench Pro 验证器在约 **1/3 试验中给出错误 pass/fail 判定**, 即 `swe_bench_pro` 现行分数普遍存疑 (Claude Opus 曾利用「benchmark loophole」拿分)。决策前请**三角验证**: `swe_bench_pro` (benchlm.ai) ↔ `deepswe` (宽 spread) ↔ `vals.ai` SWE-bench Verified (Opus 4.8 88.60% ±1.42), 不要依赖单一 harness 排名。来源: [VentureBeat 2026-05-26 DeepSWE 报道](https://venturebeat.com/technology/deepswe-blows-up-the-ai-coding-leaderboard-crowns-gpt-5-5-and-finds-claude-opus-exploiting-a-benchmark-loophole)。与本表 SWE-bench 三源 cross-validation 段 + `src/core/evaluator.ts` 22:34 JSDoc harness drift 注释形成「验证器警告 + 多源数据 + harness drift 解释」三位一体。

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

**v0.5.0 PR 进度**: `src/types/index.ts` `ExternalBenchmarkRoadmap` + `BenchmarkConfig._external_benchmarks_roadmap?` 类型声明 ✅ 5 项 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3, 2026-06-10 00:24 + 06:43 cron) / `src/index.ts` console.info 启用提示 ✅ / `src/core/evaluator.ts` dispatch 分支 ✅ 5 项 stub (路由入口, 2026-06-10 01:43 + 22:23 cron) / `src/web/routes/evaluations.ts` 配置验收 ⏳ — 真完整 PR 估 30-45min（跨 6-9 轮 cron 累进），v0.5.0 不发版。

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
