# Changelog

All notable changes to llm-benchmark will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> 当前开发版本，等待下一批功能累积。本段为 placeholder，0.4.0 后所有 commit 均为 governance 文档（`SECURITY.md` / `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `ROADMAP.md` / `CHANGELOG.md`），无功能/接口变更。

## [0.4.0] - 2026-06-02

### Added

- **包重命名 + 公共发布配置**：`xingp14-llm-benchmark` → `@xingp14/llm-benchmark`，新增 `publishConfig.access: "public"`（已通过 `npm publish --dry-run` 验证：95 files / 46.7 kB）
- **GitHub Actions CI workflow**（Node 20 + lint + build + `npm test --bail`）
- **Docker Hub 自动构建 workflow**（`v*` tag 触发，构建 `xingp14/llm-benchmark` 镜像）
- **README 顶部徽章**：GitHub Actions / Docker Hub / npm version / License / Node
- **README 拉取预构建 Docker 镜像子章节**：`docker pull` / `docker run` / tag pin 完整示例
- **`npx @xingp14/llm-benchmark` 一键运行引导**
- **DeepSeek adapter**（`type: 'deepseek'`，OpenAI 兼容，含 `deepseek-chat` 默认 + `deepseek-reasoner` 推理回退）
- **通义千问 Qwen (DashScope) adapter**（`type: 'qwen' | 'tongyi' | 'dashscope'`，默认 `qwen-turbo`，支持 `qwen-plus` / `qwen-max` / `qwen3-max`）
- **Ollama 本地模型 adapter**（`type: 'ollama' | 'local'`，默认 `http://localhost:11434` + `llama3.2`，本地无需 API key）
- **工具调用 / Function Calling 评测维度**（5 题，Scorer.scoreFunctionCalling：name+args 100/70/40/0，CLI + Web + DB + API 全链路）
- **长上下文理解 / Long Context 评测维度**（3 题，需 32k+ context，Scorer.scoreLongContext 基于 keyFacts 命中比例，全链路）
- **多轮对话一致性 / Multi-Turn 评测维度**（3 题，Scorer.scoreMultiTurn 基于 required/forbidden 短语一致性校验，全链路）

## [0.3.0] - 2026-05-23

### Added

- **Web UI**（Express + WebSocket 实时进度）
- **SQLite 数据库层**（configs / evaluations / results）
- **JWT 认证**
- **Docker / docker-compose 一键部署**

### Fixed

- **评分系统 3 个 bug**（详见 commit history）
- **56 个 failing tests**（SQLite race + 覆盖率）

## [0.2.0] - 2026-05-23

### Added

- **Anthropic Claude 适配器**
- **智谱 GLM 适配器**
- **Python 沙盒执行器**

## [0.1.0] - 2026-05-23

### Added

- 🎉 **首次发布**
- ✅ **OpenAI 兼容接口支持**
- ✅ **对话能力评测**（13 题）
- ✅ **代码能力评测**（11 题）
- ✅ **评测报告生成**

[Unreleased]: https://github.com/XingP14/llm-benchmark/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/XingP14/llm-benchmark/releases/tag/v0.4.0
[0.3.0]: https://github.com/XingP14/llm-benchmark/releases/tag/v0.3.0
[0.2.0]: https://github.com/XingP14/llm-benchmark/releases/tag/v0.2.0
[0.1.0]: https://github.com/XingP14/llm-benchmark/releases/tag/v0.1.0
