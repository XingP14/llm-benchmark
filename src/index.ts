// src/index.ts - 入口文件

import { BenchmarkConfig, ModelConfig } from './types';
import { Evaluator } from './core/evaluator';
import { Reporter } from './core/reporter';
import { LLMAdapter } from './adapters/adapter';
import { OpenAIAdapter } from './adapters/openai-adapter';
import { AnthropicAdapter } from './adapters/anthropic-adapter';
import { GLMAdapter } from './adapters/glm-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
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
    case 'openai':
    default:
      return new OpenAIAdapter();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
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

    console.log('\n\n✅ 评测完成!\n');

    printSummary(results);

    const outputDir = config.output || './results';
    Reporter.saveReport(results, outputDir);
  } catch (error) {
    console.error('\n\n❌ 评测失败:', (error as Error).message);
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
    },
    output: './results',
    concurrency: 3,
    runs: 1,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ 配置文件已创建: ${configPath}`);
  console.log('请编辑配置文件添加你的模型 API Key');
  console.log('\n支持的适配器类型:');
  console.log('  - openai: OpenAI 兼容接口');
  console.log('  - anthropic: Anthropic Claude');
  console.log('  - glm: 智谱 GLM');
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
    },
    output: './results',
  };

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

  console.log('\n📋 可用评测题:\n');

  console.log('=== 对话能力评测 ===');
  const dialogueBenchmarks = getAllDialogueBenchmarks();
  console.log(`共 ${dialogueBenchmarks.length} 题\n`);

  const dialogueByCategory = groupBy(dialogueBenchmarks, 'category');
  for (const [category, questions] of Object.entries(dialogueByCategory)) {
    console.log(`  [${category}] - ${(questions as any[]).length} 题`);
  }

  console.log('\n=== 代码能力评测 ===');
  const codeBenchmarks = getAllCodeBenchmarks();
  console.log(`共 ${codeBenchmarks.length} 题\n`);

  const codeByCategory = groupBy(codeBenchmarks, 'category');
  for (const [category, questions] of Object.entries(codeByCategory)) {
    console.log(`  [${category}] - ${(questions as any[]).length} 题`);
  }
}

function printSummary(results: any[]) {
  console.log('📊 评测结果:\n');

  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

  console.log('| 排名 | 模型 | 总分 | 对话 | 代码 |');
  console.log('|------|------|------|------|------|');

  sorted.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    console.log(
      `| ${medal} | ${result.modelName} | **${result.totalScore}** | ${result.dimensions.dialogue.average} | ${result.dimensions.coding.average} |`
    );
  });
}

function loadConfig(configPath: string): BenchmarkConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
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

支持的模型类型:
  openai    OpenAI 兼容接口 (GPT-4, GPT-3.5, etc.)
  anthropic Anthropic Claude (Claude 3, etc.)
  glm       智谱 GLM (GLM-4, etc.)

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
      }
    ],
    "benchmarks": {
      "dialogue": true,
      "coding": true
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
