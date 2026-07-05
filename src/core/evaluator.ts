// src/core/evaluator.ts - 评测引擎

import {
  BenchmarkConfig,
  BenchmarkQuestion,
  EvaluationResult,
  DimensionScore,
  QuestionScore,
  ModelConfig,
} from '../types';
import { LLMAdapter } from '../adapters/adapter';
import { Scorer } from './scorer';
import { getAllDialogueBenchmarks } from '../benchmarks/dialogue';
import { errorMessage } from '../errors';
import { getAllCodeBenchmarks, CodeBenchmarkQuestion } from '../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../benchmarks/long-context';
import { getAllMultiTurnBenchmarks, MultiTurnQuestion } from '../benchmarks/multi-turn';

/**
 * 运行时日志 helper — 沿 src/core/reporter.ts logReport + src/web/websocket.ts log +
 * src/web/engine/evaluator.ts logEvaluationError 模式; NODE_ENV=test 或 JEST_WORKER_ID 存在时
 * 静默, 避免 test runner 输出噪音。047e952 fix(test): quiet runtime logs in test runs
 * 已迁移 reporter.ts + websocket.ts, src/core/evaluator.ts 漏更 (本轮收尾)。
 */
const shouldLog = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
const log = (...args: unknown[]): void => {
  if (shouldLog) console.log(...args);
};
const logWarn = (...args: unknown[]): void => {
  if (shouldLog) console.warn(...args);
};
const logError = (...args: unknown[]): void => {
  if (shouldLog) console.error(...args);
};
const logInfo = (...args: unknown[]): void => {
  if (shouldLog) console.info(...args);
};


/**
 * v0.6.0 step-v6.0-7 helper: 5 fetcher dispatchType literal default lookup (chain #8 helper-extraction pattern,
 * 沿 6d71bef dispatch_helper cfg.type + 7265ec0 reporter dispatchType 副标 + woclaw 06-04~07-04 跨 12 chains
 * per-prefix helper 集中模式). 11 sites 之前分散在 evaluator.ts: 5 closure inline `tb.type ?? 'agentic_coding'`
 * (L253/268/283/306/322) + 5 default parameter `dispatchType: string = 'agentic_coding'` 等 (L603/698/803/913/1026)
 * + 1 dead-code fallback in dispatchV050External helper L1328 `cfg?.type ?? "agentic_coding"`. 现 11 sites 全部
 * 走 DEFAULT_DISPATCH_TYPE lookup + defaultDispatchType() helper: 加 1 项 v0.6 real fetch 只需在
 * DEFAULT_DISPATCH_TYPE 加 1 entry, 不再分散修改 2-3 处 inline.
 */
export const DEFAULT_DISPATCH_TYPE: Record<string, string> = {
  terminal_bench: 'agentic_coding',
  benchlm_agentic: 'agentic_fullstack',
  swe_bench_pro: 'agentic_swe',
  process_aware_scoring: 'process_agentic',
  long_context_cluster: 'long_context_retrieval',
  cyberseceval3: 'safety_evaluation',
  aa_omniscience: 'long_context_retrieval',
  webdev_arena: 'agentic_coding',
};

export function defaultDispatchType(benchmarkName: string): string {
  return DEFAULT_DISPATCH_TYPE[benchmarkName] ?? 'agentic_coding';
}

/**
 * v0.6.0 step-v6.0-8 helper: 8 enabled.push log-line 集中 helper-extraction (chain #9 log-string-template,
 * 沿 62cd762 chain #8 defaultDispatchType + 6af9f47 5-dim console.error 默认值 lookup 集中模式).
 * 8 sites 之前分散在 evaluator.ts run() 内 enabled.push 段: 每个 fetcher 都输出
 * `<name>(type=<ext.type ?? '<default-literal>'>, api_base=<ext.api_base ?? '(unset)'>,
 * model_id=<ext.model_id ?? '(unset)'>[, <key-specific>]')`. 差异仅 benchmarkName + 默认
 * type 字面量 + key-specific 附段 (subset / anchor / mode / weights / tasks / risk_categories /
 * native_evals / agentic_mode / timeout_ms). 现 8 sites 全部走 logExternalBenchmarkEnabled helper:
 * 加 1 项 v0.6 real fetch 只需在 DEFAULT_LOG_FORMAT 加 1 entry + helper 内部 switch 加 1 case
 * (若该 fetcher 有 key-specific 字段), 不再分散修改 8 处 inline 模板.
 *
 * 设计: helper 接受 raw cfg 对象 (e.g. ext.webdev_arena), 不需要预定义 TypeScript interface,
 * 沿 chain #8 defaultDispatchType(benchmarkName: string): string 同模式 (helper-only, 无 fetcher
 * signature 改动). ext 缺字段 (type/api_base/model_id) 走 DEFAULT_LOG_FORMAT lookup + '(unset)' 兜底.
 */
export const DEFAULT_LOG_FORMAT: Record<string, string> = {
  terminal_bench: 'agentic_coding',
  benchlm_agentic: 'agentic_fullstack',
  swe_bench_pro: 'agentic_swe',
  process_aware_scoring: 'process_agentic',
  long_context_cluster: 'long_context_retrieval',
  cyberseceval3: 'safety_evaluation',
  aa_omniscience: 'long_context_retrieval',
  webdev_arena: 'agentic_coding',
};
/**
 * v0.6.0 step-v6.0-10 helper: subset default literal 集中 helper-extraction
 * (chain #11 default-value-per-key, 沿 62cd762 chain #8 defaultDispatchType +
 * 443b05d chain #9 DEFAULT_LOG_FORMAT + 9578326 chain #10 dispatchExternalBenchmark +
 * 6af9f47 5-dim console.error 默认值 lookup 集中模式).
 *
 * 之前 `subset` 默认字面量 lookup 在 5 fetcher 闭包 (L350/364/378/395/415) +
 * 5 helper 内部 switch case (L100/111/123/131/139) 共 10 sites 散落. 5 fetcher
 * 各有自己的 default subset literal: terminal_bench='full', benchlm_agentic='all',
 * swe_bench_pro='verified', process_aware_scoring='all_process_signals',
 * long_context_cluster='all'. 10 sites 全部表达「this benchmark → its default
 * subset literal」同源关系, 散落两处 (closure + helper) 易漂移 (e.g. 加 1 项 v0.6+
 * real fetch 需同步修改 2 处才能保持 subset default lookup 集中).
 *
 * 现 10 sites 全部走 defaultSubset(benchmarkName) helper: 加 1 项 v0.6+ real fetch
 * 只需在 DEFAULT_SUBSET 加 1 entry (单点), closure 端与 helper 端 lookup 字面量
 * 自动同步 (helper 端通过 benchmarkName 索引 DEFAULT_SUBSET, closure 端通过 cfg.subset
 * ?? defaultSubset(name) 兜底). 与 chain #8/9/10 同 helper-only 模式 (无 fetcher
 * signature 改动, 接受 raw cfg 对象).
 */
export const DEFAULT_SUBSET: Record<string, string> = {
  terminal_bench: 'full',
  benchlm_agentic: 'all',
  swe_bench_pro: 'verified',
  process_aware_scoring: 'all_process_signals',
  long_context_cluster: 'all',
};

export function defaultSubset(benchmarkName: string): string {
  return DEFAULT_SUBSET[benchmarkName] ?? 'all';
}


export function logExternalBenchmarkEnabled(benchmarkName: string, ext: any): string {
  const t = ext?.type ?? DEFAULT_LOG_FORMAT[benchmarkName] ?? 'agentic_coding';
  const api = ext?.api_base ?? '(unset)';
  const model = ext?.model_id ?? '(unset)';
  const base = `${benchmarkName}(type=${t}, api_base=${api}, model_id=${model}`;
  // key-specific 附段 (parallels 原 inline enabled.push 8 sites 的 6 项 key-specific 字段)
  let suffix = '';
  switch (benchmarkName) {
    case 'terminal_bench': {
      const subset = ext?.subset ?? defaultSubset('terminal_bench');
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `, subset=${subset}${anchor}`;
      break;
    }
    case 'aa_omniscience': {
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `${anchor}`;
      break;
    }
    case 'benchlm_agentic': {
      const subset = ext?.subset ?? defaultSubset('benchlm_agentic');
      const native = ext?.native_evals || subset === 'native_evals_only' ? ' + Native Evals' : '';
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `, subset=${subset}${anchor}${native}`;
      break;
    }
    case 'cyberseceval3': {
      const cats = ext?.risk_categories?.join('|') ?? 'all-8';
      suffix = `, risk_categories=${cats}`;
      break;
    }
    case 'swe_bench_pro': {
      const subset = ext?.subset ?? defaultSubset('swe_bench_pro');
      const agentic = ext?.agentic_mode === false ? ' (non-agentic)' : '';
      const timeout = ext?.timeout_ms != null ? `, timeout=${ext.timeout_ms}ms` : '';
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `, subset=${subset}${agentic}${timeout}${anchor}`;
      break;
    }
    case 'long_context_cluster': {
      const subset = ext?.subset ?? defaultSubset('long_context_cluster');
      const tasks = ext?.tasks_total ?? 62;
      const timeout = ext?.timeout_ms != null ? `, timeout=${ext.timeout_ms}ms` : '';
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `, subset=${subset}, tasks=${tasks}${timeout}${anchor}`;
      break;
    }
    case 'process_aware_scoring': {
      const subset = ext?.subset ?? defaultSubset('process_aware_scoring');
      const mode = ext?.mode ?? 'all';
      const bench = ext?.agentic_benchmark ?? 'swe_bench_pro';
      const passWeight = ext?.pass_fail_weight ?? 0.7;
      const procWeight = ext?.process_weight ?? 0.3;
      const anchor = ext?.anchor_score != null ? `, anchor=${ext.anchor_score}` : '';
      suffix = `, subset=${subset}, mode=${mode}, agentic_benchmark=${bench}, weights=${passWeight}/${procWeight}${anchor}`;
      break;
    }
    default:
      // 未识别 benchmark (后续 v0.6+ 新增 fetcher 走 default 路径, 仅 base 段)
      break;
  }
  return `${base}${suffix})`;
}

/**
 * 评测引擎 - 协调整个评测流程
 */
export class Evaluator {
  private config: BenchmarkConfig;
  private adapter: LLMAdapter;
  private progressCallback?: (progress: number) => void;

  constructor(
    config: BenchmarkConfig,
    adapter: LLMAdapter,
    progressCallback?: (progress: number) => void
  ) {
    this.config = config;
    this.adapter = adapter;
    this.progressCallback = progressCallback;
  }

  /**
   * 运行评测 - 所有模型并行执行
   *
   * ⚠️ **Harness drift caveat**: 本分数基于 11 题 5 维度自研 harness
   *   (dialogue=3 / coding=2 / function_calling=2 / long_context=2 / multi_turn=2),
   *   同一模型在 lm-evaluation-harness / LiveBench / BenchLM.ai / Vals AI
   *   不同 harness 下可能差 ±10-20 分 (例: Opus 4.8 在 Vals AI SWE-bench
   *   Verified 88.60% vs BenchLM.ai SWE-bench Pro 69.2% = 19.4 分差)。
   *   跨平台对比请用 confidence interval 三角验证, 不要把单 harness 排名当绝对真理。
   *   详见 README 「路线图 / Roadmap (v0.5.0 candidates)」表
   *   "SWE-bench 三源 cross-validation (2026-06)" 段。
   *
   * 📊 **Confidence interval**: 当前 v0.4.0 输出为 mean, 未输出 std / 95% CI;
   *   function_calling / multi_turn / long_context 维度仅 2 题, std 较大,
   *   决策前建议至少跑 3 轮取均值 (3-run mean ± std)。
   *   v0.5.0 真完整 PR (估 30-45min, 跨 6-9 轮 cron 累进)
   *   可加 "bootstrap 95% CI" 真输出到 JSON / CSV 报告。
   *
   * 🔗 **Cross-validation**: 与以下 2026 主流 harness 三角交叉
   *   - LiveBench (https://livebench.ai, frequently-updated 抗污染)
   *   - BenchLM.ai (https://benchlm.ai, 248 models × 225 benchmarks, agentic 主战场)
   *   - Vals AI (https://vals.ai/benchmarks/swebench, 06 月最新 SWE-bench Verified)
   *   - lm-evaluation-harness v0.4.0 (2026-04, config-based + Jinja2 prompt + MPS)
   *   - swebench.com 官方 leaderboard (2026-02-19 更新)
   *   跨 harness 决策前务必查 3 源, 避免 harness-multiplier effect 误判。
   *
   * 📋 **Harness v0.4.0 compatibility** (2026-06-17 22:03 cron, type 段 40→42
   *   `lm_eval_harness_v0_4_0` 锚定): 2026-05-12 EleutherAI/lm-evaluation-harness
   *   v0.4.0 正式发布 (https://github.com/EleutherAI/lm-evaluation-harness), 关键
   *   范式重定义 — (a) **「Config-based task creation and configuration」** YAML
   *   config 即可定义新 task, 无需写 Python src; (b) **「Support for Jinja2 prompt
   *   design」** 模板化 prompt + Promptsource 互导; (c) **「Speedups and new modeling
   *   libraries supported」** HF + vLLM + MPS (Apple Silicon) + GPT-NeoX 4 backend;
   *   配合 06-13 `lm_eval_harness_v4_config` (config YAML 加载 stub) 形成「harness
   *   release 锚定 + 任务 config 加载」双件套; 用户用 v0.4.0 YAML config 可评
   *   60+ 学术基准 (ARC / HellaSwag / MMLU / TruthfulQA / Winogrande / GSM8k /
   *   MMLU-Pro / GPQA / BBH / HumanEval / MBPP / DROP / IFEval / LCB / SWE-Bench
   *   等); 当前仅在 `_external_benchmarks_roadmap.lm_eval_harness_v0_4_0` 字段
   *   下生效 (5min cron 不调真实 harness v0.4.0 endpoint, 仅占位)。
   *
   * ⚠️ **Task conflict resolver** (2026-06-17 22:03 cron, type 段 40→42
   *   `lm_eval_task_conflict_resolver` 锚定): 跨学术基准评测实战痛点
   *   (CSDN 2026-03-30 「彻底解决 lm-evaluation-harness 任务冲突: 权威依赖管理
   *   终极指南」 https://blog.csdn.net/gitblog_00173/article/details/151881638)
   *   — 「acpbench 任务和 math 任务可能需要不同版本的某些库 (如 numpy 1.x vs
   *   numpy 2.x), 从而导致冲突」; [dependency-groups] 段已知冲突组合自动检测 +
   *   numpy / torch / datasets / transformers 跨 version resolver, 跑前
   *   dry-run 验证 (3 模式 dry_run / auto_resolve / report_only); 用户跑
   *   `lm-eval --tasks acpbench,math,gsm8k` 时, acpbench 依赖 numpy 1.x + math
   *   依赖 numpy 2.x 会冲突, llm-benchmark dispatch 应当检测 + 报告 + 跳过; 60+
   *   学术基准跨 task conflict 自动化 resolver = 2026 H2 跨 vendor model 选型
   *   基础设施; 当前仅在 `_external_benchmarks_roadmap.lm_eval_task_conflict_resolver`
   *   字段下生效 (5min cron 不调真实 resolver endpoint, 仅占位)。
   *
   * 参考:
   *   - DigitalApplied "LLM Benchmark Methodology 2026: Reading Leaderboards"
   *     https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide
   */
  async run(): Promise<EvaluationResult[]> {
    log(`\n开始并行评测 ${this.config.models.length} 个模型...`);

    // v0.5.0+ 外部基准 dispatch 路由入口 (沿 06-09 23:03 ROADMAP 段从示例到实现)
    // PR 进度 (2026-06-16 01:03): type 段 ✅ 全 18 项 / dispatch ✅ 8 项 (8/8 real fetch — 早期 dispatcher skeleton 框架已全部替换为真实 fetch 实现, 沿 webdev_arena 06-14 03:23 cron + cyberseceval3 06-14 22:23 cron + aa_omniscience 06-15 00:03 cron + terminal_bench 06-15 03:03 cron + benchlm_agentic 06-15 04:03 cron + swe_bench_pro 06-15 05:23 cron + process_aware_scoring 06-15 06:43 cron + **long_context_cluster 06-16 01:03 cron**, 沿 webdev_arena 模式 POST + timeout/4xx/5xx 三段 try/catch + scores[] 注入, 8/8 真实化) / web 钩子点 JSDoc ✅ (06-12 01:03) / **v0.5.0 dispatch PR 完整 (8/8)** — 下一里程碑 v0.6.0
    // 完整 PR 在后续 cron 轮次累进: 各平台 fetch + adapter + 评分聚合
    // 真实 fetch 段在 line ~187+ (webdev_arena) / ~215+ (cyberseceval3) / ... 通过 await Promise.all(results.map(...)) 调度,
    // 早期规划的 webdevArenaFetchTasks 骨架数组已废弃 (06-20 05:43 cron 修 lint, @typescript-eslint/no-unused-vars)
    if (this.config._external_benchmarks_roadmap) {
      const ext = this.config._external_benchmarks_roadmap;
      const enabled: string[] = [];
      if (ext.webdev_arena?.enabled) {
        // v0.5.0 type 段真实化 (06-30 06:13 cron step-7): surface agentic_coding category for 8/8 parity with 5-dim step-6
        enabled.push(logExternalBenchmarkEnabled('webdev_arena', ext.webdev_arena));
      }
      if (ext.terminal_bench?.enabled) {
        // v0.5.0 type 段真实化 (06-28 cron): surface the dispatch category label
        // declared in src/types/index.ts so downstream log parsing can group
        // benchmarks by type (agentic_coding / agentic_fullstack / ...).
        // v0.6.0 chain #9: subset/anchor 内化到 logExternalBenchmarkEnabled helper
        enabled.push(logExternalBenchmarkEnabled('terminal_bench', ext.terminal_bench));
      }
      if (ext.aa_omniscience?.enabled) {
        // v0.5.0 type 段真实化 (06-30 06:13 cron step-7): surface long_context_retrieval category for 8/8 parity
        // v0.6.0 chain #9: anchor 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('aa_omniscience', ext.aa_omniscience));
      }
      // v0.5.0 dispatch (real fetch 06-15 04:03 cron): BenchLM.ai agentic eval (2026-06-07 发布, 248 模型 × 225 基准, agentic 主战场)
      if (ext.benchlm_agentic?.enabled) {
        // v0.5.0 type 段真实化: surface agentic_fullstack category.
        // v0.6.0 chain #9: subset/native/anchor 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('benchlm_agentic', ext.benchlm_agentic));
      }
      // v0.5.0 dispatch (real fetch 06-14 22:23 cron): Meta CyberSecEval 3 (2025-12 发布, 8 项风险跨 offensive security 3 大类, Claude Mythos 5 主战场)
      if (ext.cyberseceval3?.enabled) {
        // v0.5.0 type 段真实化 (06-30 06:13 cron step-7): surface safety_evaluation category for 8/8 parity
        // v0.6.0 chain #9: risk_categories 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('cyberseceval3', ext.cyberseceval3));
      }
      // v0.5.0 dispatch (real fetch 06-15 05:23 cron): SWE-bench Pro (Scale AI, 2026-06-02, Mythos-tier 主标杆, 80.3% Fable-5)
      if (ext.swe_bench_pro?.enabled) {
        // v0.5.0 type 段真实化: surface agentic_swe category.
        // v0.6.0 chain #9: subset/agentic/timeout/anchor 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('swe_bench_pro', ext.swe_bench_pro));
      }
      // v0.5.0 dispatch: long_context_cluster real fetch (06-16 01:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/long_context_cluster/v1)
      if (ext.long_context_cluster?.enabled) {
        // v0.5.0 type 段真实化: surface long_context_retrieval category.
        // v0.6.0 chain #9: subset/tasks/timeout/anchor 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('long_context_cluster', ext.long_context_cluster));
      }
      // v0.5.0 dispatch (real fetch 06-15 06:43 cron): process_aware_scoring (2026-06-13 22:13 立项 — Princeton SWE-Bench Pro 03-04 + Anthropic 06 「2026 Agent 元年」18 页报告)
      // 评测方法论从「结果分数」转「过程+结果」双轨: 5 过程信号 (commit_count / test_run_count / retry_count / file_coverage / trajectory_score) + pass/fail 双权重
      if (ext.process_aware_scoring?.enabled) {
        // v0.5.0 type 段真实化: surface process_agentic category.
        // v0.6.0 chain #9: subset/mode/agentic_benchmark/weights/anchor 内化到 helper
        enabled.push(logExternalBenchmarkEnabled('process_aware_scoring', ext.process_aware_scoring));
      }
      // v0.5.0 model_id routing hint (2026-06-11): Mythos-class 模型 `claude-fable-5` (Anthropic GA, 2026-06-09)
      // 已知默认走 cyberseceval3 (suite=both) → LiveCodeBench/Terminal-Bench 路径; 也可显式配 `model_id: 'claude-fable-5'`
      // 见 README 「路线图 / Roadmap (v0.5.0 candidates)」表 Mythos-class 模型接入 段
      if (enabled.length > 0) {
        logInfo(`[v0.5.0 dispatch] external benchmarks enabled: ${enabled.join('; ')} (全部 8 项 real fetch per 06-16 01:03 cron — webdev_arena + cyberseceval3 + aa_omniscience + terminal_bench + benchlm_agentic + swe_bench_pro + process_aware_scoring + long_context_cluster, **v0.5.0 dispatch PR 完整 8/8**)`);
      }
    }

    const results = await Promise.all(
      this.config.models.map((model, i) => {
        log(`\n启动评测: ${model.name}`);
        return this.evaluateModel(model, i);
      })
    );

    // v0.5.0 dispatch: webdev_arena real fetch (06-14 03:23 cron, logInfo stub → POST https://webdevarena.com/api/v1/eval)
    // - 仅当 ext.webdev_arena.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 webdev_arena QuestionScore (questionId=`webdev_arena_${model.name}`, category=`webdev_arena`, dimension=`coding` 走 v0.4.0 默认, score = elo_score * 0.9 + pass_rate * 10 归一到 0-100)
    await this.dispatchExternalBenchmark(
      results, 'webdev_arena',
      'https://webdevarena.com/api/v1/eval',
      (apiBase, model, timeoutMs) => this.fetchWebdevArenaScore(apiBase, model, timeoutMs, this.config._external_benchmarks_roadmap!.webdev_arena!.anchor_score),
    );

    // v0.5.0 dispatch: cyberseceval3 real fetch (06-14 22:23 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/cyberseceval3/v3)
    // - 仅当 ext.cyberseceval3.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 cyberseceval3 QuestionScore (questionId=`cyberseceval3_${model.name}`, category=`cyberseceval3`, dimension=`safety` 走 v0.4.0 默认, score = safety_score * 0.7 + coverage_rate * 30 归一到 0-100)
    // - 注: CyberSecEval3 官方 (Meta, 2025-12 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Meta 真实 API
    await this.dispatchExternalBenchmark(
      results, 'cyberseceval3',
      'https://llm-benchmark.local/api/v1/cyberseceval3/v3',
      (apiBase, model, timeoutMs) => {
        const cse3 = this.config._external_benchmarks_roadmap!.cyberseceval3!;
        const cats = cse3.risk_categories?.join(',') ?? 'all-8';
        return this.fetchCyberseceval3Score(apiBase, model, timeoutMs, cats);
      },
    );

    // v0.5.0 dispatch: aa_omniscience real fetch (06-15 00:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/aa_omniscience/v1)
    // - 仅当 ext.aa_omniscience.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 aa_omniscience QuestionScore (questionId=`aa_omniscience_${model.name}`, category=`aa_omniscience`, dimension=`long_context` 走 v0.4.0 默认, score = accuracy_score * 0.7 + (1 - hallucination_rate) * 30 归一到 0-100)
    // - 注: Artificial Analysis Omniscience (2026-05-25 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 AA 真实 API
    await this.dispatchExternalBenchmark(
      results, 'aa_omniscience',
      'https://llm-benchmark.local/api/v1/aa_omniscience/v1',
      (apiBase, model, timeoutMs) => this.fetchAAOmniscienceScore(apiBase, model, timeoutMs, this.config._external_benchmarks_roadmap!.aa_omniscience!.anchor_score),
    );

    // v0.5.0 dispatch: terminal_bench real fetch (06-15 03:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/terminal_bench/v2)
    // - 仅当 ext.terminal_bench.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 terminal_bench QuestionScore (questionId=`terminal_bench_${model.name}`, category=`terminal_bench`, dimension=`coding` 走 v0.4.0 默认, score = task_pass_rate * 70 + (1 - avg_duration_s/3600) * 30 归一到 0-100)
    // - 注: Terminal-Bench 2.0 (tbench.ai, 2026-06 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 tbench.ai 真实 API
    await this.dispatchExternalBenchmark(
      results, 'terminal_bench',
      'https://llm-benchmark.local/api/v1/terminal_bench/v2',
      (apiBase, model, timeoutMs) => {
        const tb = this.config._external_benchmarks_roadmap!.terminal_bench!;
        return this.fetchTerminalBenchScore(apiBase, model, timeoutMs, tb.anchor_score, tb.subset ?? defaultSubset('terminal_bench'), tb.type ?? defaultDispatchType('terminal_bench'));
      },
    );

    // v0.5.0 dispatch: benchlm_agentic real fetch (06-15 04:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/benchlm_agentic/v1)
    // - 仅当 ext.benchlm_agentic.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 benchlm_agentic QuestionScore (questionId=`benchlm_agentic_${model.name}`, category=`benchlm_agentic`, dimension=`coding` 走 v0.4.0 默认, score = agentic_pass_rate * 50 + design2code_score * 0.25 + vision2web_score * 0.25 归一到 0-100; native_evals 启用时附加 +5 奖励)
    // - 注: BenchLM.ai (benchlm.ai, 2026-06-07 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 BenchLM.ai 真实 API
    await this.dispatchExternalBenchmark(
      results, 'benchlm_agentic',
      'https://llm-benchmark.local/api/v1/benchlm_agentic/v1',
      (apiBase, model, timeoutMs) => {
        const bla = this.config._external_benchmarks_roadmap!.benchlm_agentic!;
        return this.fetchBenchlmAgenticScore(apiBase, model, timeoutMs, bla.anchor_score, bla.native_evals ?? false, bla.subset ?? defaultSubset('benchlm_agentic'), bla.type ?? defaultDispatchType('benchlm_agentic'));
      },
    );

    // v0.5.0 dispatch: swe_bench_pro real fetch (06-15 05:23 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/swe_bench_pro/v1)
    // - 仅当 ext.swe_bench_pro.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 swe_bench_pro QuestionScore (questionId=`swe_bench_pro_${model.name}`, category=`swe_bench_pro`, dimension=`coding` 走 v0.4.0 默认, score = pass_rate * 0.7 + patch_score * 0.2 + files_modified_normalized * 0.1 归一到 0-100; agentic_mode 关闭时纯 pass_rate)
    // - 注: SWE-bench Pro (Scale AI, 2026-06-02, claude-fable-5 首条数据 80.3%) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Scale AI 真实 API
    await this.dispatchExternalBenchmark(
      results, 'swe_bench_pro',
      'https://llm-benchmark.local/api/v1/swe_bench_pro/v1',
      (apiBase, model, timeoutMs) => {
        const sbp = this.config._external_benchmarks_roadmap!.swe_bench_pro!;
        return this.fetchSweBenchProScore(apiBase, model, timeoutMs, sbp.anchor_score, sbp.subset ?? defaultSubset('swe_bench_pro'), sbp.agentic_mode !== false, sbp.type ?? defaultDispatchType('swe_bench_pro'));
      },
    );

    // v0.5.0 dispatch: process_aware_scoring real fetch (06-15 06:43 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/process_aware_scoring/v1)
    // - 仅当 ext.process_aware_scoring.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 process_aware_scoring QuestionScore (questionId=`process_aware_scoring_${model.name}`, category=`process_aware_scoring`, dimension=`coding` 走 v0.4.0 默认, score = process_score 0-100 (过程维度综合分) 复合 pass_fail_weight + process_weight)
    // - 注: Process-Aware Scoring (Princeton SWE-Bench Pro 03-04 trajectory + Anthropic 「2026 Agent 元年」18 页报告) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Princeton/Anthropic 真实 API
    await this.dispatchExternalBenchmark(
      results, 'process_aware_scoring',
      'https://llm-benchmark.local/api/v1/process_aware_scoring/v1',
      (apiBase, model, timeoutMs) => {
        const pas = this.config._external_benchmarks_roadmap!.process_aware_scoring!;
        return this.fetchProcessAwareScoringScore(
          apiBase, model, timeoutMs,
          pas.anchor_score,
          pas.subset ?? defaultSubset('process_aware_scoring'),
          pas.mode ?? 'all',
          pas.agentic_benchmark ?? 'swe_bench_pro',
          pas.pass_fail_weight ?? 0.7,
          pas.process_weight ?? 0.3,
          pas.type ?? defaultDispatchType('process_aware_scoring'),
        );
      },
    );

    // v0.5.0 dispatch: long_context_cluster real fetch (06-16 01:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/long_context_cluster/v1)
    // - 仅当 ext.long_context_cluster.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 long_context_cluster QuestionScore (questionId=`long_context_cluster_${model.name}`, category=`long_context_cluster`, dimension=`long_context` 走 v0.4.0 默认, score = subset_pass_rate * 0.7 + (1 - tokens_used_normalized) * 0.3 归一到 0-100; 4 基准 LongBench v2 + Babilong + InfiniteBench + Phonebook, harness 0.4.0 PR #3256 同源)
    // - 注: Long Context Cluster (harness 0.4.0 PR #3256 同源, 62 tasks, 4 基准 LongBench v2 21 + Babilong 13 + InfiniteBench 18 + Phonebook 10) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 harness 真实 API
    await this.dispatchExternalBenchmark(
      results, 'long_context_cluster',
      'https://llm-benchmark.local/api/v1/long_context_cluster/v1',
      (apiBase, model, timeoutMs) => {
        const lcc = this.config._external_benchmarks_roadmap!.long_context_cluster!;
        return this.fetchLongContextClusterScore(apiBase, model, timeoutMs, lcc.anchor_score, lcc.subset ?? defaultSubset('long_context_cluster'), lcc.tasks_total ?? 62, lcc.type ?? defaultDispatchType('long_context_cluster'));
      },
    );

    return results;
  }

  /**
   * v0.5.0 dispatch: cyberseceval3 真实 fetch (06-14 22:23 cron, 沿 03:23 webdev_arena 模式)
   * POST {api_base} body={api_base, model_id, risk_categories, timeout_ms}
   * 解析 {safety_score: number (0-100), coverage_rate: number (0-1), risk_pass?: object, eval_id?, error?}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`safety` (v0.4.0 默认, cyberseceval3 属 safety 维度)
   * score = safety_score * 0.7 + coverage_rate * 30 (0-100 归一; safety_score 0-100 / coverage_rate 0-1)
   * Meta 官方 CyberSecEval3 (2025-12) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchCyberseceval3Score(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    riskCategories: string
  ): Promise<QuestionScore> {
    const questionId = `cyberseceval3_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      risk_categories: riskCategories,
      timeout_ms: timeoutMs,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'cyberseceval3',
          score: 0,
          dimension: 'safety',
          modelOutput: '',
          detail: `cyberseceval3 HTTP ${resp.status}: ${errText.slice(0, 200)}`,
        };
      }
      const data = (await resp.json()) as { safety_score?: number; coverage_rate?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'cyberseceval3',
          score: 0,
          dimension: 'safety',
          modelOutput: '',
          detail: `cyberseceval3 API error: ${data.error}`,
        };
      }
      const safety = typeof data.safety_score === 'number' ? data.safety_score : 0;
      const coverage = typeof data.coverage_rate === 'number' ? data.coverage_rate : 0;
      // 0-100 归一: safety_score 0-100 → 0-70, coverage_rate 0-1 → 0-30, 加权和
      const normalized = Math.max(0, Math.min(100, safety * 0.7 + coverage * 30));
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      const detail = `cyberseceval3 safety=${safety.toFixed(1)}, coverage=${(coverage * 100).toFixed(1)}%, score=${normalized.toFixed(1)}, risks=${riskCategories}${evalIdPart}`;
      return {
        questionId,
        category: 'cyberseceval3',
        score: Math.round(normalized * 10) / 10,
        dimension: 'safety',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'cyberseceval3',
        score: 0,
        dimension: 'safety',
        modelOutput: '',
        detail: isTimeout
          ? `cyberseceval3 timeout after ${timeoutMs}ms`
          : `cyberseceval3 fetch error: ${msg.slice(0, 200)}`,
      };
    }
  }

  /**
   * v0.5.0 dispatch: webdev_arena 真实 fetch (06-14 03:23 cron)
   * POST {api_base} body={api_base, model_id, prompt, timeout_ms}
   * 解析 {elo_score: number, pass_rate: number, eval_id?, error?}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, webdev_arena 属 coding 维度)
   * score = elo_score * 0.9 + pass_rate * 10 (0-100 归一; elo 0-1000 / pass_rate 0-1)
   * anchor_score 不匹配时 logWarn 警告
   */
  private async fetchWebdevArenaScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number
  ): Promise<QuestionScore> {
    const questionId = `webdev_arena_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      prompt: 'Generate a full-stack web application (HTML+CSS+JS) per WebDevArena standard task prompt set.',
      timeout_ms: timeoutMs,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'webdev_arena',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `webdev_arena HTTP ${resp.status}: ${errText.slice(0, 200)}`,
        };
      }
      const data = (await resp.json()) as { elo_score?: number; pass_rate?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'webdev_arena',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `webdev_arena API error: ${data.error}`,
        };
      }
      const elo = typeof data.elo_score === 'number' ? data.elo_score : 0;
      const pass = typeof data.pass_rate === 'number' ? data.pass_rate : 0;
      // 0-100 归一: elo 0-1000 → 0-100, pass_rate 0-1 → 0-10, 加权和
      const normalized = Math.max(0, Math.min(100, elo * 0.09 + pass * 10));
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      let detail = `webdev_arena elo=${elo}, pass_rate=${(pass * 100).toFixed(1)}%, score=${normalized.toFixed(1)}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [webdev_arena] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'webdev_arena',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'webdev_arena',
        score: 0,
        dimension: 'coding',
        modelOutput: '',
        detail: isTimeout
          ? `webdev_arena timeout after ${timeoutMs}ms`
          : `webdev_arena fetch error: ${msg.slice(0, 200)}`,
      };
    }
  }

  /**
   * v0.5.0 dispatch: aa_omniscience 真实 fetch (06-15 00:03 cron, 沿 03:23 webdev_arena 模式)
   * POST {api_base} body={api_base, model_id, timeout_ms}
   * 解析 {accuracy_score: number (0-100), hallucination_rate: number (0-1), eval_id?, error?}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`long_context` (v0.4.0 默认, aa_omniscience 属长上下文知识检索 + 幻觉率)
   * score = accuracy_score * 0.7 + (1 - hallucination_rate) * 30 (0-100 归一; accuracy_score 0-100 / hallucination_rate 0-1)
   * Artificial Analysis Omniscience (2026-05-25) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchAAOmniscienceScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number
  ): Promise<QuestionScore> {
    const questionId = `aa_omniscience_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'aa_omniscience',
          score: 0,
          dimension: 'long_context',
          modelOutput: '',
          detail: `aa_omniscience HTTP ${resp.status}: ${errText.slice(0, 200)}`,
        };
      }
      const data = (await resp.json()) as { accuracy_score?: number; hallucination_rate?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'aa_omniscience',
          score: 0,
          dimension: 'long_context',
          modelOutput: '',
          detail: `aa_omniscience API error: ${data.error}`,
        };
      }
      const accuracy = typeof data.accuracy_score === 'number' ? data.accuracy_score : 0;
      const hallucination = typeof data.hallucination_rate === 'number' ? data.hallucination_rate : 0;
      // 0-100 归一: accuracy_score 0-100 → 0-70, (1 - hallucination_rate) 0-1 → 0-30, 加权和
      const normalized = Math.max(0, Math.min(100, accuracy * 0.7 + (1 - hallucination) * 30));
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      let detail = `aa_omniscience accuracy=${accuracy.toFixed(1)}, hallucination=${(hallucination * 100).toFixed(1)}%, score=${normalized.toFixed(1)}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [aa_omniscience] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'aa_omniscience',
        score: Math.round(normalized * 10) / 10,
        dimension: 'long_context',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'aa_omniscience',
        score: 0,
        dimension: 'long_context',
        modelOutput: '',
        detail: isTimeout
          ? `aa_omniscience timeout after ${timeoutMs}ms`
          : `aa_omniscience fetch error: ${msg.slice(0, 200)}`,
      };
    }
  }

  /**
   * v0.5.0 dispatch: terminal_bench 真实 fetch (06-15 03:03 cron, 沿 06-14 03:23 webdev_arena 模式)
   * POST {api_base} body={api_base, model_id, timeout_ms}
   * 解析 {task_pass_rate: number (0-1), avg_duration_s: number (秒), trajectory_id?: string, error?: string}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, terminal_bench 属 coding 维度)
   * score = task_pass_rate * 70 + (1 - min(avg_duration_s, 3600) / 3600) * 30 (0-100 归一; 速度惩罚: 1h 满 cap)
   * Terminal-Bench 2.0 (tbench.ai, 2026-06) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchTerminalBenchScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset: string = 'full',
    dispatchType: string = defaultDispatchType('terminal_bench')
  ): Promise<QuestionScore> {
    const questionId = `terminal_bench_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      subset,
      dispatch_type: dispatchType,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'terminal_bench',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `terminal_bench HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          dispatchType,
        };
      }
      const data = (await resp.json()) as { task_pass_rate?: number; avg_duration_s?: number; trajectory_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'terminal_bench',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `terminal_bench API error: ${data.error}`,
          dispatchType,
        };
      }
      const passRate = typeof data.task_pass_rate === 'number' ? data.task_pass_rate : 0;
      const durSec = typeof data.avg_duration_s === 'number' ? Math.min(data.avg_duration_s, 3600) : 3600;
      // 0-100 归一: pass_rate 0-1 → 0-70, 速度 1 - dur/3600 → 0-30 (1h 满 cap, 越快分越高)
      const normalized = Math.max(0, Math.min(100, passRate * 70 + (1 - durSec / 3600) * 30));
      const trajPart = data.trajectory_id ? `, trajectory_id=${data.trajectory_id}` : '';
      const detail = `terminal_bench[${subset}] pass_rate=${(passRate * 100).toFixed(1)}%, avg_duration=${durSec.toFixed(0)}s, score=${normalized.toFixed(1)}${trajPart}`;
      if (anchorScore != null && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [terminal_bench] anchor mismatch: model=${model.name} score=${normalized.toFixed(1)} anchor=${anchorScore} (diff > 5)`);
      }
      return {
        questionId,
        category: 'terminal_bench',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
        dispatchType,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'terminal_bench',
        score: 0,
        dimension: 'coding',
        modelOutput: '',
        detail: isTimeout
          ? `terminal_bench timeout after ${timeoutMs}ms`
          : `terminal_bench fetch error: ${msg.slice(0, 200)}`,
        dispatchType,
      };
    }
  }

  /**
   * v0.5.0 dispatch: benchlm_agentic 真实 fetch (06-15 04:03 cron, 沿 06-15 03:03 terminal_bench 模式)
   * POST {api_base} body={api_base, model_id, timeout_ms, native_evals}
   * 解析 {agentic_pass_rate: number (0-1), design2code_score: number (0-100), vision2web_score: number (0-100), native_evals_score?: number (0-100), eval_id?: string, error?: string}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, benchlm_agentic 属 coding 维度)
   * score = agentic_pass_rate * 50 + design2code_score * 0.25 + vision2web_score * 0.25 (0-100 归一; native_evals 启用时附加 +5 奖励)
   * BenchLM.ai (benchlm.ai, 2026-06-07, 248 models × 225 benchmarks, agentic 主战场) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchBenchlmAgenticScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    nativeEvals: boolean = false,
    subset: string = 'all',
    dispatchType: string = defaultDispatchType('benchlm_agentic')
  ): Promise<QuestionScore> {
    const questionId = `benchlm_agentic_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      native_evals: nativeEvals,
      subset, // 06-20 03:03 cron: 与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / cyberseceval3.risk_categories 对位
      dispatch_type: dispatchType,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'benchlm_agentic',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `benchlm_agentic HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          dispatchType,
        };
      }
      const data = (await resp.json()) as { agentic_pass_rate?: number; design2code_score?: number; vision2web_score?: number; native_evals_score?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'benchlm_agentic',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `benchlm_agentic API error: ${data.error}`,
          dispatchType,
        };
      }
      const passRate = typeof data.agentic_pass_rate === 'number' ? data.agentic_pass_rate : 0;
      const d2c = typeof data.design2code_score === 'number' ? data.design2code_score : 0;
      const v2w = typeof data.vision2web_score === 'number' ? data.vision2web_score : 0;
      // 0-100 归一: pass_rate 0-1 → 0-50, d2c 0-100 → 0-25, v2w 0-100 → 0-25, 加权和
      let normalized = Math.max(0, Math.min(100, passRate * 50 + d2c * 0.25 + v2w * 0.25));
      const nativePart = (nativeEvals || subset === 'native_evals_only') && typeof data.native_evals_score === 'number'
        ? `, native_evals=${data.native_evals_score.toFixed(1)} (启用+5)`
        : '';
      if ((nativeEvals || subset === 'native_evals_only') && typeof data.native_evals_score === 'number') {
        normalized = Math.min(100, normalized + 5);
      }
      const subsetPart = subset !== 'all' ? `, subset=${subset}` : '';
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      let detail = `benchlm_agentic pass_rate=${(passRate * 100).toFixed(1)}%, d2c=${d2c.toFixed(1)}, v2w=${v2w.toFixed(1)}, score=${normalized.toFixed(1)}${subsetPart}${nativePart}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [benchlm_agentic] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'benchlm_agentic',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
        dispatchType,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'benchlm_agentic',
        score: 0,
        dimension: 'coding',
        modelOutput: '',
        detail: isTimeout
          ? `benchlm_agentic timeout after ${timeoutMs}ms`
          : `benchlm_agentic fetch error: ${msg.slice(0, 200)}`,
        dispatchType,
      };
    }
  }

  /**
   * v0.5.0 dispatch: swe_bench_pro 真实 fetch (06-15 05:23 cron, 沿 06-15 04:03 benchlm_agentic 模式)
   * POST {api_base} body={api_base, model_id, timeout_ms, subset, agentic_mode}
   * 解析 {pass_rate: number (0-1), patch_score: number (0-100), files_modified: number, eval_id?: string, error?: string}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, swe_bench_pro 属 coding 维度)
   * score = pass_rate * 70 + patch_score * 0.2 + min(files_modified/50, 1) * 10 (0-100 归一; agentic_mode 关闭时纯 pass_rate * 100)
   * SWE-bench Pro (Scale AI, 2026-06-02, claude-fable-5 首条数据 80.3%, Mythos-tier 主标杆) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchSweBenchProScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset: string = 'verified',
    agenticMode: boolean = true,
    dispatchType: string = defaultDispatchType('swe_bench_pro')
  ): Promise<QuestionScore> {
    const questionId = `swe_bench_pro_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      subset,
      agentic_mode: agenticMode,
      dispatch_type: dispatchType,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'swe_bench_pro',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `swe_bench_pro HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          dispatchType,
        };
      }
      const data = (await resp.json()) as { pass_rate?: number; patch_score?: number; files_modified?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'swe_bench_pro',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `swe_bench_pro API error: ${data.error}`,
          dispatchType,
        };
      }
      const passRate = typeof data.pass_rate === 'number' ? data.pass_rate : 0;
      const patchScore = typeof data.patch_score === 'number' ? data.patch_score : 0;
      const filesMod = typeof data.files_modified === 'number' ? Math.min(data.files_modified, 50) : 0;
      // 0-100 归一:
      //   agentic_mode 关闭时: 纯 pass_rate * 100
      //   agentic_mode 开启时: pass_rate * 70 + patch_score * 0.2 + (filesMod/50) * 10 (3 维复合)
      let normalized: number;
      if (!agenticMode) {
        normalized = Math.max(0, Math.min(100, passRate * 100));
      } else {
        normalized = Math.max(0, Math.min(100, passRate * 70 + patchScore * 0.2 + filesMod * 0.2));
      }
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      const modePart = agenticMode ? '' : ' (non-agentic)';
      let detail = `swe_bench_pro[${subset}${modePart}] pass_rate=${(passRate * 100).toFixed(1)}%, patch=${patchScore.toFixed(1)}, files_modified=${filesMod}, score=${normalized.toFixed(1)}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [swe_bench_pro] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'swe_bench_pro',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
        dispatchType,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'swe_bench_pro',
        score: 0,
        dimension: 'coding',
        modelOutput: '',
        detail: isTimeout
          ? `swe_bench_pro timeout after ${timeoutMs}ms`
          : `swe_bench_pro fetch error: ${msg.slice(0, 200)}`,
        dispatchType,
      };
    }
  }

  /**
   * v0.5.0 dispatch: process_aware_scoring 真实 fetch (06-15 06:43 cron, 沿 05:23 swe_bench_pro 模式)
   * POST {api_base} body={api_base, model_id, mode, agentic_benchmark, pass_fail_weight, process_weight, timeout_ms}
   * 解析 {process_score: number (0-100), pass_rate: number (0-1), commit_count?, test_run_count?, retry_count?, file_coverage? (0-1), trajectory_score? (0-100), eval_id?, error?}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`coding` (v0.4.0 默认, process_aware_scoring 属 agentic coding 维度, 2026 Agent 元年主战场)
   * score = process_score (server 端已按 pass_fail_weight + process_weight 复合); fallback: pass_rate*100*passWeight + trajectory_score*procWeight (client-side 复合)
   * 锺定: Princeton SWE-Bench Pro 03-04 trajectory-level + 4 过程信号 (commit/test/retry/coverage)
   * 官方未提供 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchProcessAwareScoringScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset: string = 'all_process_signals',
    mode: string = 'all',
    agenticBenchmark: string = 'swe_bench_pro',
    passFailWeight: number = 0.7,
    processWeight: number = 0.3,
    dispatchType: string = defaultDispatchType('process_aware_scoring')
  ): Promise<QuestionScore> {
    const questionId = `process_aware_scoring_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      subset,
      mode,
      agentic_benchmark: agenticBenchmark,
      pass_fail_weight: passFailWeight,
      process_weight: processWeight,
      timeout_ms: timeoutMs,
      dispatch_type: dispatchType,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'process_aware_scoring',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `process_aware_scoring HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          dispatchType,
        };
      }
      const data = (await resp.json()) as { process_score?: number; pass_rate?: number; commit_count?: number; test_run_count?: number; retry_count?: number; file_coverage?: number; trajectory_score?: number; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'process_aware_scoring',
          score: 0,
          dimension: 'coding',
          modelOutput: '',
          detail: `process_aware_scoring API error: ${data.error}`,
          dispatchType,
        };
      }
      // 优先采用 server 端 process_score (0-100, 已复合 pass_fail_weight + process_weight); 缺失时 client-side 复合
      let normalized: number;
      if (typeof data.process_score === 'number') {
        normalized = Math.max(0, Math.min(100, data.process_score));
      } else {
        const passRate = typeof data.pass_rate === 'number' ? data.pass_rate : 0;
        const traj = typeof data.trajectory_score === 'number' ? data.trajectory_score : 0;
        normalized = Math.max(0, Math.min(100, passRate * 100 * passFailWeight + traj * processWeight));
      }
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      // 补充过程信号报告 (4 维: commit/test/retry/coverage) + trajectory 综合分
      const sigParts: string[] = [];
      if (typeof data.commit_count === 'number') sigParts.push(`commit=${data.commit_count}`);
      if (typeof data.test_run_count === 'number') sigParts.push(`tests=${data.test_run_count}`);
      if (typeof data.retry_count === 'number') sigParts.push(`retries=${data.retry_count}`);
      if (typeof data.file_coverage === 'number') sigParts.push(`cov=${(data.file_coverage * 100).toFixed(1)}%`);
      if (typeof data.trajectory_score === 'number') sigParts.push(`traj=${data.trajectory_score.toFixed(1)}`);
      const sigStr = sigParts.length > 0 ? `, ${sigParts.join('/')}` : '';
      let detail = `process_aware_scoring[${subset}|${mode}@${agenticBenchmark}] score=${normalized.toFixed(1)}${sigStr}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [process_aware_scoring] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'process_aware_scoring',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
        dispatchType,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'process_aware_scoring',
        score: 0,
        dimension: 'coding',
        modelOutput: '',
        detail: isTimeout
          ? `process_aware_scoring timeout after ${timeoutMs}ms`
          : `process_aware_scoring fetch error: ${msg.slice(0, 200)}`,
        dispatchType,
      };
    }
  }

  /**
   * v0.5.0 dispatch: long_context_cluster 真实 fetch (06-16 01:03 cron, 沿 06-15 06:43 process_aware_scoring 模式)
   * POST {api_base} body={api_base, model_id, subset, tasks_total, timeout_ms}
   * 解析 {subset_pass_rate: number (0-1), tokens_used: number, task_count: number, anchor_scores?: object, eval_id?, error?}
   * 三段 try/catch: timeout / 4xx / 5xx
   * 返回 QuestionScore: dimension=`long_context` (v0.4.0 默认, long_context_cluster 属 long_context 维度)
   * score = subset_pass_rate * 70 + (1 - min(tokens_used, 1_050_000) / 1_050_000) * 30 (0-100 归一; 1.05M context 上限对齐 GPT-5.4 1.05M 商用档)
   * Long Context Cluster (harness 0.4.0 PR #3256 同源, 62 tasks, 4 基准 LongBench v2 + Babilong + InfiniteBench + Phonebook) 无 public hosted API, 默认端点为本仓库 stub, 部署者可接自托管适配层
   */
  private async fetchLongContextClusterScore(
    apiBase: string,
    model: ModelConfig,
    timeoutMs: number,
    anchorScore?: number,
    subset: string = 'all',
    tasksTotal: number = 62,
    dispatchType: string = defaultDispatchType('long_context_cluster')
  ): Promise<QuestionScore> {
    const questionId = `long_context_cluster_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      subset,
      tasks_total: tasksTotal,
      timeout_ms: timeoutMs,
      dispatch_type: dispatchType,
    };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return {
          questionId,
          category: 'long_context_cluster',
          score: 0,
          dimension: 'long_context',
          modelOutput: '',
          detail: `long_context_cluster HTTP ${resp.status}: ${errText.slice(0, 200)}`,
          dispatchType,
        };
      }
      const data = (await resp.json()) as { subset_pass_rate?: number; tokens_used?: number; task_count?: number; anchor_scores?: { longbench_v2?: number; babilong?: number; infinitebench?: number; phonebook?: number }; eval_id?: string; error?: string };
      if (data.error) {
        return {
          questionId,
          category: 'long_context_cluster',
          score: 0,
          dimension: 'long_context',
          modelOutput: '',
          detail: `long_context_cluster API error: ${data.error}`,
          dispatchType,
        };
      }
      const passRate = typeof data.subset_pass_rate === 'number' ? data.subset_pass_rate : 0;
      const tokensUsed = typeof data.tokens_used === 'number' ? data.tokens_used : 0;
      // 1.05M context 上限对齐 GPT-5.4 1.05M 商用档 (2026-06)
      const contextCap = 1_050_000;
      const contextEff = Math.max(0, Math.min(1, 1 - Math.min(tokensUsed, contextCap) / contextCap));
      const normalized = Math.max(0, Math.min(100, passRate * 70 + contextEff * 30));
      const taskCountPart = typeof data.task_count === 'number' ? `, tasks=${data.task_count}/${tasksTotal}` : `, tasks=${tasksTotal}`;
      const tokensPart = `, ctx=${tokensUsed}/${contextCap}`;
      const evalIdPart = data.eval_id ? `, eval_id=${data.eval_id}` : '';
      // 补充 4 基准锚定报告 (longbench_v2 / babilong / infinitebench / phonebook)
      const anchorParts: string[] = [];
      if (data.anchor_scores) {
        if (typeof data.anchor_scores.longbench_v2 === 'number') anchorParts.push(`lb2=${data.anchor_scores.longbench_v2.toFixed(1)}`);
        if (typeof data.anchor_scores.babilong === 'number') anchorParts.push(`bab=${data.anchor_scores.babilong.toFixed(1)}`);
        if (typeof data.anchor_scores.infinitebench === 'number') anchorParts.push(`inf=${data.anchor_scores.infinitebench.toFixed(1)}`);
        if (typeof data.anchor_scores.phonebook === 'number') anchorParts.push(`phb=${data.anchor_scores.phonebook.toFixed(1)}`);
      }
      const anchorStr = anchorParts.length > 0 ? `, [${anchorParts.join('/')}]` : '';
      let detail = `long_context_cluster[${subset}] score=${normalized.toFixed(1)}${taskCountPart}${tokensPart}${anchorStr}${evalIdPart}`;
      if (typeof anchorScore === 'number' && Math.abs(normalized - anchorScore) > 5) {
        logWarn(`  [long_context_cluster] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
        detail += ` (anchor ⚠️ ${anchorScore})`;
      }
      return {
        questionId,
        category: 'long_context_cluster',
        score: Math.round(normalized * 10) / 10,
        dimension: 'long_context',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
        dispatchType,
      };
    } catch (err: unknown) {
      const msg = errorMessage(err);
      const isTimeout = msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
      return {
        questionId,
        category: 'long_context_cluster',
        score: 0,
        dimension: 'long_context',
        modelOutput: '',
        detail: isTimeout
          ? `long_context_cluster timeout after ${timeoutMs}ms`
          : `long_context_cluster fetch error: ${msg.slice(0, 200)}`,
        dispatchType,
      };
    }
  }

  private async evaluateModel(
    model: ModelConfig,
    modelIndex: number
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    const scores: QuestionScore[] = [];

    const questions: BenchmarkQuestion[] = [];

    if (this.config.benchmarks.dialogue) {
      questions.push(...getAllDialogueBenchmarks());
    }
    if (this.config.benchmarks.coding) {
      questions.push(...getAllCodeBenchmarks());
    }
    if (this.config.benchmarks.function_calling) {
      questions.push(...getAllFunctionCallingBenchmarks());
    }
    if (this.config.benchmarks.long_context) {
      questions.push(...getAllLongContextBenchmarks());
    }
    if (this.config.benchmarks.multi_turn) {
      questions.push(...getAllMultiTurnBenchmarks());
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const progress =
        ((modelIndex * questions.length + i + 1) /
          (this.config.models.length * questions.length)) *
        100;

      if (this.progressCallback) {
        this.progressCallback(progress);
      }

      const startTime = new Date().toISOString().slice(11,19);
      log(
        `  [${model.name}] ${i + 1}/${questions.length}: ${question.id} (${startTime})`
      );

      try {
        const score = await this.evaluateQuestion(question, model);
        scores.push(score);
      } catch (error: unknown) {
        logError(`    评测失败: ${errorMessage(error)}`);
        scores.push({
          questionId: question.id,
          category: question.category,
          score: 0,
          dimension: question.type,
          modelOutput: '',
          detail: `评测错误: ${errorMessage(error)}`,
        });
      }
    }

    const totalScore = this.calculateTotalScore(scores);
    const dimensions = this.calculateDimensions(scores);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`\n✅ [${model.name}] 评测完成! 总分: ${totalScore}, 耗时: ${durationSec}s`);

    return {
      modelName: model.name,
      model: model,
      scores: scores,
      totalScore: totalScore,
      dimensions: dimensions,
      timestamp: new Date(),
      duration: Date.now() - startTime,
    };
  }

  private async evaluateQuestion(
    question: BenchmarkQuestion,
    model: ModelConfig
  ): Promise<QuestionScore> {
    const scorer = new Scorer(this.adapter, model);

    // 多轮对话：把 turns 整体作为 messages 发送，最后一轮 user 作为"问题轮"
    if (question.type === 'multi_turn') {
      const mtQuestion = question as MultiTurnQuestion;
      const turns: Array<{ role: string; content: string }> = mtQuestion.turns || [];
      const modelOutput = await this.adapter.chat(turns, model);
      return scorer.scoreMultiTurn(question, modelOutput);
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (question.systemPrompt) {
      messages.push({ role: 'system', content: question.systemPrompt });
    }

    messages.push({ role: 'user', content: question.content });

    const modelOutput = await this.adapter.chat(messages, model);

    if (question.type === 'coding') {
      const codeQuestion = question as CodeBenchmarkQuestion;
      return scorer.scoreCoding(question, modelOutput, codeQuestion.testCases);
    }

    if (question.type === 'function_calling') {
      return scorer.scoreFunctionCalling(question, modelOutput);
    }

    if (question.type === 'long_context') {
      return scorer.scoreLongContext(question, modelOutput);
    }

    return scorer.scoreDialogue(question, modelOutput);
  }

  private calculateTotalScore(scores: QuestionScore[]): number {
    if (scores.length === 0) return 0;

    const totalWeighted = scores.reduce((sum, score) => sum + score.score, 0);

    return Math.round(totalWeighted / scores.length);
  }

  private calculateDimensions(scores: QuestionScore[]): DimensionScore {
    const dimScores = (dim: string) =>
      scores.filter((s) => s.dimension === dim);

    return {
      dialogue: this.buildDimEntry(dimScores('dialogue')),
      coding: this.buildDimEntry(dimScores('coding')),
      function_calling: this.buildDimEntry(dimScores('function_calling')),
      long_context: this.buildDimEntry(dimScores('long_context')),
      multi_turn: this.buildDimEntry(dimScores('multi_turn')),
    };
  }

  /**
   * v0.6.0 step-v6.0-2 caller: 5-dim buildDimEntry helper (parallels 9e8f7ff dispatchV050External +
   * 14c64d4 webScorer + 2bb18e4 avgOf + 6af9f47 5-dim console-error 漏更 cleanup chain) —
   * 5 个 dim entry (dialogue / coding / function_calling / long_context / multi_turn)
   * 共享同一套 (total / count / average / details) 4 字段构造, 抽成 1 个 helper 让 calculateDimensions
   * 从 73 行降到 11 行 (-62), 同时挂上 bootstrap95CI 真输出 (b3cb35e helper 已有但 22:44 漏更
   * calculateDimensions 没接线). 07-01 cron 把 helper 实际填入 ci 字段 (5 维都接, n>=2 才填, 空 dim 不挂).
   *
   * 输出字段:
   * - total / count / average: 与 v0.5.0 完全一致 (byte-identical contract)
   * - details: calculateCategoryDetails 保持原行为
   * - ci (v0.6.0+ optional): bootstrap95CI over per-question scores, n>=2 时挂上, n<2 时省略
   *   (跟 type stub `ci?: {...}` 兼容 — 0/1 维 5 字段齐但 ci undefined, 不让 reporter 跑空白 CI)
   */
  private buildDimEntry(dimScores: QuestionScore[]): DimensionScore['dialogue'] {
    const total = dimScores.reduce((sum, s) => sum + s.score, 0);
    const count = dimScores.length;
    const average =
      count > 0 ? Math.round(total / count) : 0;
    const details = this.calculateCategoryDetails(dimScores);
    const entry: DimensionScore['dialogue'] = {
      total,
      count,
      average,
      details,
    };
    if (count >= 2) {
      entry.ci = bootstrap95CI(dimScores.map((s) => s.score));
    }
    return entry;
  }

  private calculateCategoryDetails(
    scores: QuestionScore[]
  ): Record<string, number> {
    const details: Record<string, number> = {};
    const categories = new Set(scores.map((s) => s.category));

    for (const category of categories) {
      const categoryScores = scores.filter((s) => s.category === category);
      details[category] = Math.round(
        categoryScores.reduce((sum, s) => sum + s.score, 0) /
          categoryScores.length
      );
    }

    return details;
  }

  /**
   * v0.6.0 step-v6.0-9 chain #10 dispatch-call-extraction shorthand:
   * 8 个 await this.dispatchV050External(results, '<name>', this.config._external_benchmarks_roadmap?.<name>,
   *   '<url>', (apiBase, model, timeoutMs) => { ... }) 调用点全部 collapse 到 4-arg 形式
   *   await this.dispatchExternalBenchmark(results, '<name>', '<url>', (apiBase, model, timeoutMs) => { ... })
   *
   * 集中实现: 从 this.config._external_benchmarks_roadmap?.[benchmarkName] 读 cfg,
   *   自动透传给 dispatchV050External (本 helper 仅是 cfg-lookup wrapper, 不修改 dispatchV050External 本身).
   *
   * 价值: 8 sites 减少 4×8=32 行重复 (3 行 cfg + 1 行 benchmarkName 参数 + 1 行换行 boilerplate),
   *   parallels chain #8 defaultDispatchType + chain #9 logExternalBenchmarkEnabled 模式 —
   *   「default value per-key 散落但 lookup 集中实现」的 helper-extraction 第 3 站 (cfg 自动 lookup).
   *
   * 边界:
   * - _external_benchmarks_roadmap 整体 undefined → cfg = undefined → dispatchV050External 走 enabled 守卫早 return (8 个 fetcher 同行为)
   * - benchmarkName 不在 cfg 里 (typings 漂移) → cfg = undefined → 同上守卫早 return
   * - benchmarkName 拼错 (e.g. 'webdevArena' 驼峰而非 'webdev_arena') → cfg = undefined → 守卫早 return, 0 副作用
   *
   * 类型: cfg cast 为 dispatchV050External 期望的 5-field shape (TypeScript homomorphic narrow on key)
   */
  private async dispatchExternalBenchmark(
    results: EvaluationResult[],
    benchmarkName: 'webdev_arena' | 'cyberseceval3' | 'aa_omniscience' | 'terminal_bench' | 'benchlm_agentic' | 'swe_bench_pro' | 'process_aware_scoring' | 'long_context_cluster',
    defaultApiBase: string,
    fetcher: (apiBase: string, model: ModelConfig, timeoutMs: number, dispatchType: string) => Promise<QuestionScore>,
  ): Promise<void> {
    const ext = this.config._external_benchmarks_roadmap as Record<string, { enabled?: boolean; type?: string; api_base?: string; timeout_ms?: number; model_id?: string } | undefined> | undefined;
    const cfg = ext?.[benchmarkName];
    return this.dispatchV050External(results, benchmarkName, cfg, defaultApiBase, fetcher);
  }

  /**
   * v0.5.0 dispatch 通用 helper: 8 项外部 benchmark dispatch 块共享同一套
   * (1) enabled 守卫
   * (2) api_base + timeout_ms 默认值 (api_base per-benchmark, timeout_ms 统一 30000)
   * (3) model_id 过滤 (配了 cfg.model_id 只评那个; 未配走全部 model)
   * (4) Promise.all(results.map(async (result) => { ... fetch })) 并行
   * (5) result.scores.push + log 行 (统一格式 `[${result.modelName}] ${benchmarkName} score: ...`)
   * 06-29 22:43 cron 抽出, parallels 14c64d4 webScorer() 模式 (那步抽的是 scoreFunctionCalling/scoreLongContext/scoreMultiTurn 3x byte-identical dummyModel+new Scorer boilerplate; 本步抽的是 8x 共享的 enabled/apiBase/timeoutMs/model_id/Promise.all/scores.push/log 调度骨架).
   * 每个调用点用闭包 curry 出 fetcher (apiBase, model, timeoutMs) => fetchXxxScore(apiBase, model, timeoutMs, ...extraArgs), 把 per-benchmark 的 extra args (anchorScore/subset/mode/cats/nativeEvals/tasksTotal/...) 在 fetcher 闭包里绑死.
   */
  private async dispatchV050External(
    results: EvaluationResult[],
    benchmarkName: string,
    cfg: { enabled?: boolean; type?: string; api_base?: string; timeout_ms?: number; model_id?: string } | undefined,
    defaultApiBase: string,
    fetcher: (apiBase: string, model: ModelConfig, timeoutMs: number, dispatchType: string) => Promise<QuestionScore>,
  ): Promise<void> {
    if (!cfg?.enabled) return;
    const apiBase = cfg.api_base ?? defaultApiBase;
    const timeoutMs = cfg.timeout_ms ?? 30000;
    await Promise.all(
      results.map(async (result) => {
        if (cfg.model_id && result.model.model !== cfg.model_id && result.modelName !== cfg.model_id) {
          return;
        }
        const score = await fetcher(apiBase, result.model, timeoutMs, cfg?.type ?? defaultDispatchType(benchmarkName));
        result.scores.push(score);
        log(`  [${result.modelName}] ${benchmarkName} score: ${score.score} (${score.detail ?? 'no detail'})`);
      })
    );
  }
}

/**
 * v0.6.0 step-v6.0-2 helper: 5-dim bootstrap 95% confidence interval 真输出
 * (沿 06-19 ROADMAP evaluator.ts run() JSDoc 段标注 "📊 Confidence interval: 当前 v0.4.0 输出为 mean,
 *  未输出 std / 95% CI; 5 题维度 std 较大, 决策前建议至少跑 3 轮取均值"). step-v6.0-2 把该 JSDoc
 * 升级为真输出, 让 v0.6.0 reporter 5-dim Markdown / HTML / CSV 报表每格附 mean ± std [ci_lower, ci_upper].
 *
 * 方法: percentile bootstrap (Efron 1979). 沿 scores 数组 n 个分数, 有放回抽样 nResamples 次
 * 各抽样 n 个分数, 算每个 resample 的 mean, 排序后取 2.5%/97.5% 分位数作 ci_lower/ci_upper.
 * std 用 Bessel-corrected sample standard deviation.
 *
 * 边界:
 * - 空数组: 返回 { mean: 0, ciLower: 0, ciUpper: 0, std: 0, n: 0 } (0 维不炸)
 * - 单元素 (n=1): std=0 (Bessel NaN 替成 0), CI = [mean, mean] (resample = 1 point always)
 * - 全部同值 (e.g. [80,80,80]): std=0, CI = [80,80]
 *
 * 默认 nResamples=1000 (Efron & Tibshirani 1993 推荐 ≥1000 for 95% CI 稳定).
 * rng 可注入用于 seed 复现测试, 默认 Math.random.
 */
export interface Bootstrap95CI {
  mean: number;
  std: number;
  ciLower: number;
  ciUpper: number;
  n: number;
  nResamples: number;
}

export function bootstrap95CI(
  scores: number[],
  nResamples = 1000,
  rng: () => number = Math.random,
): Bootstrap95CI {
  const n = scores.length;
  if (n === 0) {
    return { mean: 0, std: 0, ciLower: 0, ciUpper: 0, n: 0, nResamples };
  }
  // mean
  let sum = 0;
  for (const s of scores) sum += s;
  const mean = sum / n;
  // std (Bessel-corrected, n-1; NaN 边界 → 0)
  let std = 0;
  if (n >= 2) {
    let sqSum = 0;
    for (const s of scores) {
      const d = s - mean;
      sqSum += d * d;
    }
    std = Math.sqrt(sqSum / (n - 1));
  }
  // bootstrap resample means
  const means = new Float64Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    let resampleSum = 0;
    for (let i = 0; i < n; i++) {
      // 有放回抽样: idx = floor(rng() * n)  (rng() ∈ [0,1) 永远 idx < n)
      const idx = Math.floor(rng() * n);
      resampleSum += scores[idx];
    }
    means[r] = resampleSum / n;
  }
  // percentile CI: 排序后取 2.5% / 97.5% 分位 (linear interp 用 Math.round 等价 round-half-up index)
  const sorted = Array.from(means).sort((a, b) => a - b);
  const loIdx = Math.floor(0.025 * nResamples);
  const hiIdx = Math.min(nResamples - 1, Math.floor(0.975 * nResamples));
  const ciLower = sorted[loIdx];
  const ciUpper = sorted[hiIdx];
  return { mean, std, ciLower, ciUpper, n, nResamples };
}
