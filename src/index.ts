// src/index.ts - 入口文件

import { BenchmarkConfig, ModelConfig, EvaluationResult } from './types';
import { version as pkgVersion } from '../package.json';
import { Evaluator } from './core/evaluator';
import { Reporter, DIM_HEADERS, getDimCell } from './core/reporter';
import { LLMAdapter } from './adapters/adapter';
import { errorMessage } from './errors';
import { OpenAIAdapter } from './adapters/openai-adapter';
import { AnthropicAdapter } from './adapters/anthropic-adapter';
import { GLMAdapter } from './adapters/glm-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { OllamaAdapter } from './adapters/ollama-adapter';
import * as fs from 'fs';

/**
 * 创建适配器
 */
function createAdapter(type: string): LLMAdapter {
  switch (type.toLowerCase()) {
    case 'anthropic':
      return new AnthropicAdapter();
    case 'glm':
    case 'zhipu':
      return new GLMAdapter();
    case 'deepseek':
      return new DeepSeekAdapter();
    case 'qwen':
    case 'tongyi':
    case 'dashscope':
      return new QwenAdapter();
    case 'ollama':
    case 'local':
      return new OllamaAdapter();
    case 'openai':
    default:
      return new OpenAIAdapter();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case '--version':
    case '-v':
      // 文档承诺 (README 「方式 2: 全局安装」段) 必须可用
      console.log(`llm-bench v${pkgVersion}`);
      break;
    case 'run':
      await runBenchmark(args.slice(1));
      break;
    case 'init':
      initConfig();
      break;
    case 'compare':
      await compareModels(args.slice(1));
      break;
    case 'list':
      listBenchmarks();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

async function runBenchmark(args: string[]) {
  const configPath = getArgValue(args, '--config') || 'config.json';

  console.log('🚀 LLM Benchmark 开始...\n');

  const config = loadConfig(configPath);
  if (!config.models || config.models.length === 0) {
    throw new Error(`config.models 为空: 请在 ${configPath} 中至少配置 1 个 model (name + endpoint + apiKey + type + model 5 字段)`);
  }
  const adapter = createAdapter(config.models[0].type);

  let lastProgress = 0;
  const progressCallback = (progress: number) => {
    if (Math.floor(progress) > Math.floor(lastProgress)) {
      process.stdout.write(`\r进度: ${Math.floor(progress)}%`);
      lastProgress = progress;
    }
  };

  const evaluator = new Evaluator(config, adapter, progressCallback);

  try {
    const results = await evaluator.run();

    // v0.5.0+ 外部基准路线图提示 (roadmap-only, PR 进度: type ✅ / dispatch ⏳)
    if (config._external_benchmarks_roadmap) {
      const enabled = Object.entries(config._external_benchmarks_roadmap)
        .filter(([_, v]) => v?.enabled)
        .map(([k]) => k);
      if (enabled.length > 0) {
        console.info(`\n🧪 v0.5.0+ external benchmark roadmap detected: ${enabled.join(', ')} (PR progress: type ✅ 2150d07 / dispatch 8/8 真实化 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/long_context_cluster/process_aware_scoring, per src/core/evaluator.ts line 161) / 真连接 adapter 仍 partial — full PR 估 30-45min)`);
      }
    }

    console.log('\n\n✅ 评测完成!\n');

    printSummary(results);

    const outputDir = config.output || './results';
    Reporter.saveReport(results, outputDir);
  } catch (error: unknown) {
    console.error('\n\n❌ 评测失败:', errorMessage(error));
    process.exit(1);
  }
}

function initConfig() {
  const configPath = 'config.json';
  const config: BenchmarkConfig = {
    models: [
      {
        name: 'openai-model',
        endpoint: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || 'your-api-key',
        type: 'openai',
        model: 'gpt-3.5-turbo',
      },
      {
        name: 'anthropic-model',
        endpoint: 'https://api.anthropic.com',
        apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key',
        type: 'anthropic',
        model: 'claude-3-haiku-20240307',
      },
      {
        name: 'glm-model',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4',
        apiKey: process.env.GLM_API_KEY || 'your-api-key',
        type: 'glm',
        model: 'glm-4',
      },
    ],
    benchmarks: {
      dialogue: true,
      coding: true,
      function_calling: false,
      long_context: false,
      multi_turn: false,
    },
    output: './results',
    concurrency: 3,
    runs: 1,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ 配置文件已创建: ${configPath}`);
  console.log('请编辑配置文件添加你的模型 API Key');
  console.log('\n支持的适配器类型:');
  console.log('  - openai: OpenAI 兼容接口 (GPT-4, GPT-3.5 等)');
  console.log('  - anthropic: Anthropic Claude (Claude 3 Haiku/Opus 等)');
  console.log('  - glm: 智谱 GLM (GLM-4 等)');
  console.log('  - deepseek: DeepSeek (deepseek-chat, deepseek-reasoner 推理回退)');
  console.log('  - qwen: 通义千问 / DashScope (qwen-turbo/plus/max/qwen3-max)');
  console.log('  - ollama: Ollama 本地模型 (llama3.2, qwen2.5, mistral 等)');
}

async function compareModels(args: string[]) {
  const modelPaths = args.filter((a) => !a.startsWith('--'));

  if (modelPaths.length < 2) {
    console.error('请至少提供两个模型配置文件进行对比');
    console.error('用法: llm-bench compare model1.json model2.json');
    process.exit(1);
  }

  const models: ModelConfig[] = [];
  for (const modelPath of modelPaths) {
    const config = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    models.push(config);
  }

  const benchmarkConfig: BenchmarkConfig = {
    models: models,
    benchmarks: {
      dialogue: true,
      coding: true,
      function_calling: false,
      long_context: false,
      multi_turn: false,
    },
    output: './results',
  };

  if (models.length === 0) {
    throw new Error('compareModels: models 为空 (内部错误, 上方 modelPaths.length < 2 已 process.exit(1) 拦截)');
  }
  const adapter = createAdapter(models[0].type);
  const evaluator = new Evaluator(benchmarkConfig, adapter);

  console.log(`🔄 对比评测 ${models.length} 个模型...\n`);

  const results = await evaluator.run();

  console.log('\n✅ 对比完成!\n');
  printSummary(results);
}

function listBenchmarks() {
  const { getAllDialogueBenchmarks } = require('./benchmarks/dialogue');
  const { getAllCodeBenchmarks } = require('./benchmarks/coding');
  const { getAllFunctionCallingBenchmarks } = require('./benchmarks/function-calling');
  const { getAllLongContextBenchmarks } = require('./benchmarks/long-context');
  const { getAllMultiTurnBenchmarks } = require('./benchmarks/multi-turn');

// 06-26 22:03 cron: drop 5 redundant `as any[]` casts in listAvailableBenchmarks.
// Object.entries(Record<string, T[]>) returns [string, any][] per TS lib def, so
// `questions` is typed `any` after destructuring; `questions.length` is safe
// because groupBy always returns T[] values. This parallels 94783a7 (vscode
// 4 as-any drops) and a1e1c6b (hub 16 as-any drops). 0 functional change.
  console.log('\n📋 可用评测题:\n');

  console.log('=== 对话能力评测 ===');
  const dialogueBenchmarks = getAllDialogueBenchmarks();
  console.log(`共 ${dialogueBenchmarks.length} 题\n`);

  const dialogueByCategory = groupBy(dialogueBenchmarks, 'category');
  for (const [category, questions] of Object.entries(dialogueByCategory)) {
    console.log(`  [${category}] - ${questions.length} 题`);
  }

  console.log('\n=== 代码能力评测 ===');
  const codeBenchmarks = getAllCodeBenchmarks();
  console.log(`共 ${codeBenchmarks.length} 题\n`);

  const codeByCategory = groupBy(codeBenchmarks, 'category');
  for (const [category, questions] of Object.entries(codeByCategory)) {
    console.log(`  [${category}] - ${questions.length} 题`);
  }

  console.log('\n=== 工具调用 (Function Calling) 评测 ===');
  const fcBenchmarks = getAllFunctionCallingBenchmarks();
  console.log(`共 ${fcBenchmarks.length} 题\n`);

  const fcByCategory = groupBy(fcBenchmarks, 'category');
  for (const [category, questions] of Object.entries(fcByCategory)) {
    console.log(`  [${category}] - ${questions.length} 题`);
  }

  console.log('\n=== 长上下文理解评测 ===');
  const lcBenchmarks = getAllLongContextBenchmarks();
  console.log(`共 ${lcBenchmarks.length} 题\n`);

  const lcByCategory = groupBy(lcBenchmarks, 'category');
  for (const [category, questions] of Object.entries(lcByCategory)) {
    console.log(`  [${category}] - ${questions.length} 题`);
  }

  console.log('\n=== 多轮对话一致性评测 ===');
  const mtBenchmarks = getAllMultiTurnBenchmarks();
  console.log(`共 ${mtBenchmarks.length} 题\n`);

  const mtByCategory = groupBy(mtBenchmarks, 'category');
  for (const [category, questions] of Object.entries(mtByCategory)) {
    console.log(`  [${category}] - ${questions.length} 题`);
  }
}

function printSummary(results: EvaluationResult[]) {
  // v0.4.0 起覆盖 5 维度：dialogue / coding 默认开启 (true)，
  // function_calling / long_context / multi_turn 可选 (默认 false，未启用时填 -)。
  // 统一从 src/core/reporter.ts 导入 DIM_HEADERS + getDimCell，与 Reporter 各报表入口
  // 共享同一份事实 (避免双处副本产生漂移, 06-20 cron refactor 之前的 bug)。

  console.log('📊 评测结果:\n');

  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

  const header = ['| 排名 ', '| 模型 ', '| 总分 ', ...DIM_HEADERS.map((d) => `| ${d.cn} `), '|'];
  const sep = ['|------', '|------', '|------', ...DIM_HEADERS.map(() => '|------'), '|'];
  console.log(header.join('|') + '|');
  console.log(sep.join('|') + '|');

  sorted.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    const cells = [medal, result.modelName, `**${result.totalScore}**`, ...DIM_HEADERS.map((d) => getDimCell(result.dimensions, d.key))];
    console.log('| ' + cells.join(' | ') + ' |');
  });
}

function loadConfig(configPath: string): BenchmarkConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: unknown) {
    console.error(`无法加载配置文件: ${configPath}`);
    console.error('请先运行: llm-bench init');
    process.exit(1);
  }
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function groupBy<T>(array: T[], field: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = String(item[field]);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

function showHelp() {
  console.log(`
🎯 LLM Benchmark - 本地快速LLM评测工具

用法:
  llm-bench <command> [options]

命令:
  run --config <file>    运行评测
  init                   初始化配置文件
  compare <files...>     对比多个模型
  list                   列出可用评测题
  help                   显示帮助
  --version, -v          输出版本号

支持的模型类型:
  openai     OpenAI 兼容接口 (GPT-4, GPT-3.5, etc.)
  anthropic  Anthropic Claude (Claude 3 Haiku/Opus, etc.)
  glm        智谱 GLM (GLM-4, etc.)
  deepseek   DeepSeek (deepseek-chat, deepseek-reasoner)
  qwen       通义千问 / DashScope (qwen-turbo, qwen-plus, qwen-max, qwen3-max)
  ollama     Ollama 本地模型 (llama3.2, qwen2.5, mistral, codellama, deepseek-r1)

示例:
  # 初始化
  llm-bench init

  # 运行评测
  llm-bench run --config config.json

  # 对比两个模型
  llm-bench compare model-a.json model-b.json

配置示例 (config.json):
  {
    "models": [
      {
        "name": "gpt-4",
        "endpoint": "https://api.openai.com/v1",
        "apiKey": "sk-xxx",
        "type": "openai",
        "model": "gpt-4"
      },
      {
        "name": "claude-3",
        "endpoint": "https://api.anthropic.com",
        "apiKey": "sk-ant-xxx",
        "type": "anthropic",
        "model": "claude-3-haiku-20240307"
      },
      {
        "name": "deepseek-chat",
        "endpoint": "https://api.deepseek.com/v1",
        "apiKey": "sk-your-deepseek-key",
        "type": "deepseek",
        "model": "deepseek-chat"
      },
      {
        "name": "qwen-turbo",
        "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "apiKey": "sk-your-qwen-key",
        "type": "qwen",
        "model": "qwen-turbo"
      },
      {
        "name": "llama3-local",
        "endpoint": "http://localhost:11434/v1",
        "apiKey": "ollama",
        "type": "ollama",
        "model": "llama3.2"
      }
    ],
    "benchmarks": {
      "dialogue": true,
      "coding": true,
      "function_calling": false,
      "long_context": false,
      "multi_turn": false
    },
    "output": "./results"
  }
`);
}

export { runBenchmark, loadConfig };

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
