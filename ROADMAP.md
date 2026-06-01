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
- [ ] Step 1: 加入「工具调用 / Function calling」评测维度（5 题）
- [ ] Step 2: 加入「长上下文理解」评测维度（3 题，需 32k+ context）
- [ ] Step 3: 加入「多轮对话一致性」评测维度（3 题）

#### Story 4.2: 新模型 adapter
- [ ] Step 1: DeepSeek adapter（OpenAI 兼容）
- [ ] Step 2: Qwen (DashScope) adapter
- [ ] Step 3: Ollama 本地模型 adapter

## 📋 候选池（待排序）

- 排行榜导出 CSV / JSON
- 历史评测对比（同一模型不同 prompt 版本）
- Web UI 暗黑模式
- i18n（英文 README 同步）
- ClawHub 公开列表（等 GitHub 账号满 14 天）

---

_最近更新：2026-06-02 — Story 3.3 Step 1/2 完成（CI 徽章 + `.github/workflows/ci.yml`）；Step 3 待 CI 首次跑通后确认_
_最近更新：2026-06-02 — Story 3.1 Step 2/3 完成（README npx 引导 + npm publish --dry-run 验证通过）；Step 4 正式发布待独立时段执行_
_最近更新：2026-06-02 — Story 3.2 Step 2 完成（README 「拉取预构建 Docker 镜像」子章节 + `docker pull` / `docker run` / tag pin 示例）；Step 3 镜像实测待 PR 合并 / tag 推送后_
_最近更新：2026-06-02 — Story 3.2 Step 1 完成（`.github/workflows/docker.yml`，buildx + multi-tag + Docker Hub login + PR-only build）；Step 2/3 待 README 同步 + 镜像实测_
