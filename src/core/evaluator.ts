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
import { getAllCodeBenchmarks } from '../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../benchmarks/multi-turn';

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
   * 参考:
   *   - DigitalApplied "LLM Benchmark Methodology 2026: Reading Leaderboards"
   *     https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide
   */
  async run(): Promise<EvaluationResult[]> {
    console.log(`\n开始并行评测 ${this.config.models.length} 个模型...`);

    // v0.5.0+ 外部基准 dispatch 路由入口 (沿 06-09 23:03 ROADMAP 段从示例到实现)
    // PR 进度 (2026-06-15 03:03): type 段 ✅ 全 18 项 / dispatch stub ✅ 8 项 / **4 项 real fetch** (webdev_arena 06-14 03:23 cron + cyberseceval3 06-14 22:23 cron + aa_omniscience 06-15 00:03 cron + **terminal_bench 06-15 03:03 cron**, 沿 webdev_arena 模式 POST + timeout/4xx/5xx 三段 try/catch + scores[] 注入, 4/8 真实化) / web 钩子点 JSDoc ✅ (06-12 01:03) / 真完整 PR 估 30-45min
    // 完整 PR 在后续 cron 轮次累进: 各平台 fetch + adapter + 评分聚合
    const webdevArenaFetchTasks: Array<Promise<void>> = [];
    if (this.config._external_benchmarks_roadmap) {
      const ext = this.config._external_benchmarks_roadmap;
      const enabled: string[] = [];
      if (ext.webdev_arena?.enabled) {
        enabled.push(`webdev_arena(api_base=${ext.webdev_arena.api_base ?? '(unset)'}, model_id=${ext.webdev_arena.model_id ?? '(unset)'})`);
      }
      if (ext.terminal_bench?.enabled) {
        const anchor = ext.terminal_bench.anchor_score != null ? `, anchor=${ext.terminal_bench.anchor_score}` : '';
        enabled.push(`terminal_bench(api_base=${ext.terminal_bench.api_base ?? '(unset)'}, model_id=${ext.terminal_bench.model_id ?? '(unset)'}${anchor})`);
      }
      if (ext.aa_omniscience?.enabled) {
        const anchor = ext.aa_omniscience.anchor_score != null ? `, anchor=${ext.aa_omniscience.anchor_score}` : '';
        enabled.push(`aa_omniscience(api_base=${ext.aa_omniscience.api_base ?? '(unset)'}, model_id=${ext.aa_omniscience.model_id ?? '(unset)'}${anchor})`);
      }
      // v0.5.0 dispatch stub: BenchLM.ai agentic eval (2026-06-07 发布, 248 模型 × 225 基准, agentic 主战场)
      if (ext.benchlm_agentic?.enabled) {
        const native = ext.benchlm_agentic.native_evals ? ' + Native Evals' : '';
        enabled.push(`benchlm_agentic(api_base=${ext.benchlm_agentic.api_base ?? '(unset)'}, model_id=${ext.benchlm_agentic.model_id ?? '(unset)'}${native})`);
      }
      // v0.5.0 dispatch stub: Meta CyberSecEval 3 (2025-12 发布, 8 项风险跨 offensive security 3 大类, Claude Mythos 5 主战场)
      if (ext.cyberseceval3?.enabled) {
        const cats = ext.cyberseceval3.risk_categories?.join('|') ?? 'all-8';
        enabled.push(`cyberseceval3(api_base=${ext.cyberseceval3.api_base ?? '(unset)'}, model_id=${ext.cyberseceval3.model_id ?? '(unset)'}, risk_categories=${cats})`);
      }
      // v0.5.0 dispatch stub: SWE-bench Pro (Scale AI, 2026-06-02, Mythos-tier 主标杆, 80.3% Fable-5)
      if (ext.swe_bench_pro?.enabled) {
        const subset = ext.swe_bench_pro.subset ?? 'verified';
        const agentic = ext.swe_bench_pro.agentic_mode === false ? ' (non-agentic)' : '';
        const anchor = ext.swe_bench_pro.anchor_score != null ? `, anchor=${ext.swe_bench_pro.anchor_score}` : '';
        enabled.push(`swe_bench_pro(api_base=${ext.swe_bench_pro.api_base ?? '(unset)'}, model_id=${ext.swe_bench_pro.model_id ?? '(unset)'}, subset=${subset}${agentic}${anchor})`);
      }
      // v0.5.0 dispatch stub: long_context_cluster (62 tasks, 4 基准 LongBench v2 + Babilong + InfiniteBench + Phonebook; harness 0.4.0 PR #3256 同源)
      if (ext.long_context_cluster?.enabled) {
        const subset = ext.long_context_cluster.subset ?? 'all';
        const tasks = ext.long_context_cluster.tasks_total ?? 62;
        const anchor = ext.long_context_cluster.anchor_score != null ? `, anchor=${ext.long_context_cluster.anchor_score}` : '';
        enabled.push(`long_context_cluster(api_base=${ext.long_context_cluster.api_base ?? '(unset)'}, model_id=${ext.long_context_cluster.model_id ?? '(unset)'}, subset=${subset}, tasks=${tasks}${anchor})`);
      }
      // v0.5.0 dispatch stub: process_aware_scoring (2026-06-13 22:13 立项 — Princeton SWE-Bench Pro 03-04 + Anthropic 06 「2026 Agent 元年」18 页报告)
      // 评测方法论从「结果分数」转「过程+结果」双轨: 5 过程信号 (commit_count / test_run_count / retry_count / file_coverage / trajectory_score) + pass/fail 双权重
      if (ext.process_aware_scoring?.enabled) {
        const mode = ext.process_aware_scoring.mode ?? 'all';
        const bench = ext.process_aware_scoring.agentic_benchmark ?? 'swe_bench_pro';
        const passWeight = ext.process_aware_scoring.pass_fail_weight ?? 0.7;
        const procWeight = ext.process_aware_scoring.process_weight ?? 0.3;
        const anchor = ext.process_aware_scoring.anchor_score != null ? `, anchor=${ext.process_aware_scoring.anchor_score}` : '';
        enabled.push(`process_aware_scoring(api_base=${ext.process_aware_scoring.api_base ?? '(unset)'}, model_id=${ext.process_aware_scoring.model_id ?? '(unset)'}, mode=${mode}, agentic_benchmark=${bench}, weights=${passWeight}/${procWeight}${anchor})`);
      }
      // v0.5.0 model_id routing hint (2026-06-11): Mythos-class 模型 `claude-fable-5` (Anthropic GA, 2026-06-09)
      // 已知默认走 cyberseceval3 (suite=both) → LiveCodeBench/Terminal-Bench 路径; 也可显式配 `model_id: 'claude-fable-5'`
      // 见 README 「路线图 / Roadmap (v0.5.0 candidates)」表 Mythos-class 模型接入 段
      if (enabled.length > 0) {
        console.info(`[v0.5.0 dispatch skeleton] external benchmarks enabled: ${enabled.join('; ')} (skeleton only — webdev_arena + cyberseceval3 + aa_omniscience + terminal_bench 已升级为 real fetch, 其余 4 项 stub 待后续 cron 轮次累进)`);
      }
    }

    const results = await Promise.all(
      this.config.models.map((model, i) => {
        console.log(`\n启动评测: ${model.name}`);
        return this.evaluateModel(model, i);
      })
    );

    // v0.5.0 dispatch: webdev_arena real fetch (06-14 03:23 cron, console.info stub → POST https://webdevarena.com/api/v1/eval)
    // - 仅当 ext.webdev_arena.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 console.warn + 注入 detail
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
          console.log(`  [${result.modelName}] webdev_arena score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: cyberseceval3 real fetch (06-14 22:23 cron, console.info stub → POST https://llm-benchmark.local/api/v1/cyberseceval3/v3)
    // - 仅当 ext.cyberseceval3.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 console.warn + 注入 detail
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
          console.log(`  [${result.modelName}] cyberseceval3 score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: aa_omniscience real fetch (06-15 00:03 cron, console.info stub → POST https://llm-benchmark.local/api/v1/aa_omniscience/v1)
    // - 仅当 ext.aa_omniscience.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 console.warn + 注入 detail
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
          console.log(`  [${result.modelName}] aa_omniscience score: ${score.score} (${score.detail ?? 'no detail'})`);
        })
      );
    }

    // v0.5.0 dispatch: terminal_bench real fetch (06-15 03:03 cron, console.info stub → POST https://llm-benchmark.local/api/v1/terminal_bench/v2)
    // - 仅当 ext.terminal_bench.enabled && (model_id 匹配或未配 model_id 走全部 model)
    // - 错误处理: timeout / 4xx / 5xx 三段 try/catch, 不阻塞主评测, 仅 console.warn + 注入 detail
    // - 注入: EvaluationResult.scores[] 追加 1 个 terminal_bench QuestionScore (questionId=`terminal_bench_${model.name}`, category=`terminal_bench`, dimension=`coding` 走 v0.4.0 默认, score = task_pass_rate * 70 + (1 - avg_duration_s/3600) * 30 归一到 0-100)
    // - 注: Terminal-Bench 2.0 (tbench.ai, 2026-06 发布) 未提供 public hosted API endpoint, 默认 api_base 为本仓库 stub 端点 (部署者可接自托管适配层), 不调 tbench.ai 真实 API
    if (this.config._external_benchmarks_roadmap?.terminal_bench?.enabled) {
      const tb = this.config._external_benchmarks_roadmap.terminal_bench;
      const apiBase = tb.api_base ?? 'https://llm-benchmark.local/api/v1/terminal_bench/v2';
      const timeoutMs = tb.timeout_ms ?? 30000;
      const anchorScore = tb.anchor_score;
      await Promise.all(
        results.map(async (result) => {
          // model_id 过滤: 配了 tb.model_id 只评那个; 未配走全部
          if (tb.model_id && result.model.model !== tb.model_id && result.modelName !== tb.model_id) {
            return;
          }
          const score = await this.fetchTerminalBenchScore(apiBase, result.model, timeoutMs, anchorScore);
          result.scores.push(score);
          console.log(`  [${result.modelName}] terminal_bench score: ${score.score} (${score.detail ?? 'no detail'})`);
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
    } catch (err) {
      const msg = (err as Error).message || String(err);
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
   * anchor_score 不匹配时 console.warn 警告
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
        console.warn(`  [webdev_arena] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
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
    } catch (err) {
      const msg = (err as Error).message || String(err);
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
        console.warn(`  [aa_omniscience] ⚠️ anchor mismatch for ${model.name}: got ${normalized.toFixed(1)}, expected ~${anchorScore}`);
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
    } catch (err) {
      const msg = (err as Error).message || String(err);
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
    anchorScore?: number
  ): Promise<QuestionScore> {
    const questionId = `terminal_bench_${model.name}`;
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
      const detail = `terminal_bench pass_rate=${(passRate * 100).toFixed(1)}%, avg_duration=${durSec.toFixed(0)}s, score=${normalized.toFixed(1)}${trajPart}`;
      if (anchorScore != null && Math.abs(normalized - anchorScore) > 5) {
        console.warn(`  [terminal_bench] anchor mismatch: model=${model.name} score=${normalized.toFixed(1)} anchor=${anchorScore} (diff > 5)`);
      }
      return {
        questionId,
        category: 'terminal_bench',
        score: Math.round(normalized * 10) / 10,
        dimension: 'coding',
        modelOutput: JSON.stringify(data).slice(0, 500),
        detail,
      };
    } catch (err) {
      const msg = (err as Error).message || String(err);
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
      console.log(
        `  [${model.name}] ${i + 1}/${questions.length}: ${question.id} (${startTime})`
      );

      try {
        const score = await this.evaluateQuestion(question, model);
        scores.push(score);
      } catch (error) {
        console.error(`    评测失败: ${(error as Error).message}`);
        scores.push({
          questionId: question.id,
          category: question.category,
          score: 0,
          dimension: question.type,
          modelOutput: '',
          detail: `评测错误: ${(error as Error).message}`,
        });
      }
    }

    const totalScore = this.calculateTotalScore(scores);
    const dimensions = this.calculateDimensions(scores);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ [${model.name}] 评测完成! 总分: ${totalScore}, 耗时: ${durationSec}s`);

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
      const mtQuestion = question as any;
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
      const codeQuestion = question as any;
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
