# LLM Benchmark - 本地快速LLM评测工具

🎯 本地快速LLM大模型智力评测，支持多平台、多模型统一比较。

## 特性

- 🌐 **多平台支持**: OpenAI 兼容接口（可扩展 Anthropic、GLM 等）
- 📊 **统一评测**: 通用对话 + 代码能力双维度
- ⚡ **快速执行**: 本地批量评测，无需云服务
- 📈 **可视化报告**: 表格、雷达图、柱状图对比
- 🔄 **多模型对比**: 同时评测多个模型并生成对比报告

## 安装

```bash
npm install -g llm-benchmark
```

或从源码安装：

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

### 通用对话能力
| 维度 | 描述 |
|------|------|
| 事实准确性 | 回答是否准确无误 |
| 指令遵循 | 是否按要求格式/方式回答 |
| 推理能力 | 逻辑推理、数学推理 |
| 上下文一致性 | 多轮对话上下文保持 |
| 安全性 | 有害/偏见内容的规避 |

### 代码能力
| 维度 | 描述 |
|------|------|
| 语法正确性 | 代码能否正常运行 |
| 逻辑正确性 | 输出结果是否正确 |
| 字符串处理 | 字符串操作能力 |
| 数组操作 | 数组/列表处理 |
| 算法 | 排序、搜索、递归等 |

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

## License

MIT
