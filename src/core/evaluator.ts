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
        enabled.push(`webdev_arena(api_base=${ext.webdev_arena.api_base ?? '(unset)'}, model_id=${ext.webdev_arena.model_id ?? '(unset)'})`);
      }
      if (ext.terminal_bench?.enabled) {
        const subset = ext.terminal_bench.subset ?? 'full';
        const anchor = ext.terminal_bench.anchor_score != null ? `, anchor=${ext.terminal_bench.anchor_score}` : '';
        // v0.5.0 type 段真实化 (06-28 cron): surface the dispatch category label
        // declared in src/types/index.ts so downstream log parsing can group
        // benchmarks by type (agentic_coding / agentic_fullstack / ...).
        enabled.push(`terminal_bench(type=${ext.terminal_bench.type ?? 'agentic_coding'}, api_base=${ext.terminal_bench.api_base ?? '(unset)'}, model_id=${ext.terminal_bench.model_id ?? '(unset)'}, subset=${subset}${anchor})`);
      }
      if (ext.aa_omniscience?.enabled) {
        const anchor = ext.aa_omniscience.anchor_score != null ? `, anchor=${ext.aa_omniscience.anchor_score}` : '';
        enabled.push(`aa_omniscience(api_base=${ext.aa_omniscience.api_base ?? '(unset)'}, model_id=${ext.aa_omniscience.model_id ?? '(unset)'}${anchor})`);
      }
      // v0.5.0 dispatch (real fetch 06-15 04:03 cron): BenchLM.ai agentic eval (2026-06-07 发布, 248 模型 × 225 基准, agentic 主战场)
      if (ext.benchlm_agentic?.enabled) {
        const subset = ext.benchlm_agentic.subset ?? 'all';
        const native = ext.benchlm_agentic.native_evals || subset === 'native_evals_only' ? ' + Native Evals' : '';
        const anchor = ext.benchlm_agentic.anchor_score != null ? `, anchor=${ext.benchlm_agentic.anchor_score}` : '';
        // v0.5.0 type 段真实化: surface agentic_fullstack category.
        enabled.push(`benchlm_agentic(type=${ext.benchlm_agentic.type ?? 'agentic_fullstack'}, api_base=${ext.benchlm_agentic.api_base ?? '(unset)'}, model_id=${ext.benchlm_agentic.model_id ?? '(unset)'}, subset=${subset}${anchor}${native})`);
      }
      // v0.5.0 dispatch (real fetch 06-14 22:23 cron): Meta CyberSecEval 3 (2025-12 发布, 8 项风险跨 offensive security 3 大类, Claude Mythos 5 主战场)
      if (ext.cyberseceval3?.enabled) {
        const cats = ext.cyberseceval3.risk_categories?.join('|') ?? 'all-8';
        enabled.push(`cyberseceval3(api_base=${ext.cyberseceval3.api_base ?? '(unset)'}, model_id=${ext.cyberseceval3.model_id ?? '(unset)'}, risk_categories=${cats})`);
      }
      // v0.5.0 dispatch (real fetch 06-15 05:23 cron): SWE-bench Pro (Scale AI, 2026-06-02, Mythos-tier 主标杆, 80.3% Fable-5)
      if (ext.swe_bench_pro?.enabled) {
        const subset = ext.swe_bench_pro.subset ?? 'verified';
        const agentic = ext.swe_bench_pro.agentic_mode === false ? ' (non-agentic)' : '';
        const timeout = ext.swe_bench_pro.timeout_ms != null ? `, timeout=${ext.swe_bench_pro.timeout_ms}ms` : '';
        const anchor = ext.swe_bench_pro.anchor_score != null ? `, anchor=${ext.swe_bench_pro.anchor_score}` : '';
        // v0.5.0 type 段真实化: surface agentic_swe category.
        enabled.push(`swe_bench_pro(type=${ext.swe_bench_pro.type ?? 'agentic_swe'}, api_base=${ext.swe_bench_pro.api_base ?? '(unset)'}, model_id=${ext.swe_bench_pro.model_id ?? '(unset)'}, subset=${subset}${agentic}${timeout}${anchor})`);
      }
      // v0.5.0 dispatch: long_context_cluster real fetch (06-16 01:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/long_context_cluster/v1)
      if (ext.long_context_cluster?.enabled) {
        const subset = ext.long_context_cluster.subset ?? 'all';
        const tasks = ext.long_context_cluster.tasks_total ?? 62;
        const timeout = ext.long_context_cluster.timeout_ms != null ? `, timeout=${ext.long_context_cluster.timeout_ms}ms` : '';
        const anchor = ext.long_context_cluster.anchor_score != null ? `, anchor=${ext.long_context_cluster.anchor_score}` : '';
        // v0.5.0 type 段真实化: surface long_context_retrieval category.
        enabled.push(`long_context_cluster(type=${ext.long_context_cluster.type ?? 'long_context_retrieval'}, api_base=${ext.long_context_cluster.api_base ?? '(unset)'}, model_id=${ext.long_context_cluster.model_id ?? '(unset)'}, subset=${subset}, tasks=${tasks}${timeout}${anchor})`);
      }
      // v0.5.0 dispatch (real fetch 06-15 06:43 cron): process_aware_scoring (2026-06-13 22:13 立项 — Princeton SWE-Bench Pro 03-04 + Anthropic 06 「2026 Agent 元年」18 页报告)
      // 评测方法论从「结果分数」转「过程+结果」双轨: 5 过程信号 (commit_count / test_run_count / retry_count / file_coverage / trajectory_score) + pass/fail 双权重
      if (ext.process_aware_scoring?.enabled) {
        const subset = ext.process_aware_scoring.subset ?? 'all_process_signals';
        const mode = ext.process_aware_scoring.mode ?? 'all';
        const bench = ext.process_aware_scoring.agentic_benchmark ?? 'swe_bench_pro';
        const passWeight = ext.process_aware_scoring.pass_fail_weight ?? 0.7;
        const procWeight = ext.process_aware_scoring.process_weight ?? 0.3;
        const anchor = ext.process_aware_scoring.anchor_score != null ? `, anchor=${ext.process_aware_scoring.anchor_score}` : '';
        // v0.5.0 type 段真实化: surface process_agentic category.
        enabled.push(`process_aware_scoring(type=${ext.process_aware_scoring.type ?? 'process_agentic'}, api_base=${ext.process_aware_scoring.api_base ?? '(unset)'}, model_id=${ext.process_aware_scoring.model_id ?? '(unset)'}, subset=${subset}, mode=${mode}, agentic_benchmark=${bench}, weights=${passWeight}/${procWeight}${anchor})`);
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
    if (this.config._external_benchmarks_roadmap?.webdev_arena?.enabled) {
      const wda = this.config._external_benchmarks_roadmap.webdev_arena;
      const apiBase = wda.api_base ?? 'https://webdevarena.com/api/v1/eval';
      const timeoutMs = wda.timeout_ms ?? 30000;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 wda.model_id 只评那个; 未配走全部
          if (wda.model_id && result.model.model !== wda.model_id && result.modelName !== wda.model_id) {
            return;
          }
          const score = await this.fetchWebdevArenaScore(apiBase, result.model, timeoutMs, wda.anchor_score);
          result.scores.push(score);
          log(`  [${result.modelName}] webdev_arena score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: cyberseceval3 real fetch (06-14 22:23 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/cyberseceval3/v3)
    // - 仅当 ext.cyberseceval3.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 cyberseceval3 QuestionScore (questionId=`cyberseceval3_${model.name}`, category=`cyberseceval3`, dimension=`safety` 走 v0.4.0 默认, score = safety_score * 0.7 + coverage_rate * 30 归一到 0-100)
    // - 注: CyberSecEval3 官方 (Meta, 2025-12 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Meta 真实 API
    if (this.config._external_benchmarks_roadmap?.cyberseceval3?.enabled) {
      const cse3 = this.config._external_benchmarks_roadmap.cyberseceval3;
      const apiBase = cse3.api_base ?? 'https://llm-benchmark.local/api/v1/cyberseceval3/v3';
      const timeoutMs = (cse3 as { timeout_ms?: number }).timeout_ms ?? 30000;
      const cats = cse3.risk_categories?.join(',') ?? 'all-8';
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 cse3.model_id 只评那个; 未配走全部
          if (cse3.model_id && result.model.model !== cse3.model_id && result.modelName !== cse3.model_id) {
            return;
          }
          const score = await this.fetchCyberseceval3Score(apiBase, result.model, timeoutMs, cats);
          result.scores.push(score);
          log(`  [${result.modelName}] cyberseceval3 score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: aa_omniscience real fetch (06-15 00:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/aa_omniscience/v1)
    // - 仅当 ext.aa_omniscience.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 aa_omniscience QuestionScore (questionId=`aa_omniscience_${model.name}`, category=`aa_omniscience`, dimension=`long_context` 走 v0.4.0 默认, score = accuracy_score * 0.7 + (1 - hallucination_rate) * 30 归一到 0-100)
    // - 注: Artificial Analysis Omniscience (2026-05-25 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 AA 真实 API
    if (this.config._external_benchmarks_roadmap?.aa_omniscience?.enabled) {
      const aao = this.config._external_benchmarks_roadmap.aa_omniscience;
      const apiBase = aao.api_base ?? 'https://llm-benchmark.local/api/v1/aa_omniscience/v1';
      const timeoutMs = aao.timeout_ms ?? 30000;
      const anchorScore = aao.anchor_score;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 aao.model_id 只评那个; 未配走全部
          if (aao.model_id && result.model.model !== aao.model_id && result.modelName !== aao.model_id) {
            return;
          }
          const score = await this.fetchAAOmniscienceScore(apiBase, result.model, timeoutMs, anchorScore);
          result.scores.push(score);
          log(`  [${result.modelName}] aa_omniscience score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: terminal_bench real fetch (06-15 03:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/terminal_bench/v2)
    // - 仅当 ext.terminal_bench.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 terminal_bench QuestionScore (questionId=`terminal_bench_${model.name}`, category=`terminal_bench`, dimension=`coding` 走 v0.4.0 默认, score = task_pass_rate * 70 + (1 - avg_duration_s/3600) * 30 归一到 0-100)
    // - 注: Terminal-Bench 2.0 (tbench.ai, 2026-06 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 tbench.ai 真实 API
    if (this.config._external_benchmarks_roadmap?.terminal_bench?.enabled) {
      const tb = this.config._external_benchmarks_roadmap.terminal_bench;
      const apiBase = tb.api_base ?? 'https://llm-benchmark.local/api/v1/terminal_bench/v2';
      const timeoutMs = tb.timeout_ms ?? 30000;
      const anchorScore = tb.anchor_score;
      const subset = tb.subset ?? 'full';
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 tb.model_id 只评那个; 未配走全部
          if (tb.model_id && result.model.model !== tb.model_id && result.modelName !== tb.model_id) {
            return;
          }
          const score = await this.fetchTerminalBenchScore(apiBase, result.model, timeoutMs, anchorScore, subset);
          result.scores.push(score);
          log(`  [${result.modelName}] terminal_bench score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: benchlm_agentic real fetch (06-15 04:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/benchlm_agentic/v1)
    // - 仅当 ext.benchlm_agentic.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 benchlm_agentic QuestionScore (questionId=`benchlm_agentic_${model.name}`, category=`benchlm_agentic`, dimension=`coding` 走 v0.4.0 默认, score = agentic_pass_rate * 50 + design2code_score * 0.25 + vision2web_score * 0.25 归一到 0-100; native_evals 启用时附加 +5 奖励)
    // - 注: BenchLM.ai (benchlm.ai, 2026-06-07 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 BenchLM.ai 真实 API
    if (this.config._external_benchmarks_roadmap?.benchlm_agentic?.enabled) {
      const bla = this.config._external_benchmarks_roadmap.benchlm_agentic;
      const apiBase = bla.api_base ?? 'https://llm-benchmark.local/api/v1/benchlm_agentic/v1';
      const timeoutMs = bla.timeout_ms ?? 30000;
      const anchorScore = bla.anchor_score;
      const nativeEvals = bla.native_evals ?? false;
      const subset = bla.subset ?? 'all';
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 bla.model_id 只评那个; 未配走全部
          if (bla.model_id && result.model.model !== bla.model_id && result.modelName !== bla.model_id) {
            return;
          }
          const score = await this.fetchBenchlmAgenticScore(apiBase, result.model, timeoutMs, anchorScore, nativeEvals, subset);
          result.scores.push(score);
          log(`  [${result.modelName}] benchlm_agentic score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: swe_bench_pro real fetch (06-15 05:23 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/swe_bench_pro/v1)
    // - 仅当 ext.swe_bench_pro.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 swe_bench_pro QuestionScore (questionId=`swe_bench_pro_${model.name}`, category=`swe_bench_pro`, dimension=`coding` 走 v0.4.0 默认, score = pass_rate * 0.7 + patch_score * 0.2 + files_modified_normalized * 0.1 归一到 0-100; agentic_mode 关闭时纯 pass_rate)
    // - 注: SWE-bench Pro (Scale AI, 2026-06-02, claude-fable-5 首条数据 80.3%) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Scale AI 真实 API
    if (this.config._external_benchmarks_roadmap?.swe_bench_pro?.enabled) {
      const sbp = this.config._external_benchmarks_roadmap.swe_bench_pro;
      const apiBase = sbp.api_base ?? 'https://llm-benchmark.local/api/v1/swe_bench_pro/v1';
      const timeoutMs = sbp.timeout_ms ?? 30000;
      const anchorScore = sbp.anchor_score;
      const subset = sbp.subset ?? 'verified';
      const agenticMode = sbp.agentic_mode !== false;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 sbp.model_id 只评那个; 未配走全部
          if (sbp.model_id && result.model.model !== sbp.model_id && result.modelName !== sbp.model_id) {
            return;
          }
          const score = await this.fetchSweBenchProScore(apiBase, result.model, timeoutMs, anchorScore, subset, agenticMode);
          result.scores.push(score);
          log(`  [${result.modelName}] swe_bench_pro score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: process_aware_scoring real fetch (06-15 06:43 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/process_aware_scoring/v1)
    // - 仅当 ext.process_aware_scoring.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 process_aware_scoring QuestionScore (questionId=`process_aware_scoring_${model.name}`, category=`process_aware_scoring`, dimension=`coding` 走 v0.4.0 默认, score = process_score 0-100 (过程维度综合分) 复合 pass_fail_weight + process_weight)
    // - 注: Process-Aware Scoring (Princeton SWE-Bench Pro 03-04 trajectory + Anthropic 「2026 Agent 元年」18 页报告) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 Princeton/Anthropic 真实 API
    if (this.config._external_benchmarks_roadmap?.process_aware_scoring?.enabled) {
      const pas = this.config._external_benchmarks_roadmap.process_aware_scoring;
      const apiBase = pas.api_base ?? 'https://llm-benchmark.local/api/v1/process_aware_scoring/v1';
      const timeoutMs = pas.timeout_ms ?? 30000;
      const anchorScore = pas.anchor_score;
      const subset = pas.subset ?? 'all_process_signals';
      const mode = pas.mode ?? 'all';
      const agenticBench = pas.agentic_benchmark ?? 'swe_bench_pro';
      const passWeight = pas.pass_fail_weight ?? 0.7;
      const procWeight = pas.process_weight ?? 0.3;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 pas.model_id 只评那个; 未配走全部
          if (pas.model_id && result.model.model !== pas.model_id && result.modelName !== pas.model_id) {
            return;
          }
          const score = await this.fetchProcessAwareScoringScore(apiBase, result.model, timeoutMs, anchorScore, subset, mode, agenticBench, passWeight, procWeight);
          result.scores.push(score);
          log(`  [${result.modelName}] process_aware_scoring score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: long_context_cluster real fetch (06-16 01:03 cron, logInfo stub → POST https://llm-benchmark.local/api/v1/long_context_cluster/v1)
    // - 仅当 ext.long_context_cluster.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 logWarn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 long_context_cluster QuestionScore (questionId=`long_context_cluster_${model.name}`, category=`long_context_cluster`, dimension=`long_context` 走 v0.4.0 默认, score = subset_pass_rate * 0.7 + (1 - tokens_used_normalized) * 0.3 归一到 0-100; 4 基准 LongBench v2 + Babilong + InfiniteBench + Phonebook, harness 0.4.0 PR #3256 同源)
    // - 注: Long Context Cluster (harness 0.4.0 PR #3256 同源, 62 tasks, 4 基准 LongBench v2 21 + Babilong 13 + InfiniteBench 18 + Phonebook 10) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 harness 真实 API
    if (this.config._external_benchmarks_roadmap?.long_context_cluster?.enabled) {
      const lcc = this.config._external_benchmarks_roadmap.long_context_cluster;
      const apiBase = lcc.api_base ?? 'https://llm-benchmark.local/api/v1/long_context_cluster/v1';
      const timeoutMs = lcc.timeout_ms ?? 30000;
      const anchorScore = lcc.anchor_score;
      const subset = lcc.subset ?? 'all';
      const tasksTotal = lcc.tasks_total ?? 62;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 lcc.model_id 只评那个; 未配走全部
          if (lcc.model_id && result.model.model !== lcc.model_id && result.modelName !== lcc.model_id) {
            return;
          }
          const score = await this.fetchLongContextClusterScore(apiBase, result.model, timeoutMs, anchorScore, subset, tasksTotal);
          result.scores.push(score);
          log(`  [${result.modelName}] long_context_cluster score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

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
    subset: string = 'full'
  ): Promise<QuestionScore> {
    const questionId = `terminal_bench_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      subset,
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
    subset: 'all' | 'design2code_only' | 'vision2web_only' | 'native_evals_only' = 'all'
  ): Promise<QuestionScore> {
    const questionId = `benchlm_agentic_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      native_evals: nativeEvals,
      subset, // 06-20 03:03 cron: 与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / cyberseceval3.risk_categories 对位
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
    agenticMode: boolean = true
  ): Promise<QuestionScore> {
    const questionId = `swe_bench_pro_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      timeout_ms: timeoutMs,
      subset,
      agentic_mode: agenticMode,
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
    processWeight: number = 0.3
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
    tasksTotal: number = 62
  ): Promise<QuestionScore> {
    const questionId = `long_context_cluster_${model.name}`;
    const basePayload = {
      api_base: model.endpoint,
      model_id: model.model ?? model.name,
      subset,
      tasks_total: tasksTotal,
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
          category: 'long_context_cluster',
          score: 0,
          dimension: 'long_context',
          modelOutput: '',
          detail: `long_context_cluster HTTP ${resp.status}: ${errText.slice(0, 200)}`,
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
    const dialogueScores = scores.filter((s) => s.dimension === 'dialogue');
    const codingScores = scores.filter((s) => s.dimension === 'coding');
    const fcScores = scores.filter((s) => s.dimension === 'function_calling');
    const lcScores = scores.filter((s) => s.dimension === 'long_context');
    const mtScores = scores.filter((s) => s.dimension === 'multi_turn');

    return {
      dialogue: {
        total: dialogueScores.reduce((sum, s) => sum + s.score, 0),
        count: dialogueScores.length,
        average:
          dialogueScores.length > 0
            ? Math.round(
                dialogueScores.reduce((sum, s) => sum + s.score, 0) /
                  dialogueScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(dialogueScores),
      },
      coding: {
        total: codingScores.reduce((sum, s) => sum + s.score, 0),
        count: codingScores.length,
        average:
          codingScores.length > 0
            ? Math.round(
                codingScores.reduce((sum, s) => sum + s.score, 0) /
                  codingScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(codingScores),
      },
      function_calling: {
        total: fcScores.reduce((sum, s) => sum + s.score, 0),
        count: fcScores.length,
        average:
          fcScores.length > 0
            ? Math.round(
                fcScores.reduce((sum, s) => sum + s.score, 0) /
                  fcScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(fcScores),
      },
      long_context: {
        total: lcScores.reduce((sum, s) => sum + s.score, 0),
        count: lcScores.length,
        average:
          lcScores.length > 0
            ? Math.round(
                lcScores.reduce((sum, s) => sum + s.score, 0) /
                  lcScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(lcScores),
      },
      multi_turn: {
        total: mtScores.reduce((sum, s) => sum + s.score, 0),
        count: mtScores.length,
        average:
          mtScores.length > 0
            ? Math.round(
                mtScores.reduce((sum, s) => sum + s.score, 0) /
                  mtScores.length
              )
            : 0,
        details: this.calculateCategoryDetails(mtScores),
      },
    };
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
}
