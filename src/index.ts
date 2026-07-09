// src/index.ts - 入口文件

import { BenchmarkConfig, ModelConfig, EvaluationResult } from './types';
import { version as pkgVersion } from '../package.json';
import { Evaluator } from './core/evaluator';
import { Reporter, DIM_HEADERS, getDimCell, getDispatchTypeCell, getSubLabel } from './core/reporter';
import { LLMAdapter } from './adapters/adapter';
import { errorMessage } from './errors';
import { cliLog, cliError } from './cli/cli_log';
import { OpenAIAdapter } from './adapters/openai-adapter';
import { AnthropicAdapter } from './adapters/anthropic-adapter';
import { GLMAdapter } from './adapters/glm-adapter';
import { DeepSeekAdapter } from './adapters/deepseek-adapter';
import { QwenAdapter } from './adapters/qwen-adapter';
import { OllamaAdapter } from './adapters/ollama-adapter';
import * as fs from 'fs';
import { getAllDialogueBenchmarks } from './benchmarks/dialogue';
import { getAllCodeBenchmarks } from './benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from './benchmarks/function-calling';
import { getAllLongContextBenchmarks } from './benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from './benchmarks/multi-turn';

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
      cliLog(`llm-bench v${pkgVersion}`);
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

  cliLog('🚀 LLM Benchmark 开始...\n');

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

    // v0.5.0+ 外部基准路线图提示 (roadmap-only, PR 进度: type ✅ 2150d07 / dispatch 8/8 ✅
    // — 见下方 console.info 同步刷新, 沿 6af9f47 5-dim 默认值 lookup 集中 stale drift 模式).
    if (config._external_benchmarks_roadmap) {
      const enabled = Object.entries(config._external_benchmarks_roadmap)
        .filter(([_, v]) => v?.enabled)
        .map(([k]) => k);
      if (enabled.length > 0) {
        cliLog(`\n🧪 v0.5.0+ external benchmark roadmap detected: ${enabled.join(', ')} (PR progress: type ✅ 2150d07 / dispatch 8/8 真实化 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/long_context_cluster/process_aware_scoring, per src/core/evaluator.ts line 161) / 真连接 adapter 仍 partial — full PR 估 30-45min)`);
      }
    }

    cliLog('\n\n✅ 评测完成!\n');

    printSummary(results);

    const outputDir = config.output || './results';
    Reporter.saveReport(results, outputDir);
  } catch (error: unknown) {
    cliError('\n\n❌ 评测失败:', errorMessage(error));
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
  cliLog(`✅ 配置文件已创建: ${configPath}`);
  cliLog('请编辑配置文件添加你的模型 API Key');
  cliLog('\n支持的适配器类型:');
  cliLog('  - openai: OpenAI 兼容接口 (GPT-4, GPT-3.5 等)');
  cliLog('  - anthropic: Anthropic Claude (Claude 3 Haiku/Opus 等)');
  cliLog('  - glm: 智谱 GLM (GLM-4 等)');
  cliLog('  - deepseek: DeepSeek (deepseek-chat, deepseek-reasoner 推理回退)');
  cliLog('  - qwen: 通义千问 / DashScope (qwen-turbo/plus/max/qwen3-max)');
  cliLog('  - ollama: Ollama 本地模型 (llama3.2, qwen2.5, mistral 等)');
}

async function compareModels(args: string[]) {
  const modelPaths = args.filter((a) => !a.startsWith('--'));

  if (modelPaths.length < 2) {
    cliError('请至少提供两个模型配置文件进行对比');
    cliError('用法: llm-bench compare model1.json model2.json');
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

  cliLog(`🔄 对比评测 ${models.length} 个模型...\n`);

  const results = await evaluator.run();

  cliLog('\n✅ 对比完成!\n');
  printSummary(results);
}

function listBenchmarks() {
  // 06-29 02:04 cron: extract printBenchmarkSection helper to dedupe 5x
  // (console.log label) + (console.log count) + (groupBy category) + (for-of print)
  // pattern across dialogue / coding / function-calling / long-context / multi-turn
  // sections (each had byte-identical 4-statement body). Same category-grouping
  // semantics; groupBy<T>('category') works on every benchmark question type since
  // all 5 (BenchmarkQuestion / CodeBenchmarkQuestion / FunctionCallingQuestion /
  // LongContextQuestion / MultiTurnQuestion) declare `category: string`.
  // parallels 06-26 22:03 cron 5 as-any drops in same function (this round targets
  // the structural repetition, not the cast leak). 0 functional change.
  cliLog('\n📋 可用评测题:\n');
  printBenchmarkSection('对话能力评测', getAllDialogueBenchmarks());
  printBenchmarkSection('代码能力评测', getAllCodeBenchmarks());
  printBenchmarkSection('工具调用 (Function Calling) 评测', getAllFunctionCallingBenchmarks());
  printBenchmarkSection('长上下文理解评测', getAllLongContextBenchmarks());
  printBenchmarkSection('多轮对话一致性评测', getAllMultiTurnBenchmarks());
}

/**
 * Print one benchmark section: section header + total count + per-category
 * breakdown. Generic over any benchmark question type with `category: string`
 * (BenchmarkQuestion / CodeBenchmarkQuestion / FunctionCallingQuestion /
 * LongContextQuestion / MultiTurnQuestion all qualify). Replaces the 5x
 * duplicated 4-statement print pattern previously inlined in listBenchmarks().
 */
function printBenchmarkSection<T extends { category: string }>(
  label: string,
  benchmarks: T[],
): void {
  cliLog(`\n=== ${label} ===`);
  cliLog(`共 ${benchmarks.length} 题\n`);
  const byCategory = groupBy(benchmarks, 'category');
  for (const [category, questions] of Object.entries(byCategory)) {
    cliLog(`  [${category}] - ${questions.length} 题`);
  }
}

function printSummary(results: EvaluationResult[]) {
  // v0.4.0 起覆盖 5 维度：dialogue / coding 默认开启 (true)，
  // function_calling / long_context / multi_turn 可选 (默认 false，未启用时填 -)。
  // 统一从 src/core/reporter.ts 导入 DIM_HEADERS + getDimCell，与 Reporter 各报表入口
  // 共享同一份事实 (避免双处副本产生漂移, 06-20 cron refactor 之前的 bug)。

  cliLog('📊 评测结果:\n');

  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

  const header = ['| 排名 ', '| 模型 ', '| 总分 ', ...DIM_HEADERS.map((d) => `| ${d.cn} `), '|'];
  const sep = ['|------', '|------', '|------', ...DIM_HEADERS.map(() => '|------'), '|'];
  cliLog(header.join('|') + '|');
  cliLog(sep.join('|') + '|');

  sorted.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    // 07-04 01:33 cron (v0.6.0 step-v6.0-4 closure step4): printSummary model name
    // 附 (type=<dispatchType>) 副标 (5 fetcher payload dispatch_type 透传, parallels
    // reporter.ts L172-L176). 闭合第 4 处 getDispatchTypeCell call site (原 3 处 +
    // 本轮 printSummary 1 处), 修复 helper 引入但调用点未迁移的漏更 (6af9f47 同源).
    // 07-05 02:03 cron (v0.6.0 step-v6.0-5 closure step2, chain #7): subCell 副标 (parallels reporter.ts 3 sites).
    const dtCell = getDispatchTypeCell(result);
    const subCell = getSubLabel(result.scores?.find((s) => s != null && (typeof s.subset === 'string' && s.subset.length > 0 || typeof s.mode === 'string' && s.mode.length > 0 || Array.isArray(s.riskCategories) && s.riskCategories.some((c) => typeof c === 'string' && c.length > 0))));
    const modelLabel = `${result.modelName}${dtCell ?? ''}${subCell ?? ''}`;
    // 06-29 03:23 cron: printSummary 5-dim cell 走 getDimCell (display string),
    // parallels 06-20 cron getDimCell extraction. 闭合第 5 处 inline
    // `if (!dim || typeof dim.average !== 'number')` 副本 (printSummary 之前
    // 直接读 result.dimensions?.[d.key].average ?? '-', 现统一走 helper)。
    const cells = [medal, modelLabel, `**${result.totalScore}**`, ...DIM_HEADERS.map((d) => getDimCell(result.dimensions, d.key))];
    cliLog('| ' + cells.join(' | ') + ' |');
  });
}

function loadConfig(configPath: string): BenchmarkConfig {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: unknown) {
    cliError(`无法加载配置文件: ${configPath}`);
    cliError(`原因: ${errorMessage(error)}`);
    cliError('请先运行: llm-bench init');
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
  cliLog(`
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

main().catch((error: unknown) => {
  cliError('Fatal error:', errorMessage(error));
  process.exit(1);
});
