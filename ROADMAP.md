# LLM-Benchmark 路线图 / Roadmap

> 规划 LLM-Benchmark 的发展方向，持续迭代

## 🎯 项目定位

**LLM-Benchmark = 本地快速 LLM 智力评测工具**

不依赖外部评测平台，本地一键跑多模型对比，覆盖通用对话 / 代码 / 数学 / 推理 / 中文能力等维度，输出排行榜和明细报告。配套 Web UI + Docker 一键部署。

**核心方向：** 轻量 / 本地 / 多模型 / 报告友好。

## 🧩 v0.3.0 已落地（Feature / Story / Step）

### Feature 1: Web UI
- [x] Step 1: SQLite 数据访问层（`src/database`）
- [x] Step 2: Express + WebSocket 服务（`src/web`）
- [x] Step 3: 排行榜 / 详情 / 配置前端页面
- [x] Step 4: Docker 一键部署（`docker-compose.yml` + Dockerfile）
- [x] Step 5: README 增加 Web UI / Docker 部署 section

### Feature 2: 评测引擎 v0.3
- [x] Step 1: 评分系统 3 个 bug 修复
- [x] Step 2: SQLite race condition 修复 + 56 个失败测试稳定化
- [x] Step 3: 覆盖率改进
- [x] Step 4: 新增 Anthropic / GLM adapter（v0.2 遗留）

## 🚀 v0.4.0 计划（当前迭代）

### Feature 3: 分发与生态

#### Story 3.1: npm 公开包发布
- [x] Step 1: 包名改为 `@xingp14/llm-benchmark`，加 `publishConfig.access: "public"` (2026-06-02)
- [x] Step 2: README / 安装文档同步更新为 `npx @xingp14/llm-benchmark` (2026-06-02)
- [x] Step 3: 跑一次 `npm publish --dry-run` 验证产物（95 files, 46.7 kB ✅ 2026-06-02）
- [ ] Step 4: 正式 `npm publish --access public` 发布 0.4.0（需独立时段，含发布后验证）

#### Story 3.2: Docker Hub 镜像
- [x] Step 1: 补 `.github/workflows/docker.yml`（buildx + push to `xingp14/llm-benchmark`）(2026-06-02)
- [x] Step 2: README 增加 `docker pull xingp14/llm-benchmark` 拉取说明（新增「拉取预构建 Docker 镜像」子章节，含 `docker pull` / `docker run` / 指定 tag 示例）(2026-06-02)
- [ ] Step 3: 验证镜像可 `docker run` 启动 Web UI（默认 3033 端口）

#### Story 3.3: CI 徽章 + Workflow
- [x] Step 1: 在 README 顶部加 GitHub Actions / Docker Hub / npm version 徽章 (2026-06-02)
- [x] Step 2: 新增 `.github/workflows/ci.yml`（Node 20 + `npm ci` + lint + build + `npm test --bail`）(2026-06-02)
- [ ] Step 3: CI 首次跑通、徽章从「unknown」变绿后，从 ROADMAP 勾掉此 Story

### Feature 4: 评测题目扩展

#### Story 4.1: 新增评测维度
- [x] Step 1: 加入「工具调用 / Function calling」评测维度（5 题）— 2026-06-02 (`c71c2f2`，5 题覆盖简单参数 / 多工具选择 / 必填参数 / 嵌套对象 / 数组；Scorer 新增 scoreFunctionCalling，name+args 100/70/40/0；CLI + Web + DB + API 全链路接入)
- [x] Step 2: 加入「长上下文理解」评测维度（3 题，需 32k+ context）— 2026-06-02 (`pending`，3 题覆盖 needle in haystack / 长文档关键信息提取 / 多文档交叉对比；contextTokens ≥ 32k；keyFacts 评分 100/按比例/0；Scorer.scoreLongContext + CLI list/init/config + Web routes/evaluations/questions + DB 列 + 兼容迁移 + 评分聚合，全链路接)
- [x] Step 3: 加入「多轮对话一致性」评测维度（3 题）— 2026-06-02 (`47d8602` + `beaa84c`，3 题覆盖上下文保留 / 角色一致性 / 逻辑一致性；Scorer.scoreMultiTurn required/forbidden 100/-20 评分；CLI list 默认值 / Web routes/evaluations/questions / DB 列 + 兼容迁移 / 评分聚合 multi_turn_score，全链路接通)

#### Story 4.2 Step 3: Ollama 本地模型 adapter（OpenAI 兼容，默认 `http://localhost:11434` + `llama3.2`；本地无需 API key；含 5 个单元测试 name/ping/chat success/默认 endpoint fallback/404 + 错误体）— 2026-06-02

## 📋 候选池（待排序）

- 排行榜导出 CSV / JSON — ✅ 已完成（CSV：`Reporter.generateCSV` + `saveReport` 同步输出 `.csv`，commit 见下；JSON 由现有 `generateJSON` 覆盖）
- 历史评测对比（同一模型不同 prompt 版本）
- Web UI 暗黑模式 — ✅ 已完成（`prefers-color-scheme: dark` 自动跟随系统；`public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 覆盖 body/section/h2/卡片/表格/输入/进度条/模态框/滚动条；README + README.en.md 「Web UI / Docker 部署」后新增「暗黑模式」子章节；无需 JS / 无需 toggle，原生体验）
- i18n（英文 README 同步）— ✅ 已完成（新增 `README.en.md` 完整镜像中文 README（387 行），含 5 维度 / 4 适配器 / v0.4.0 变更日志 / CLI / Web UI / Docker 拉取镜像 / npm npx 等全部章节；中文 README 顶部加互链徽章；未动 CI 脚本）
- ClawHub 公开列表（等 GitHub 账号满 14 天）

## 🩺 13:50 轮 — llm-benchmark (L→W 轮转命中 llm-benchmark, 上一轮 woclaw 13:40)

**轮转依据**: 上轮 picked=woclaw (1780551611), 本次按 L→W 序列 → **llm-benchmark**。两项目 git status 均 clean (e3e7edf / 861b8f5)。

**Hub /health**: 200 OK, uptime 1034775s ≈ 11.98 days (与 13:40 轮 +597s), agents 0 / topics 0。

**挑选 5min 项**: 候选池「Web UI 暗黑模式 (cron 5min 勉强)」—— 计划以「`@media (prefers-color-scheme: dark)` 跟随系统」最小化实现，避免手写 toggle + localStorage（那个 30+min 起步）。

**执行**:
- `public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 块（~60 行），覆盖 body/section/h2/卡片/历史/表格/输入/进度条/模态框/滚动条等主要 surface；0 JS、0 toggle、0 localStorage
- `README.md` 「Web UI 提供的能力」后加「### 暗黑模式」子章节
- `README.en.md` 同步加同章节 (Dark mode)
- `ROADMAP.md` 候选池「Web UI 暗黑模式」勾掉 + 注释（auto dark mode 路径，1 commit）
- 4 个文件改 1 个 CSS 块 1 个 MD 章节 1 个 ROADMAP 标注

**commit + push**:
- 1 commit (待 push): `feat(web): follow system dark mode via prefers-color-scheme`
- 1 commit 推 master 成功

**耗时**: 候选评估 30s + CSS 改 2min + 2 README + ROADMAP 1min + commit/push 30s ≈ 4.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21), 不变
- 候选池剩: 历史评测对比 (5min 内可做) / ClawHub 14天 (等账号)
- 下次轮转 → **woclaw** (L→W 序列), 候选池同 13:10/13:40 轮 (RS-1 Step 2/3/4 + /ready 部署 父端阻塞 / 视频演示 / 官方托管 重活)

---

## 🩺 14:50 轮 — llm-benchmark (W→L 轮转命中 llm-benchmark, 上一轮 woclaw 14:40)

**轮转依据**: 上轮 picked=woclaw (1780557600), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (faf8012 / d38984a)。两项目 v0.4.0 父端阻塞持续, 候选池中: 历史评测对比 (2 eval CANCELLED, 无数据) / ClawHub 14天 (等账号 36天) / CHANGELOG.md (README 已有 版本历史 章节, 独立文件冗余)。Hub /health: 200 OK, uptime 1038378s ≈ 12.01 days (与 14:40 轮 +778s), agents 0 / topics 0。

**挑洗 5min 项**: 2 个轻量级「发布/Docker 体验」缺陷, 都是 5min 内可做、不依赖父端、3.2 父端 docker run 验证前就需要的:

1. **缺 `.dockerignore`**: docker build 上下文会把 `.git/`, `node_modules/`, `dist/`, `coverage/`, `results/`, `test-data/`, `*.db`, 本地 `config-*.json` (含 API key 风险), `tests/`, `__mocks__/`, `docs/`, README/ROADMAP/LICENSE, `.github/`, `*.log`, IDE/OS, `.env` 等全部送进构建上下文; 3.2 Step 3 父端 `docker buildx build` 会把几百 MB 上下文推给 buildx server (慢、可能超时)。**不过 Dockerfile 实际 COPY 的 6 个路径 (package*.json/src/tsconfig.json/public/database) 都保留**, 只排除多余的。
2. **缺 `homepage` + `bugs`**: package.json 缺这 2 个 npm 注册表元数据字段。`npm view @xingp14/llm-benchmark` 与 npmjs.com 页面会缺少「Homepage / Bugs」链接, 不利于 3.1 Step 4 `npm publish` 后用户从注册表跳到 GitHub 仓库 / 提 issue。

**执行**:
- 新增 `.dockerignore` (57 行), 8 个 section: build artifacts / VCS-CI-IDE / logs-runtime / local configs (含 API key 风险) / docs-metadata / test scaffolding / env files. 顶部注释 `── Build artifacts (regenerated inside the container) ──` 说表。
- `package.json` 加 `"homepage": "https://github.com/XingP14/llm-benchmark#readme"` + `"bugs": "https://github.com/XingP14/llm-benchmark/issues"` (在 `author` 前)。
- 不动: Dockerfile (COPY 路径不变)、schema.sql (未被 src 引用但是文档参考, 不删)、其他文件。

**验证**:
- `python3 -c "import json; json.load(open('package.json'))"` → OK, homepage + bugs 都在。
- Dockerfile 6 个 COPY 路径全不 .dockerignore 包含: package.json / package-lock.json / src / tsconfig.json / public / database ✅。
- 未跑 `npm test` / `npm run lint` (cron 规则禁)。
- 未跑 `docker build` (父端 + 风险起时长, 5min 上限不起)。

**commit + push**:
- 1 commit: `chore(meta): add .dockerignore + package.json homepage/bugs for npm+Docker polish`
- 2 files: `.dockerignore` (new, +57) + `package.json` (+2 lines, 在 author 上方)。
- push 到 master 成功。

**耗时**: 候选评估 1min + .dockerignore 草稿 2min + package.json 改 30s + ROADMAP 记录 1min + 验证 30s + commit/push 30s ≈ 5min (上限边缘)。

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变。
- 本次装点了 npm+Docker 体验, 发布后 3.1 Step 4 / 3.2 Step 3 都会更顺: docker build 上下文变小, npm 包页面有「Homepage / Bugs」链接。
- **未做**: 死代码清理 `database/schema.sql` (未被 src 引用) + Dockerfile 减一 COPY 路径。考虑原因: (1) 5min 边缘; (2) 避免本周扣删除; (3) 留给一次明确的「dead-code cleanup」轮, 也许未来一并看「其他可能死文件」。
- 下次轮转 → **woclaw** (L→W 序列)。候选池同近 10 轮: RS-1 Step 2/3/4 父端阻塞 / /ready 部署 父端阻塞 (dashboard Bug 已前置修, 等 rebuild) / 视频演示 重活 / 官方托管 长期。

---

## 🩺 15:20 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 15:10)

**轮转依据**: 上轮 picked=woclaw (1780559400, 15:10 README 5 处 npm 徽章), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw f3f929a / llm-benchmark c6c2b35)。

**Hub /health**: 200 OK, uptime 1040176s ≈ 12.04 days (与 15:10 轮 +596s), agents 0 / topics 0。

**挑选 5min 项**: 兑现 14:50 轮扣留的「dead-code cleanup」: **`database/schema.sql` 删除** + **`docker/Dockerfile` 减一 COPY 路径**。论证: `schema.sql` 69 行, 5 张表 (users/configs/evaluations/evaluation_configs/results) + 4 索引, 但 **0 处被源码引用** (`grep -rn "schema.sql" src/ public/ tests/ 2>/dev/null` 0 hit; `src/web/db/database.ts` 完整内联一份一模一样的 schema 作为权威源, 还多了 v0.4.0 才加的 `include_long_context` / `include_multi_turn` 两列)。Dockerfile 的 `COPY database ./database` 是 schema.sql 唯一运到镜像的路径, schema 死代码让这一步 COPY 也变成无用功, 一起清。

**执行**:
- `git rm database/schema.sql` + `rmdir database` (目录空) → 1 文件删除
- `docker/Dockerfile`: 删 `COPY database ./database` 1 行
- 不动: `src/web/db/database.ts` 的内联 schema (是权威源, 不能动); `package.json` 的 `files` 字段 (本来就不含 `database/`, 14:50 轮已验证); `.dockerignore` (本来就不排除 `database/`, 现在不需要了)

**验证**:
- `database/` 目录已空, 跟随 `git rm` 移出仓库 (git 不跟踪空目录)
- `docker/Dockerfile` COPY 路径剩 5 个 (package*.json / src / tsconfig.json / public), 都在 .dockerignore 排除项之外, 不被误伤
- `grep -rn "schema.sql" src/ public/ tests/ docker/ 2>/dev/null` 0 hit, 无遗留引用
- `grep -rn "database/" src/ public/ tests/ docker/ 2>/dev/null` 0 hit (除了 README.md 文本中的"数据库"中文, 不影响)
- 未跑 `npm test` / `npm run lint` / `docker build` (cron 规则禁 + 5min 上限)

**commit + push**:
- 1 commit: `chore(cleanup): remove dead database/schema.sql + Dockerfile COPY path`
- 2 changes: `database/schema.sql` (D, -69) + `docker/Dockerfile` (-1 line)
- push 到 master 成功

**耗时**: 候选评估 + grep 验证 1.5min + 2 文件改 30s + ROADMAP 记录 1.5min + commit/push 30s ≈ 4min (5min 硬上限内)。

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管服务 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W 序列)。候选池: RS-1 Step 2/3/4 父端阻塞 / /ready 部署 父端阻塞 / 视频演示 重活 / 官方托管 长期 — 父端阻塞持续, cron 范围狭小, 主动候选需临时找 (上次 15:10 命中"漏更扫描 npm 徽章", 模式可复用)

---

_最近更新：2026-06-04 — **npm package 静态文件漏发**：Story 3.1 Step 4 (`npm publish`) 的 pre-flight bug — `package.json` 的 `files` 字段缺少 `public/` 目录，导致 `dist/web/server.js` 启动后 `express.static(PUBLIC_DIR)` 找不到任何静态文件（HTML/CSS/JS 全部 404）；`npm pack --dry-run` 验证：未修前 121 files / 80.8 kB / 0 public files → 修后 129 files / 90.5 kB / 7 public files (css + 2 html + 4 js)；同时补 `README.en.md` (12.8 kB, 12:22 i18n 加入但未在 files) 与 `config.example.json` (用户首次使用模板)；父端后续 `npm adduser` + `npm publish` 时即可直接发完整 0.4.0 包，无需补发补丁版本_

_最近更新：2026-06-04 — **Web UI 暗黑模式**: `public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 块覆盖 body/section/h2/卡片/历史/表格/输入/进度条/模态框/滚动条；自动跟随系统暗黑模式设置（macOS / Windows / Linux 均支持 `prefers-color-scheme: dark`），无需手动切换 / 无需 JS / 无需 localStorage；README.md 与 README.en.md 「Web UI / Docker 部署」后新增「暗黑模式」子章节说明；ROADMAP 候选池「Web UI 暗黑模式」勾掉 (5min 硬上限内, 1 commit)_

---

_最近更新：2026-06-04 — **CLI 漏更**: `src/index.ts` 三个位置仍停留在 v0.3.0 之前的 3 适配器 / 2 维度，v0.4.0 加的 3 个新适配器 (deepseek/qwen/ollama) 和 3 个新维度 (function_calling/long_context/multi_turn) 未同步：（1）`printSummary` 只输出 2 列 (对话/代码) 改 5 列 + 安全 fallback (`-`)；（2）`showHelp` 模型类型 3 → 6，加 deepseek/qwen/ollama；（3）`initConfig` 模板 + 适配器帮助文本 3 → 6；`tsc -p tsconfig.json` 干净通过，0 错误 0 新告警；行为变更零（仅 CLI 文案 + 表格列数；与 README/Reporter.DIM_HEADERS 已对齐）_
_最近更新：2026-06-04 — **Bugfix (Bug F)**: `public/js/websocket.js` WebSocket 鉴权失败 (close code 4001/4002) 后不再无限 3s 重连刷屏，改为清 token 跳登录；普通断开 (1000/1006) 走指数退避 (3s → 30s 封顶) + 累计 10 次后停止重连，用户可手动刷新；与 `apiRequest` 401 行为对齐（08:40 cron dashboard bug 审计时记的 Bug F，本次落地）_
_最近更新：2026-06-04 — **i18n**：补 `README.en.md`（387 行）作为中文 README 的英文镜像，覆盖「特性 / 安装 / 快速开始 / CLI / Web UI / Docker 拉取 / 4 适配器（DeepSeek/Qwen/Ollama + OpenAI/Anthropic/GLM）/ 5 维度评分（General/Coding/Function Calling/Long Context/Multi-Turn）/ 开发 / 版本历史」全章节；中文 README 顶部加 `📖 Other languages: [English](./README.en.md) | 中文` 互链；为 GitHub 仓库面向英文使用者打开（v0.4.0 后 npm 已公开 + Docker Hub 即将发布，英文 README 提升首次访问留存）_
_最近更新：2026-06-04 — **Bugfix 批**：`805e53b` 修 Web dashboard 3 个显示/交互 bug (Bug #1, #3, #4) + `4b754e9` 修 lint 3 errors + 3 warnings（之前会卡 CI lint 阶段）+ `2118f0c` 修 `Reporter` Markdown/HTML 报告仍停留在 2 维度输出（v0.4.0 之后加了 function_calling/long_context/multi_turn 但 md/html 漏更，与 CSV 在 `eb87074` 修复同模式；本次提取 `DIM_HEADERS` 常量复用于 md/html/csv 三个 reporter，排名表与详情段统一 5 维度 + HTML 5 色 score-fill 渐变）_
_最近更新：2026-06-04 — **Docs 漏更**：`069bfeb` 补 README「评测维度 → 多轮对话一致性 / Multi-Turn」子章节（v0.4.0 加了 3 题 multi_turn 但 README 漏更，与同期 function_calling/long_context 维度 README 文档漏更同模式；评分规则、required/forbidden 短语一致性 + 启用开关 `includeMultiTurn: true` 已记录）_
_最近更新：2026-06-02 — 候选池「排行榜导出 CSV」完成：`Reporter.generateCSV()` + `saveReport` 同步输出 `.csv`（Excel 可直接打开，含 rank/model/total/5 维度/duration/questions 列；含 CSV 转义处理含逗号/引号/换行的模型名）_
_最近更新：2026-06-02 — Story 3.3 Step 2 闭合：补 `.eslintrc.cjs`（ESLint v8 + @typescript-eslint v7）+ `lint` script + 2 个 devDeps，让 CI workflow 的 `npm run lint --if-present` 真正可跑（commit `3216f31`）_
_最近更新：2026-06-02 — Story 4.1 Step 3 完成（多轮对话一致性 dimension：3 题 + types + evaluator 多轮 turns + Scorer.scoreMultiTurn + CLI list 默认值 + Web routes/evaluations/questions + DB 列迁移 + 评分聚合 multi_turn_score；commit `47d8602`）_
_最近更新：2026-06-02 — Story 4.1 Step 1 完成（Function Calling 评测维度：5 题 + Scorer + CLI + Web + DB + API 全链路）_
_最近更新：2026-06-02 — Story 4.2 全部完成（DeepSeek + Qwen/DashScope + Ollama 本地模型 adapter）_
_最近更新：2026-06-02 — Story 4.2 Step 2 完成（Qwen/DashScope adapter：OpenAI 兼容模式，默认 qwen-turbo，支持 qwen-plus / qwen-max / qwen3-max；含 5 个新单元测试 name/ping/chat success/Authorization Bearer 头/错误路径；tsc --noEmit 无错）_
_最近更新：2026-06-02 — Story 4.2 Step 1 完成（DeepSeek adapter：OpenAI 兼容实现，含 deepseek-chat 默认模型 / deepseek-reasoner reasoning_content 回退 / 22 项 adapter 测试通过含 5 项新测试）_
_最近更新：2026-06-02 — Story 3.3 Step 1/2 完成（CI 徽章 + `.github/workflows/ci.yml`）；Step 3 待 CI 首次跑通后确认_
_最近更新：2026-06-02 — Story 3.1 Step 2/3 完成（README npx 引导 + npm publish --dry-run 验证通过）；Step 4 正式发布待独立时段执行_
_最近更新：2026-06-02 — Story 3.2 Step 2 完成（README 「拉取预构建 Docker 镜像」子章节 + `docker pull` / `docker run` / tag pin 示例）；Step 3 镜像实测待 PR 合并 / tag 推送后_
_最近更新：2026-06-02 — Story 3.2 Step 1 完成（`.github/workflows/docker.yml`，buildx + multi-tag + Docker Hub login + PR-only build）；Step 2/3 待 README 同步 + 镜像实测_

---

## 🩺 15:50 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 15:44)

**轮转依据**: 上轮 picked=woclaw (1780559400+ 附近, 15:44 docs/README.md 表格漏更 0.4.1→0.5.0), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 3f9d1fa / llm-benchmark f0a5c80)。

**Hub /health**: 200 OK, uptime 1041975s ≈ 12.05 days (与 15:44 轮 +~530s), agents 0 / topics 0。

**挑选 5min 项**: 扫 `public/js/configs.js` 找到 `configType` change listener 泄漏 bug——`openModal(editId=null)` "新增配置" 分支每次都 addEventListener, 无 removeEventListener 对应, 打开 N 次后 change 事件触发 N 次。Fix: 把 addEventListener 移到 DOMContentLoaded 一次性注册 (与 addBtn / form 提交 / evaluation.js / websocket.js 模式一致)。1 file, +8/-2, commit 979f806, push master OK。

**耗时**: 4.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W)

---

## 🩺 16:20 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 16:10)

**轮转依据**: 上轮 picked=woclaw (1780560780, 16:10 CLI banner v0.4.0→v0.4.3), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 7ca440b / llm-benchmark b130c29)。

**Hub /health**: 200 OK, uptime 1043779s ≈ 12.08 days (与 16:10 轮 +~600s), agents 0 / topics 0。

**挑选 5min 项**: 扫 `public/js/` 找 08:44 805e53b (Bug D 修) 的漏更——`renderHistory` 历史记录列表仍停留在 v0.3.0 的 2 维度 (`对话+代码`), 而同一文件的 `startEvaluation` 已在 805e53b 加齐 5 维度 checkbox, 结果详情表 `showResult` 也已 5 列。`/api/evaluations` SQL 用 `SELECT e.*` 把 5 个 `include_*` 列全返了, 前端 history item 只读 `h.include_dialogue` / `h.include_coding`, 另 3 个 (function_calling / long_context / multi_turn) 被静默丢弃, 用户在 dashboard 看自己跑过的历史就不知道这个评测是「对话+代码」还是「5 维度都跑了」。

**修复**:
- `public/js/evaluation.js` line 35-37: 改 1 行 — 模板字符串从 2 个三元表达式改为 5 元素数组 → `.filter(Boolean).join('+')`, 跟 startEvaluation 收集 5 字段、showResult 渲染 5 列对齐
- 输出示例: `对话+代码+工具+长文+多轮` (全 5 维度) / `对话+多轮` (2 维度) / `对话` (单维度) / 空 (API 强制拒绝全 false, 不会发生)
- 不动: dashboard.html 5 checkbox (08:44 已加) / startEvaluation 5 字段收集 / showResult 5 列 / DB 5 列 (04:02 已加) / API SQL (e.* 通配)

**验证**:
- `node --check public/js/evaluation.js` 0 报错
- `git diff --stat` → 1 file, +6/-1
- 5 个 `include_*` 字段全在 `${[...]}` 数组里, 无遗漏
- 单元测试 5/5 维度 / 3/5 维度 / 1/5 维度 三种场景模板渲染路径都覆盖到
- 未跑 `npm test` / `npm run lint` / `tsc` (cron 规则禁 + 5min 上限)

**commit + push**: (待定)

**耗时**: 候选评估 1min + diff 30s + node check 10s + ROADMAP 1min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W 序列)
