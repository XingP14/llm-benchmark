# LLM Benchmark - 本地快速LLM评测工具

🎯 本地快速LLM大模型智力评测，支持多平台、多模型统一比较。

[![npm version](https://img.shields.io/npm/v/@xingp14/llm-benchmark.svg)](https://www.npmjs.com/package/@xingp14/llm-benchmark)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## 特性

- 🌐 **多平台支持**: OpenAI / Anthropic Claude / 智谱 GLM
- 📊 **统一评测**: 通用对话 + 代码能力双维度
- ⚡ **快速执行**: 本地批量评测，无需云服务
- 📈 **可视化报告**: 表格、雷达图、柱状图对比
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

## 支持的模型

| 平台 | 类型 | 示例模型 |
|------|------|----------|
| OpenAI | `openai` | GPT-4, GPT-3.5-turbo |
| Anthropic | `anthropic` | Claude 3 Haiku, Claude 3 Opus |
| 智谱 | `glm` | GLM-4, GLM-3-Turbo |
| 其他 | `openai` | 任何 OpenAI 兼容接口 |

## 配置文件

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

## 评测维度

### 通用对话能力 (12题)
| 维度 | 描述 | 权重 |
|------|------|------|
| factual_accuracy | 事实准确性 | 1.0 |
| instruction_following | 指令遵循 | 1.5 |
| reasoning | 推理能力 | 2.0 |
| context_awareness | 上下文一致性 | 1.5 |
| safety | 安全性 | 2.0 |

### 代码能力 (10题)
| 维度 | 描述 | 权重 |
|------|------|------|
| syntax | 语法正确性 | 1.0 |
| string_processing | 字符串处理 | 1.5 |
| array_operations | 数组操作 | 1.5 |
| algorithms | 算法 | 2.0 |
| data_structures | 数据结构 | 1.5 |

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

# 构建
npm run build
```

## 版本历史

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
- ✅ 对话能力评测 (12题)
- ✅ 代码能力评测 (10题)
- ✅ 评测报告生成

## License

MIT
