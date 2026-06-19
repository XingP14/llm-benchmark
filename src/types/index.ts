// src/types/index.ts - 类型定义

/**
 * v0.5.0+ Mythos-class 模型候选 (string free-form, 2026-06-11)
 * - `claude-fable-5`  Anthropic GA 2026-06-09 (Mythos-class 首公开版, 默认路由 cyberseceval3 suite=both)
 * - `claude-mythos-5` Anthropic 2026-06-09 (Mythos 5, cyberdefenders/US Gov, 路由 cyberseceval3 offensive 优先)
 * 注: ModelConfig.model 是 string, 不改为 union 以保持向后兼容; 路由 hint 在 evaluator.ts v0.5.0 model_id routing hint 注释
 * 见 README 「Mythos-class 模型接入」段
 */

/**
 * 模型配置
 */
export interface ModelConfig {
  /** 模型名称 (显示名) */
  name: string;
  /** API endpoint URL */
  endpoint: string;
  /** API Key */
  apiKey: string;
  /** 模型类型 (用于适配器选择) */
  type: 'openai' | 'anthropic' | 'glm' | 'deepseek' | 'qwen' | 'ollama' | 'custom';
  /** 可选: 具体模型名 (如 gpt-4, gpt-3.5-turbo) */
  model?: string;
  /** 可选: 额外参数 */
  params?: Record<string, any>;
}

/**
 * 评测配置
 */
export interface BenchmarkConfig {
  /** 模型列表 */
  models: ModelConfig[];
  /** 评测维度开关 */
  benchmarks: {
    dialogue: boolean;
    coding: boolean;
    /** v0.4.0+ 新增：工具调用（默认 false，未启用时 reporter 填 -） */
    function_calling?: boolean;
    /** v0.4.0+ 新增：长上下文理解（默认 false，需 32k+ context 模型） */
    long_context?: boolean;
    /** v0.4.0+ 新增：多轮对话一致性（默认 false） */
    multi_turn?: boolean;
  };
  /** 输出目录 */
  output?: string;
  /** 并发数 (默认 3) */
  concurrency?: number;
  /** 评测次数 (默认 1) */
  runs?: number;
  /** v0.5.0+ 外部基准路线图 (roadmap-only, 默认 undefined; PR 进度: type ✅ / dispatch ⏳) */
  _external_benchmarks_roadmap?: ExternalBenchmarkRoadmap;
  /**
   * v0.5.0+ 配套工具 (companion tooling, roadmap-only, 默认 undefined)
   * - guidellm: vLLM-proj SLO-aware benchmark (https://github.com/neuralmagic/guidellm)
   *   用于在 llm-benchmark 评出「模型质量」后, 跑推理服务 SLO sweep (TTFT + 吞吐 + 并发安全区间)
   *   llm-benchmark 评「模型质量」, GuideLLM 评「推理服务 SLO」, 互补不重叠
   */
  companion_tools?: {
    guidellm?: {
      /** GuideLLM 是否已安装 (`guidellm --version` 可用) */
      installed?: boolean;
      /** SLO sweep 配置文件路径 (YAML/JSON; 可选, 缺省用 GuideLLM 默认 sweep) */
      sweep_config?: string;
    };
  };
}

/**
 * 评测题目类型
 */
export interface BenchmarkQuestion {
  /** 题目 ID */
  id: string;
  /** 题目类别 */
  category: string;
  /** 题目内容 */
  content: string;
  /** 参考答案 (用于评分) */
  referenceAnswer?: string;
  /** 评分权重 */
  weight: number;
  /** 评测类型 */
  type: 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';
  /** 额外提示 (给模型的 system prompt) */
  systemPrompt?: string;
}

/**
 * 代码评测专用: 代码测试用例
 */
export interface CodeTestCase {
  /** 输入 */
  input: string;
  /** 期望输出 */
  expectedOutput: string;
  /** 测试描述 */
  description: string;
}

/**
 * 评测结果
 */
export interface EvaluationResult {
  /** 模型名称 */
  modelName: string;
  /** 模型配置 */
  model: ModelConfig;
  /** 各题目得分 */
  scores: QuestionScore[];
  /** 总分 (0-100) */
  totalScore: number;
  /** 各维度得分 */
  dimensions: DimensionScore;
  /** 评测时间 */
  timestamp: Date;
  /** 耗时 (ms) */
  duration: number;
}

/**
 * 单题得分
 */
export interface QuestionScore {
  /** 题目 ID */
  questionId: string;
  /** 题目类别 */
  category: string;
  /** 得分 (0-100) */
  score: number;
  /** 评测维度 */
  dimension: 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn' | 'safety';
  /** 模型输出 */
  modelOutput: string;
  /** 评测详情 (LLM 判定) */
  detail?: string;
}

/**
 * 维度得分
 */
export interface DimensionScore {
  dialogue: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  coding: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  /** v0.4.0+ 新增：工具调用评分汇总（可选，启用 function_calling 评测时存在） */
  function_calling?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  /** v0.4.0+ 新增：长上下文理解评分汇总（可选，启用 long_context 评测时存在） */
  long_context?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
  /** v0.4.0+ 新增：多轮对话一致性评分汇总（可选，启用 multi_turn 评测时存在） */
  multi_turn?: {
    total: number;
    count: number;
    average: number;
    details: Record<string, number>;
  };
}

/**
 * v0.5.0+ 外部基准路线图 (roadmap-only, 沿 06-09 23:03 ROADMAP 段从示例到实现)
 * PR 进度 (2026-06-17 22:03): type 段 ✅ 全 42 项 / dispatch stub ✅ 8 项 / **8 项 real fetch** (webdev_arena 06-14 03:23 cron + cyberseceval3 06-14 22:23 cron + aa_omniscience 06-15 00:03 cron + terminal_bench 06-15 03:03 cron + benchlm_agentic 06-15 04:03 cron + swe_bench_pro 06-15 05:23 cron + process_aware_scoring 06-15 06:43 cron + long_context_cluster 06-16 01:03 cron, 沿 webdev_arena 模式 POST + timeout/4xx/5xx 三段 try/catch + scores[] 注入, 8/8 真实化) / web 钩子点 JSDoc ✅ (06-12 01:03) / **v0.5.0 dispatch PR 完整 (8/8)** + 06-16 03:23 cron type 段 22→23 (aa_agentperf_v1 NVIDIA GB300 20×/MW agentic serving-stack 锚定) + 06-16 22:23 cron type 段 23→28 (Kili 2026 Top 6 维 4 维盲点 + HF OLL v2 首批锚定: arc_agi_3 抽象推理 + gdpval 真实专业工作 + terminal_bench_hard 高难度 terminal agentic + hf_open_llm_leaderboard_v2 open-weights 主战场 + safety_bench_2026_suite Agent-SafetyBench + OS-HARM + CUAHarm 三件套) + 06-17 03:03 cron type 段 28→35 (2026-06 serving 推理新主战场 vLLM MRV2 + SGLang × TRT-LLM DSA NSA backend + DeepSeek V3.2 1M 开源 + Qwen 3.5 / Kimi K2.6 / GLM-5 / MiniMax 2.5 4 开源 SOTA 现役模型首批锚定) + 06-17 04:43 cron type 段 35→37 (2026 Q2 长上下文 / agent memory 双主战场首批锚定: `mrcr_v2_8needle` MRCR v2 8-needle 1M 检索衰减 + `locomo_longmemeval_beam` LoCoMo + LongMemEval + BEAM 跨 session memory 三件套; Claude Opus 4.6 76% / GPT-5.4 36.6% / Gemini 3 Pro 24.5% MRCR v2 + Gemini 3 Deep Think 99% / GPT-5.5 96% / Claude Opus 4.7 89% NIAH-2 single-needle 1M) + 06-17 06:03 cron type 段 37→40 (2026-06 新兴 3 大 leaderboard 首批锚定: `enterpriserag_bench` Onyx EnterpriseRAG-Bench 500K+ docs / 9 enterprise sources / MIT 公开 + `final_bench_metacog` FINAL Bench ALL-Leaderboard 42 LLM × 31 维度 Metacog 自我认知 + `sonar_llm_leaderboard` Sonar Summit 2026-03-04 "correctness ≠ code quality" code quality + security 评测方法论首日信号; Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro + Mythos 5 / Fable 5 / Opus 4.8 / Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout 锚定) + 06-17 22:03 cron type 段 40→42 (2026 Q2 harness 评测双盲点首批锚定: `lm_eval_harness_v0_4_0` EleutherAI 2026-05-12 重大 release: config-based task creation + Jinja2 prompt design + 速度优化 + 4 backend + 60+ 学术基准 + `lm_eval_task_conflict_resolver` CSDN 2026-03-30 任务冲突依赖管理终极指南, [dependency-groups] 自动检测 + numpy/torch/datasets 跨 version resolver, 与 06-13 `lm_eval_harness_v4_config` 形成「harness release 锚定 + 任务冲突自动化解决」对位; 60+ 学术基准跨 task conflict 自动化 resolver = 2026 H2 跨 vendor model 选型基础设施) + 06-17 23:43 cron type 段 42→45 (2026-06 新兴 3 大 leaderboard 首批锚定: `skillvetbench` 2026-05-24 LLM-as-Judge 5 维 SARS (Skill Agentic Risk Score) agent skill 安全审计, ClawHub 52,000 skills 库首日安全审计基础设施, 与 woclaw 23:43 cron OpenClaw v2026.6.8 + SkillVetBench 自审姊妹信号; `frontiermath_v2` Epoch AI 2026-06-12 v2 release, Tiers 1-3 + Tier 4 release, SOTA: GPT-5.5 Pro 87.7% / Claude Fable 5 87.0% / GPT-5.5 85.3% / Claude Opus 4.8 80.0%; `nemotron_3_ultra` NVIDIA 2026-06-04 550B-A55B HF release, 8× B200 BF16 chunked prefill + MTP, RULER 1M 94.7% 业内 1M 检索新高 / AA-LCR 65.4% / Tau2 76.9%) + 06-18 03:03 cron type 段 45→47 (2026 H1 评测 harness 多模态 + config-driven 范式转折 + LiveBench contamination-free refresh 双对位首批锚定: `lm_eval_harness_v0_5_0` EleutherAI 2026 H1 重大 release, hf-multimodal + vllm-vlm model types 首批支持 + MMMU 多模态任务首批 prototype + config-driven task creation (YAML) + Jinja2 prompt + MPS Apple Silicon 支持 + 内部重构 + 评估效率 5×+, 「harness 从纯文本 few-shot eval → 多模态 + config-driven + serving 加速」三转折首批锚定, Fable 5 + Opus 4.8 + Mythos 5 + GPT-5.5 + Gemini 3.1 Pro 5 模型锚定; `livebench_2026_06_refresh` LiveBench 2026 H1 contamination-free quarterly refresh, Integrals with Game 数学新任务 + Logic with Navigation 数据分析新任务 + math_comp + olympiad 最新数学竞赛题刷新 + connections + instruction_following 抗污染 puzzles 刷新, Fable 5 + Opus 4.8 + Mythos 5 3 模型锚定; 与 06-17 06:43 Gemma 4 12B encoder-free (on-device 多模态) + 06-15 23:43 Coding Agent Index (model+harness) + 06-16 03:23 AA-AgentPerf (serving-stack) + 06-17 04:43 MRCR v2 (1M 检索) 形成「harness 多模态 × 抗污染 × serving × on-device 多模态 × model+harness × serving-stack × 1M 检索」7 维评测范式信号网) + 06-18 22:03 cron type 段 45→46 (AA-AgentPerf v2 (agentic workloads) 首批锚定: 2026-06-14 Artificial Analysis launch AA-AgentPerf v2, 3 维度 active coding agents × concurrent sessions × GPU utilization, **NVIDIA Blackwell GB300 20x perf/MW over HGX H200**, NVL72 全 GPU 利用率跨并发 agent sessions, Rubin 临近 launch; 6 模型锚定 (claude-opus-4.8 / claude-fable-5 / claude-mythos-5 / gpt-5.4 / gpt-5.5 / deepseek-v4-pro) + 4 GPU 锚定 (blackwell_gb300 / blackwell_gb200 / hgx_h200 / h100); AA 7 维评测矩阵 (Intelligence × Speed × Price × Coding Agents × TTS × Personalized Recommender × AgentPerf) 第 7.5 维 agentic workloads GPU 维度; 2026 Q3-Q4 agentic inference 部署关键基础设施; 与 woclaw 06-18 22:03 cron Claude Design /design 桥接 + 06-18 05:03 ClawHub 52.7k tools 中国可发现性 形成「评测工具 (AA 7.5 维 + Blackwell GB300 20x perf/MW) × 部署工具 (Claude Design /design + ClawHub 50k+ marketplace)」姊妹信号, 双项目同日 push) + 06-19 01:03 cron type 段 46→48 (2026 H1 LiveBench contamination-free quarterly v3 + Artificial Analysis Stirrup 跨 Python+TypeScript 双语言 agent framework 双主战场首批锚定: `livebench_2026_h1_quarterly_v3` LiveBench 2026-06-09 仍在 commit + 2026 H1 已完成 1 月 + 4 月 + 6 月 3 次 quarterly refresh (3.5-month cadence), 06 月 leaderboard SOTA: GPT-5.5 Thinking xHigh Effort 87.71 / GPT-5.4 Thinking xHigh Effort 88.12 / Claude 4.6 Opus Thinking High Effort 88.67 / Claude 4.5 Opus Thinking High Effort 80.09 / Kimi K2.6 Thinking 79.38 / Kimi K2.5 Thinking 75.96; 新题抗污染: Integrals with Game (博弈论+积分融合) + Logic with Navigation (逻辑+2D 空间导航) + math_comp/olympiad 最新数学竞赛题 + connections/instruction_following 抗污染 puzzles 刷新; `artificial_analysis_stirrup_agent_framework_v1` AA Stirrup 2026-06-09 公开, MIT 433 stars Python + 16 stars TypeScript 跨语言 agent framework, 跨 Python+TypeScript 双语言, 与 06-18 22:03 `aa_agentperf_v2` (评测) + 06-18 05:03 `aa_coding_agent_bench` (评测) + 06-18 03:03 `livebench_2026_06_refresh` (LiveBench quarterly v2) 形成「**评测 × 框架**」姊妹 — AA 从「评测机构 → 评测+框架双角色」范式转折; Fable 5 + Opus 4.8 + Mythos 5 + GPT-5.5 + Kimi K2.6 5 模型锚定; 与 woclaw 06-19 00:23 cron alirezarezvani 1042 commits 跨 8 平台 + anthropics/skills 06-10 vault + ClawHub Freemium 商业化形成「**评测工具 (LiveBench v3 + AA Stirrup v1 + AA 7.5 维) × 部署工具 (alirezarezvani 1042 commits 跨 8 平台 + ClawHub 商业化 + anthropics vault)**」姊妹信号, 双项目同日 push) — 下一里程碑 v0.6.0
 * — 06-16 01:03 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/long_context_cluster/v1`, harness 0.4.0 PR #3256 同源)
 */
export interface ExternalBenchmarkRoadmap {
  /** webdev-arena: 全栈代码生成 + 实时对抗评分 (2026-06 webdevarena.com 24h 窗口期 + Anthropic 「2026 Agent 元年」双信号锚定)
   * — 06-14 03:23 cron: console.info stub → 真实 fetch (`POST https://webdevarena.com/api/v1/eval`)
   * — Response: { elo_score: number; pass_rate: number; eval_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  webdev_arena?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (首条数据, 用作 sanity check) */
    anchor_score?: number;
  };
  /** terminal-bench 2.0: agentic coding (2026-06 tbench.ai 2.0 发布, 100+ 终端任务 / 长程 shell agent 评测, Frontier coding 主战场)
   * — 06-15 03:03 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/terminal_bench/v2`)
   * — Response: { task_pass_rate: number; avg_duration_s: number; trajectory_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  terminal_bench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 选用子集: 'full' (100+ 全量任务, default) | 'hard' (高难度子集, Mythos 顶级模型锚定) | 'lite' (轻量子集, 快速 sanity check) — 与 SWE-bench Pro `subset` 对位, 06-20 02:43 cron 补齐 */
    subset?: 'full' | 'hard' | 'lite';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (首条数据, 用作 sanity check) */
    anchor_score?: number;
  };
  /** AA Omniscience: 知识 + 幻觉评测 (Artificial Analysis 2026-05-25 发布, 200 题目长上下文知识检索 + 幻觉率)
   * — 06-15 00:03 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/aa_omniscience/v1`)
   * — Response: { accuracy_score: number; hallucination_rate: number; eval_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  aa_omniscience?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (首条数据, 用作 sanity check) */
    anchor_score?: number;
  };
  /** BenchLM.ai: agentic eval 24 项 (Design2Code / Vision2Web / Native Evals) — 2026-06-07 发布, 248 模型 × 225 基准
   * — 06-15 04:03 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/benchlm_agentic/v1`)
   * — Response: { agentic_pass_rate: number; design2code_score: number; vision2web_score: number; native_evals_score?: number; eval_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  benchlm_agentic?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 选用子集: 'all' (24 项全量, default) | 'design2code_only' (Design2Code 单维度) | 'vision2web_only' (Vision2Web 单维度) | 'native_evals_only' (Native Evals 单维度, 与 native_evals=true 等价但语义更清晰) — 与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / cyberseceval3.risk_categories 对位, 06-20 03:03 cron 补齐 */
    subset?: 'all' | 'design2code_only' | 'vision2web_only' | 'native_evals_only';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (首条数据, 用作 sanity check) */
    anchor_score?: number;
    /** 是否启用 Native Evals 子集 (默认 false) */
    native_evals?: boolean;
  };
  /** Meta CyberSecEval 3: LLM 安全 / 8 项风险 (offensive security: 自动化社工 / 手动 offensive cyber / 自主 offensive cyber) */
  cyberseceval3?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测风险维度 (default: 全部 8 项) */
    risk_categories?: Array<
      | 'automated_social_engineering'
      | 'manual_offensive_cyber'
      | 'autonomous_offensive_cyber'
    >;
  };
  /** SWE-bench Pro: Scale AI / 后继 Pro 版 agentic SWE 评测 (更长上下文 + 多文件 + 复杂工程任务, Mythos-tier 主标杆)
   * 首条数据: claude-fable-5 = 0.803 (2026-06-09, Stripe 1 天迁移 5000 万行代码)
   * — 06-15 05:23 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/swe_bench_pro/v1`)
   * — Response: { pass_rate: number; patch_score: number; files_modified: number; eval_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  swe_bench_pro?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** Pro 子集选择: 'verified' (全量已验证 Scale AI 任务, default) | 'lite' (轻量子集, 快速 sanity check, ~20% 任务) | 'multilingual' (多语言版 SWE-bench Pro, Python/JS/Go/Rust/Java 跨语言) — subset 决定 dispatch 时实际投递的 task 集合, 锚定分数按 subset 不同 (verified: Mythos 80.3% / Fable 79.1%; lite: Mythos 86.2% / Fable 85.4%; multilingual: Mythos 71.8% / Fable 70.5%) — 与 terminal_bench.subset (full/hard/lite) / benchlm_agentic.subset (all/design2code_only/...) / process_aware_scoring.subset (all_process_signals/commit_metrics/...) / long_context_cluster.subset (all/longbench_v2/...) / cyberseceval3.risk_categories 对位, 06-20 05:03 cron 补齐 */
    subset?: 'verified' | 'lite' | 'multilingual';
    /** 是否启用多文件 / agentic 模式 (default true) */
    agentic_mode?: boolean;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (首条数据, claude-fable-5 = 80.3% ≈ 80.3, 用作 sanity check) */
    anchor_score?: number;
  };
  /** 长上下文评测 cluster (62 tasks, 4 基准): LongBench v2 (21) + Babilong (13) + InfiniteBench (18) + Phonebook (10)
   * — 2026-Q2 EleutherAI/lm-evaluation-harness PR #3256 同源 (Mariani-code 提交, 0 从零开发)
   * — 锚定: GPT-4-128k InfiniteBench KV Retrieval 89.0% / Llama-2-7B LongBench v2 2WikiMQA 32.8% F1 / Llama-2-7B Phonebook Middle 54.2%
   * — 借力 harness 0.4.0 dispatch 集成, Mythos 1M+ / Fable 1M+ / GPT-5.4 1.05M 已商用, 评测必须跟上 */
  long_context_cluster?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 选用子集: 'longbench_v2' (21 tasks, 多领域长文 QA/摘要/dialogue) | 'babilong' (13 tasks, 推理 + 长上下文旅遊 + bAbI QA 继承) | 'infinitebench' (18 tasks, 100K+ 超长上下文检索/摘要) | 'phonebook' (10 tasks, 1M+ 电话簿 mid-context 检索) | 'all' (62 tasks, default) — subset 决定 dispatch 时实际投递的 task 集合, 错定分数按 subset 不同 (longbench_v2: GPT-4-128k 49.5% / babilong: GPT-4-128k 68.4% / infinitebench: GPT-4-128k KV-Retrieval 89.0% / phonebook: Llama-2-7B 54.2% Middle) — 与 terminal_bench.subset (full/hard/lite) / benchlm_agentic.subset (all/design2code_only/...) / process_aware_scoring.subset (all_process_signals/commit_metrics/...) / swe_bench_pro.subset (verified/lite/multilingual) / cyberseceval3.risk_categories 对位, 06-20 05:03 cron 补齐 */
    subset?: 'longbench_v2' | 'babilong' | 'infinitebench' | 'phonebook' | 'all';
    /** 任务总数 (默认 62) */
    tasks_total?: number;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (Llama-2-7B LongBench v2 2WikiMQA 32.8% F1, 用作 sanity check) */
    anchor_score?: number;
  };
  /** GPT-5.5 Thinking xHigh Effort (2026-06 LiveBench 综合分 80.71, 顶级 Thinking 档位首批锚定)
   * — OpenAI 跨 5.4/5.5 双 xHigh 档, 与 Claude 4.6/4.5 Opus Thinking + Kimi K2.6 Thinking 形成 2026 Q2 顶级 Thinking 五强
   * — 锚定: GPT-5.5 Thinking xHigh = 80.71 (LiveBench 6 月 leaderboard, 污染-free 综合) */
  gpt_5_5_thinking_xhigh?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 思考档位: 'low' | 'medium' | 'high' | 'xhigh' (default 'xhigh') */
    effort?: 'low' | 'medium' | 'high' | 'xhigh';
    /** 注入的锚定分数 (LiveBench 综合 80.71, 用作 sanity check) */
    anchor_score?: number;
  };
  /** GPT-5.4 Thinking xHigh Effort (2026-06 LiveBench 综合分 80.28, 1.05M context 商用上下文)
   * — 与 GPT-5.5 xHigh (80.71) 同源双档, OpenAI 顶级 Thinking 阶梯
   * — 锚定: GPT-5.4 Thinking xHigh = 80.28 (LiveBench 6 月 leaderboard, 1.05M context) */
  gpt_5_4_thinking_xhigh?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 思考档位: 'low' | 'medium' | 'high' | 'xhigh' (default 'xhigh') */
    effort?: 'low' | 'medium' | 'high' | 'xhigh';
    /** 注入的锚定分数 (LiveBench 综合 80.28, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Claude 4.6 Opus Thinking High Effort (2026-06 LiveBench 综合分 76.33, 2026-05-29 新)
   * — Anthropic 跨 4.5/4.6 Opus Thinking 双档, 与 4.5 Opus Thinking (75.96) 形成阶梯
   * — 锚定: Claude 4.6 Opus Thinking High = 76.33 (LiveBench 6 月 leaderboard) */
  claude_opus_4_6_thinking?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 思考档位: 'low' | 'medium' | 'high' (default 'high') */
    effort?: 'low' | 'medium' | 'high';
    /** 注入的锚定分数 (LiveBench 综合 76.33, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Claude Mythos 5 1M context (2026-06 Vellum leaderboard, $10/$50 pricing)
   * — Mythos-tier 顶配 1M context, 99% 召回, BenchLM.ai 商用上下文档位首批锚定
   * — 配合 Claude Fable 5 1M+ (96%) + Claude Opus 4.8 1M (95%) 形成 Mythos 1M 三强 */
  claude_mythos_5_1m?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 上下文窗口 (tokens, default 1_048_576 ≈ 1M) */
    context_window?: number;
    /** 注入的锚定分数 (Vellum 1M 综合, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Claude Opus 4.8 1M context (2026-06 Vellum leaderboard, $5/$25 pricing)
   * — Opus 4.8 1M context 商用档, 与 Mythos 5 1M (顶配) + Fable 5 1M (Mythos-class 首公开) 形成 1M 三档
   * — 锚定: Vellum leaderboard 1M context 段 (具体分数见 Vellum) */
  claude_opus_4_8_1m?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 上下文窗口 (tokens, default 1_048_576 ≈ 1M) */
    context_window?: number;
    /** 注入的锚定分数 (Vellum 1M 综合, 用作 sanity check) */
    anchor_score?: number;
  };
  /** vLLM serving benchmark (2026-05-11 vLLM Tops AA Leaderboard + 2026-06-04 Nemotron 3 Ultra day-0)
   * — 2026-05-11 vLLM 博客「vLLM Tops the Artificial Analysis Leaderboard」: vLLM serving 在 DeepSeek V3.2 / MiniMax-M2.5 / Qwen 3.5 397B 跨 12 provider 排名第一, TTFT < 1s @ 10K-token prompts
   * — 2026-06-04 Nemotron 3 Ultra day-0: vLLM 仓库 /benchmarks/benchmark_serving.py — 推理吞吐量 + TTFT + token/s + GPU 利用率 4 维度
   * — 锚定: DeepSeek V3.2 / MiniMax-M2.5 / Qwen 3.5 397B vLLM serving AA 跨 12 provider #1; TTFT < 1s @ 10K-token prompts; benchmark_serving.py 4 评测模式
   * — 借力 vLLM benchmark_serving.py 0 从零开发, leaderboard 主战场已从「单模型推理分数」转「推理服务吞吐量 + GPU 利用率」 */
  vllm_serving_bench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测模式: 'ttft' (Time To First Token) | 'throughput' (tokens/s) | 'gpu_utilization' (GPU 利用率) | 'all' (4 维度, default) */
    mode?: 'ttft' | 'throughput' | 'gpu_utilization' | 'all';
    /** 输入 token 数 (default 10000, 对位 vLLM blog TTFT < 1s @ 10K-token prompts) */
    input_tokens?: number;
    /** 并发请求数 (default 8) */
    concurrent_requests?: number;
    /** 数据集: 'sharegpt' | 'sonnet' | 'custom' (default 'sharegpt', 对位 vLLM benchmark_serving.py 默认) */
    dataset?: 'sharegpt' | 'sonnet' | 'custom';
    /** 注入的锚定分数 (vLLM serving AA 跨 12 provider #1, 用作 sanity check) */
    anchor_score?: number;
  };
  /** process-aware scoring (2026-06-13 22:13 立项 — Princeton SWE-Bench Pro 03-04 + Anthropic 06「2026 Agent 元年」)
   * — 2026-03-04 Princeton SWE-Bench Pro 发布: agentic coding 评测从「修 bug (pass/fail)」走向「复杂 feature 交付 (过程感知)」
   * — 2026-01-16 业内讨论「Coding Agent 评测终于开始关注过程」+ 华泰证券 02-09「Agentic Coding 加速迭代」研报
   * — 2026-06 Anthropic 18 页报告「2026 是 Agent 元年」: 评测必须捕获自主 agent 全过程行为
   * — 锚定: Princeton SWE-Bench Pro trajectory-level + 4 过程信号 (commit count / test run count / retry count / file coverage)
   * — 借力 Princeton SWE-Bench Pro 0 从零开发, 评测方法论话语权已从「结果分数」转「过程+结果」双轨 */
  /** 过程感知评测: agentic 任务「过程+结果」双轨打分 (Princeton SWE-Bench Pro 03-04 trajectory + Anthropic 06 「2026 Agent 元年」18 页报告)
   * 5 过程信号 (commit_count / test_run_count / retry_count / file_coverage / trajectory_score) + pass/fail 双权重
   * 评测方法论从「结果分数」转「过程+结果」双轨: agent 行为全过程 (commit/测试/重试/覆盖率/轨迹) 都被打分
   * — 06-15 06:43 cron: console.info stub → 真实 fetch (`POST https://llm-benchmark.local/api/v1/process_aware_scoring/v1`)
   * — Response: { process_score: number; pass_rate: number; commit_count?: number; test_run_count?: number; retry_count?: number; file_coverage?: number; trajectory_score?: number; eval_id?: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  process_aware_scoring?: {
    enabled: boolean;
    /** API endpoint (沿 webdev_arena / cyberseceval3 同模式, 06-14 22:43 cron 补 2 字段对齐 v0.5.0 dispatch 模式) */
    api_base?: string;
    /** 模型 id (沿 webdev_arena / cyberseceval3 同模式, 06-14 22:43 cron 补 2 字段对齐 v0.5.0 dispatch 模式) */
    model_id?: string;
    /** 选用子集: 'all_process_signals' (5 维全量, default, 与 mode='all' 等价) | 'commit_metrics' (commit_count + file_coverage 双信号, 静态产物维度) | 'runtime_metrics' (test_run_count + retry_count + trajectory_score 三信号, agentic 运行时维度) | 'single' (仅 mode 字段指定的那一维信号) — 与 terminal_bench.subset / swe_bench_pro.subset / long_context_cluster.subset / benchlm_agentic.subset / cyberseceval3.risk_categories 对位, 06-20 04:23 cron 补齐 */
    subset?: 'all_process_signals' | 'commit_metrics' | 'runtime_metrics' | 'single';
    /** 评测模式: 'commit_count' (commit 数量) | 'test_run_count' (测试运行次数) | 'retry_count' (重试次数) | 'file_coverage' (文件覆盖率) | 'trajectory_score' (agentic 轨迹综合分) | 'all' (5 维度, default) — subset='single' 时只取 mode 字段指定的那一维 */
    mode?: 'commit_count' | 'test_run_count' | 'retry_count' | 'file_coverage' | 'trajectory_score' | 'all';
    /** 关联的 agentic 基准: 'swe_bench_pro' (Princeton 默认) | 'terminal_bench' (agentic coding) | 'webdev_arena' (全栈 web dev) */
    agentic_benchmark?: 'swe_bench_pro' | 'terminal_bench' | 'webdev_arena';
    /** pass/fail 权重 (default 0.7, 0-1) */
    pass_fail_weight?: number;
    /** 过程信号权重 (default 0.3, 0-1, 与 pass_fail_weight 合计 1.0) */
    process_weight?: number;
    /** 注入的锚定分数 (Princeton SWE-Bench Pro 03-04 trajectory 维度, 用作 sanity check) */
    anchor_score?: number;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
  };
  /** lm-eval-harness v0.4.0 config-compat (2026-04-23 EleutherAI release, config-based task creation + Jinja2 prompt + HF/vLLM/MPS/GPT-NeoX 4 backend)
   * — 2026-04-23 EleutherAI lm-evaluation-harness v0.4.0: (a) Config-based task creation (YAML config 定义新 task, 无需写 Python src) + 跨项目复用
   * — (b) Jinja2 prompt design + promptsource 互导; (c) 后处理 + 答案提取 + 多代 + few-shot 配; (d) HF/vLLM/MPS/GPT-NeoX 4 backend
   * — (e) 减依赖体积 (Lighter install); (f) CoT BIG-Bench-Hard + Belebele + user-defined task groupings 三新 task
   * — 锚定: HuggingFace Open LLM Leaderboard 6 基准 (HellaSwag 10-shot / MMLU 5-shot / TruthfulQA 0-shot / ARC / Winogrande / GSM8k) + CoT BBH + Belebele 多语言
   * — 借力 lm-eval-harness v0.4.0 0 从零开发, harness 评测门槛降低 10×, 评测方法论主战场从「写 src/task.py」转「写 YAML config」 */
  lm_eval_harness_v4_config?: {
    enabled: boolean;
    /** YAML config 文件路径 (用户自定义 task config, 沿 lm-eval-harness v0.4.0 config-driven 范式) */
    config_path?: string;
    /** 评测 backend: 'hf' (HuggingFace data-parallel) | 'vllm' (推理服务) | 'mps' (Apple Silicon) | 'gpt_neox' | 'all' (4 backend, default) */
    backend?: 'hf' | 'vllm' | 'mps' | 'gpt_neox' | 'all';
    /** Prompt 引擎: 'jinja2' (Jinja2 模板, default) | 'raw' (原始 prompt) | 'promptsource' (Promptsource 互导) */
    prompt_engine?: 'jinja2' | 'raw' | 'promptsource';
    /** Few-shot 配置 (default 5, 对位 HellaSwag 10-shot / MMLU 5-shot / TruthfulQA 0-shot 等 few-shot 范式) */
    fewshot?: number;
    /** 后处理: 'answer_extraction' (答案提取) | 'cot_strip' (CoT 剥离) | 'raw' (不后处理, default) */
    post_process?: 'answer_extraction' | 'cot_strip' | 'raw';
    /** 评测子集: 'arc' | 'hellaswag' | 'mmlu' | 'truthfulqa' | 'winogrande' | 'gsm8k' | 'bbh' | 'belebele' | 'all' (default 'all', 对位 HF OLM 6 基准 + CoT BBH + Belebele 多语言) */
    subset?: 'arc' | 'hellaswag' | 'mmlu' | 'truthfulqa' | 'winogrande' | 'gsm8k' | 'bbh' | 'belebele' | 'all';
    /** 注入的锚定分数 (HF OLM 综合, 用作 sanity check) */
    anchor_score?: number;
  };
  /** HealthBench: 500 items 临床医生对齐评测 (OpenAI 2024 + Nature Medicine 2026-06-12 s41591-026-04431-5 通用 LLM 复用; Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro Preview 三顶级基线锚定; 临床医生写 rubric, 评估模型回答与临床判断对齐度)
   * — 2026-06-15 01:23 cron: type 段首批锚定, 沿 vllm_serving_bench 0 从零开发占位模式 (5min cron 不调真实 HealthBench API, 仅占位) */
  healthbench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子集: 'all' (500 items, default) | 'easy' | 'hard' | 'consensus' */
    subset?: 'all' | 'easy' | 'hard' | 'consensus';
    /** 注入的锚定分数 (Nature Medicine 2026-06-12 通用 LLM 对齐分) */
    anchor_score?: number;
  };
  /** MedQA: 500 questions 医学知识评测 (USMLE 风格 + 多语言; Nature Medicine 2026-06-12 s41591-026-04431-5 通用 LLM 复用; Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro Preview 三顶级基线锚定)
   * — 2026-06-15 01:23 cron: type 段首批锚定 */
  medqa?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子集: 'usmle' (default) | 'taiwan' | 'mainland' */
    subset?: 'usmle' | 'taiwan' | 'mainland';
    /** 注入的锚定分数 (Nature Medicine 2026-06-12 通用 LLM MedQA 正确率) */
    anchor_score?: number;
  };
  /** AA-AgentPerf v1: Artificial Analysis Agentic AI serving-stack 评测 (2026-06-14 发布)
   * — 首个专门评测 agentic AI infrastructure 的 benchmark: "在真实工作负载下, 一个推理部署能同时支持多少活跃 agents" (active agents per deployment, 含并发 agent coding / tool-use / session 切换 / GPU 利用率)
   * — NVIDIA Blackwell GB300 NVL72 相对 HGX H200 跨 20× / MegaWatt 性能领先 (wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/)
   * — 配合 06-15 23:43 coding_agent_index_v1 (model+harness 联合) + metr_v3_task_horizon (agentic 时长跨度) 形成「model + harness + serving stack」三件套完整 agent-stack 评测信号网
   * — 2026 Q2 评测范式从「单 model 分数」转「model + harness + serving stack」三件套, serving stack 是必占位信号
   * — 借力 Artificial Analysis AA-AgentPerf 公开数据 0 从零开发, 真启用需 v0.5.0 dispatch PR 沿 22:23 type stub 模式扩展 (估 30-45min 跨 6-9 轮 cron 累进)
   * — 2026-06-16 03:23 cron: type 段首批锚定 (model+harness+serving-stack 三件套第三腿, NVIDIA GB300 20×/MW 锚定)
   * — 3 评测维度: 'active_agents' (同时活跃 agent 数, default) | 'throughput_per_mw' (每兆瓦吞吐量) | 'gpu_utilization_concurrent' (并发 agent 时 GPU 利用率)
   * — 锚定: NVIDIA GB300 NVL72 vs HGX H200 = 20× / MW (跨多个并发 agent sessions 保持 GPU 满载) */
  aa_agentperf_v1?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测维度: 'active_agents' (同时活跃 agent 数, default) | 'throughput_per_mw' (每兆瓦吞吐量) | 'gpu_utilization_concurrent' (并发 agent 时 GPU 利用率) */
    metric?: 'active_agents' | 'throughput_per_mw' | 'gpu_utilization_concurrent';
    /** 并发 agent session 数 (default 64, 对位 GB300 NVL72 满载) */
    concurrent_sessions?: number;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (NVIDIA GB300 NVL72 20× / MW 领先 HGX H200, 用作 sanity check) */
    anchor_score?: number;
  };
  /** RCQ (Real Clinical Queries): 100 de-identified 实测临床查询 (Nature Medicine 2026-06-12 s41591-026-04431-5 全新发布, 医生在真实临床环境向 LLM 提问去标识化查询; Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro Preview 三顶级基线锚定)
   * — 2026-06-15 01:23 cron: type 段首批锚定, 抢 2026 Q2 medical/clinical leaderboard 话语权 */
  rcq_clinical?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测模式: 'accuracy' (default, 答案准确率) | 'safety' (临床安全) | 'completeness' (回答完整度) | 'all' */
    mode?: 'accuracy' | 'safety' | 'completeness' | 'all';
    /** 注入的锚定分数 (Nature Medicine 2026-06-12 通用 LLM RCQ 综合分) */
    anchor_score?: number;
  };
  /** ARC-AGI-3: 抽象推理 + agentic tasks (2026 arcprize.org/blog/arc-agi-3-launch 发布, Kili 6 维 2026 Top AI Benchmark 之 agent eval 类, 与 GAIA/τ2-Bench/WebArena 同列)
   * — 2026-06-16 22:23 cron: type 段首批锚定 (Kili 2026 6 维 4 维盲点之首, abstract reasoning + agentic 评测)
   * — 锚定: Claude Fable 5 / GPT-5.4 / Claude Mythos 5 */
  arc_agi_3?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测模式: 'abstract' (default, 抽象推理) | 'agentic' (agentic task) | 'both' */
    mode?: 'abstract' | 'agentic' | 'both';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (ARC-AGI-3 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** GDPval: real-world professional work 评测 (OpenAI + 商业 tasks 联合发布, Kili 6 维 2026 Top AI Benchmark 之一, 真实专业工作 vs 学术 benchmark 范式转移信号)
   * — 2026-06-16 22:23 cron: type 段首批锚定 (Kili 6 维 professional work 维, Claude Opus 4.6 / GPT-5.2 / Gemini 3.1 Pro 锚定)
   * — 3 任务模式: 'consulting' | 'law' | 'sales' | 'engineering' | 'all' (default) */
  gdpval?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测任务类别: 'consulting' | 'law' | 'sales' | 'engineering' | 'all' (default) */
    task_category?: 'consulting' | 'law' | 'sales' | 'engineering' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (GDPval 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Terminal-Bench 2.0 hard tier: terminal agentic 高难度任务 (github.com/Terminal-Bench/..., Frontier coding + 长程 shell agent 主战场, Kili 6 维 coding 维)
   * — 2026-06-16 22:23 cron: type 段首批锚定 (Kili 6 维 coding 维 hard tier, Claude Opus 4.6 / GPT-5.4-high 锚定)
   * — 评分模式: 'pass_rate' (default) | 'duration_score' (越快分越高) | 'composite' (pass 70% + speed 30%) */
  terminal_bench_hard?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评分模式: 'pass_rate' (default) | 'duration_score' | 'composite' */
    score_mode?: 'pass_rate' | 'duration_score' | 'composite';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (Terminal-Bench 2.0 hard tier 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** HuggingFace Open LLM Leaderboard v2: open-weights 模型评测主战场 (huggingface.co/open-llm-leaderboard, MMLU-Pro + BBH + 7 hard 基准 bundled, lm-eval-harness v0.4.0 同源)
   * — 2026-06-16 22:23 cron: type 段首批锚定 (Kili 6 维 open-weights 主战场, Qwen 3.5 / DeepSeek V3.2 / Llama 4 Scout 锚定)
   * — 9 基准 bundled: MMLU-Pro + BBH + MuSR + IFEval + MATH + GPQA + MATH-Hard */
  hf_open_llm_leaderboard_v2?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子集: 'all' (default, 9 bundled 基准) | 'mmlu_pro' | 'bbh' | 'musr' | 'ifeval' | 'math' | 'gpqa' | 'math_hard' */
    subset?: 'all' | 'mmlu_pro' | 'bbh' | 'musr' | 'ifeval' | 'math' | 'gpqa' | 'math_hard';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (HF OLL v2 公开 open-weights 前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Safety Bench 2026 Suite: Agent-SafetyBench + OS-HARM + CUAHarm 2026 三件套 (Kili 6 维 safety 维, 2026 顶级 safety 评测集合, 配合 cyberseceval3 单点形成完整 2026 safety 锚)
   * — 2026-06-16 22:23 cron: type 段首批锚定 (Kili 6 维 safety 维三件套, Claude Mythos 5 / GPT-5.4 / Gemini 3.1 Pro 锚定)
   * — 3 子套: 'agent_safety' (Agent-SafetyBench) | 'os_harm' (OS-HARM) | 'cua_harm' (CUAHarm) | 'all' (default) */
  safety_bench_2026_suite?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子套: 'agent_safety' | 'os_harm' | 'cua_harm' | 'all' (default) */
    suite?: 'agent_safety' | 'os_harm' | 'cua_harm' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (2026 safety suite 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** vLLM Model Runner V2 (MRV2): vLLM 0.8.0+ 默认 runner, 解耦 model forward pass + CUDA graph capture + 异步调度 (spheron.network/blog/vllm-model-runner-v2-mrv2-deployment-guide/, 2026 Q2 serving 推理栈新基线)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (serving 推理新主战场 #1, GB200 56% throughput gain, Claude Opus 4.6 / Mythos 5 / DeepSeek V3.2 锚定)
   * — 部署模式: 'gb200' | 'h100' | 'h200' | 'all' (default) */
  vllm_mrv2?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 部署 GPU 模式: 'gb200' (default, Blackwell 56% gain) | 'h100' | 'h200' | 'all' */
    hardware?: 'gb200' | 'h100' | 'h200' | 'all';
    /** 评测模式: 'throughput' (default) | 'latency' | 'gpu_utilization' | 'all' */
    mode?: 'throughput' | 'latency' | 'gpu_utilization' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (vLLM MRV2 GB200 56% throughput gain vs legacy runner, 用作 sanity check) */
    anchor_score?: number;
  };
  /** SGLang × TRT-LLM DSA NSA backend: Native Sparse Attention + TRT-LLM DeepSeek Sparse Attention kernels 集成 (spheron.network/blog/vllm-vs-tensorrt-llm-vs-sglang-benchmarks, --nsa-prefill-backend trtllm + --nsa-decode-backend trtllm 启用, Blackwell 3x-5x speedup on DeepSeek V3.2)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (serving 推理新主战场 #2, 2026 H1 最具突破性 serving 加速信号, DeepSeek V3.2 锚定)
   * — backend 模式: 'trtllm' (default, Blackwell 3-5x) | 'flashinfer' | 'auto' */
  sglang_trtllm_dsa_nsa?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** NSA backend 模式: 'trtllm' (default, Blackwell 3-5x) | 'flashinfer' | 'auto' */
    nsa_backend?: 'trtllm' | 'flashinfer' | 'auto';
    /** 评测阶段: 'prefill' (default) | 'decode' | 'both' */
    phase?: 'prefill' | 'decode' | 'both';
    /** HTTP 请求超时 (ms, default 60000, NSA prefill 长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (SGLang × TRT-LLM DSA NSA Blackwell 3-5x speedup, 用作 sanity check) */
    anchor_score?: number;
  };
  /** DeepSeek V3.2 1.6T MoE 1M long-context: 开源 1M context SOTA 模型 (api-docs.deepseek.com/news/deepseek-v3-2-release, 1.6T total / 49B activated / NSA backend 加速)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (open-weights 1M long-context SOTA, 与 Mythos 5 / Opus 4.8 1M 闭源对位, NSA 加速配合)
   * — 上下文长度: '128k' | '1m' (default) | '2m' */
  deepseek_v3_2_long_context?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 上下文长度: '128k' | '1m' (default) | '2m' */
    context_length?: '128k' | '1m' | '2m';
    /** 评测模式: 'pass_retrieval' (default, 长上下文 needle-in-haystack) | 'pass_reasoning' | 'composite' */
    mode?: 'pass_retrieval' | 'pass_reasoning' | 'composite';
    /** HTTP 请求超时 (ms, default 60000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (DeepSeek V3.2 1M 公开长上下文基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Qwen 3.5 系列: Alibaba 通义千问 3.5 开源 SOTA (qwen.alibaba.com, Qwen3-4B Thinking / 235B A22B Thinking / 397B 全栈, 2026-06 LiveBench 上榜)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (中国系开源 SOTA #1, Qwen3-4B Thinking LiveBench 64.1 / 235B A22B Thinking 62.2 / 397B 全栈上榜)
   * — 评测子模型: 'qwen3_4b_thinking' | 'qwen3_235b_a22b_thinking' | 'qwen3_397b' | 'all' (default) */
  qwen3_5_anchor?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子模型: 'qwen3_4b_thinking' | 'qwen3_235b_a22b_thinking' | 'qwen3_397b' | 'all' (default) */
    sub_model?: 'qwen3_4b_thinking' | 'qwen3_235b_a22b_thinking' | 'qwen3_397b' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (Qwen 3.5 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Kimi K2.6 Thinking: Moonshot AI 月之暗面 K2.6 / K2.5 Thinking 长推理模型 (kimi.com/blog/kimi-k2-6, K2.6 Thinking LiveBench 72.17, K2.5 Thinking 69.07)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (中国系开源 SOTA #2, K2.6 Thinking 72.17 / K2.5 Thinking 69.07 公开锚定)
   * — 评测子模型: 'k2_6_thinking' (default) | 'k2_5_thinking' | 'all' */
  kimi_k2_6_thinking?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子模型: 'k2_6_thinking' (default) | 'k2_5_thinking' | 'all' */
    sub_model?: 'k2_6_thinking' | 'k2_5_thinking' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (Kimi K2.6 / K2.5 Thinking 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** GLM-5 / GLM-5.1: Z.ai 智谱旗舰长 horizon agent workflows 开源模型 (z.ai, GLM-5.1 Coding index 46.5)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (中国系开源 SOTA #3, GLM-5.1 长 horizon agent 锚定, Coding index 46.5)
   * — 评测子模型: 'glm_5_1' (default) | 'glm_5' | 'all' */
  glm_5_anchor?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子模型: 'glm_5_1' (default) | 'glm_5' | 'all' */
    sub_model?: 'glm_5_1' | 'glm_5' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (GLM-5.1 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** MiniMax 2.5 / MiniMax-M2.5: MiniMax 公司新一代开源 SOTA (已被 vLLM 官方支持, 2026 H1 现役开源 SOTA)
   * — 2026-06-17 03:03 cron: type 段首批锚定 (中国系开源 SOTA #4, MiniMax-M2.5 vLLM 官方支持, LiveBench 上榜)
   * — 评测子模型: 'minimax_2_5' (default) | 'minimax_m2_5' | 'all' */
  minimax_2_5_anchor?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子模型: 'minimax_2_5' (default) | 'minimax_m2_5' | 'all' */
    sub_model?: 'minimax_2_5' | 'minimax_m2_5' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (MiniMax 2.5 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Onyx EnterpriseRAG-Bench: 首个开源企业 RAG 评测基准 (onyx-dot-app/EnterpriseRAG-Bench, 2026-06, 500K+ docs / 9 enterprise sources / MIT 协议, 9 类企业数据源 Slack/Notion/Google Drive/Confluence/Jira/GitHub/Linear/Salesforce/HubSpot 真实企业数据)
   * — 2026-06-17 06:03 cron: type 段首批锚定 (RAG 评测从模拟转真实企业数据, Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro Preview 锚定)
   * — 3 任务模式: 'retrieval_accuracy' (default) | 'end_to_end_qa' | 'citation_quality' | 'all' (default) */
  enterpriserag_bench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测模式: 'retrieval_accuracy' (default) | 'end_to_end_qa' | 'citation_quality' | 'all' (default, 三件套 bundled) */
    mode?: 'retrieval_accuracy' | 'end_to_end_qa' | 'citation_quality' | 'all';
    /** 数据源选择: 'slack' | 'notion' | 'gdrive' | 'confluence' | 'jira' | 'github' | 'linear' | 'salesforce' | 'hubspot' | 'all' (default, 9 类企业数据) */
    data_source?: 'slack' | 'notion' | 'gdrive' | 'confluence' | 'jira' | 'github' | 'linear' | 'salesforce' | 'hubspot' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (EnterpriseRAG-Bench 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** FINAL Bench ALL-Leaderboard: 跨 42 LLM × 31 评测领域综合 leaderboard (final-bench/ALL-Bench-Leaderboard, 2026-06, metacog 自我认知「知道自己不知道什么」核心新维度)
   * — 2026-06-17 06:03 cron: type 段首批锚定 (评测范式从「知识」转「自我认知」首日信号, Claude Mythos 5 / Fable 5 / Opus 4.6 锚定)
   * — 8 子基准: MMLU-Pro / GPQA / AIME / HLE / ARC-AGI-2 / SWE-Pro / IFEval / LCB */
  final_bench_metacog?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子集: 'mmlu_pro' | 'gpqa' | 'aime' | 'hle' | 'arc_agi_2' | 'swe_pro' | 'ifeval' | 'lcb' | 'all' (default, 8 子基准 bundled) */
    subset?: 'mmlu_pro' | 'gpqa' | 'aime' | 'hle' | 'arc_agi_2' | 'swe_pro' | 'ifeval' | 'lcb' | 'all';
    /** 评测维度: 'metacog' (default, 自我认知) | 'accuracy' (传统正确率) | 'composite' (metacog + accuracy bundled) */
    dimension?: 'metacog' | 'accuracy' | 'composite';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (FINAL Bench ALL-Leaderboard 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** Sonar LLM Leaderboard: 独立评测 LLM 生成代码 maintainability / technical debt / security vulnerabilities 3 大深层质量 (Sonar Summit 2026-03-04, "correctness ≠ code quality" 2026 评测方法论首日信号)
   * — 2026-06-17 06:03 cron: type 段首批锚定 (评测从 functional correctness 转 code quality + security, Claude Opus 4.6 / GPT-5.4 / Gemini 3.1 Pro 锚定)
   * — 3 评分维度: 'maintainability' (default) | 'security' | 'technical_debt' | 'all' (default) */
  sonar_llm_leaderboard?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评分维度: 'maintainability' (default) | 'security' | 'technical_debt' | 'all' (default, 3 维 bundled) */
    dimension?: 'maintainability' | 'security' | 'technical_debt' | 'all';
    /** 编程语言: 'python' | 'javascript' | 'typescript' | 'java' | 'go' | 'rust' | 'all' (default, 6 语言 bundled) */
    language?: 'python' | 'javascript' | 'typescript' | 'java' | 'go' | 'rust' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (Sonar LLM Leaderboard 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** MRCR v2 8-needle: 2026 最严长上下文多针检索测试 (Anthropic 内部评测 + contextarena.ai 第三方, 1M context 多针检索; yage.ai/share/long-context-benchmark-en-20260315.html)
   * — 2026-06-17 04:43 cron: type 段首批锚定 (2026 Q2 长上下文 1M 检索衰减主战场, Claude Opus 4.6 76% / GPT-5.4 36.6% (512K-1M) / Gemini 3 Pro 24.5%, 揭示「1M 是 capacity 不是 quality」)
   * — 上下文长度: '128k' | '512k' | '1m' (default) | '2m' */
  mrcr_v2_8needle?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 上下文长度: '128k' | '512k' | '1m' (default) | '2m' */
    context_length?: '128k' | '512k' | '1m' | '2m';
    /** 评测模式: 'multi_needle' (default, 8-needle) | 'single_needle' (NIAH-2 配对) | 'composite' (NIAH + MRCR bundled) */
    mode?: 'multi_needle' | 'single_needle' | 'composite';
    /** HTTP 请求超时 (ms, default 60000, 1M context 长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (1M 1.0=Opus 4.6 76% / GPT-5.4 36.6% / Gemini 3 Pro 24.5%, NIAH-2 1.0=Gemini 3 Deep Think 99% / GPT-5.5 96% / Opus 4.7 89% / DeepSeek V4-Pro 78%, 用作 sanity check) */
    anchor_score?: number;
  };
  /** LoCoMo + LongMemEval + BEAM (2026 AI Memory Benchmarks 三件套): mem0 2026 状态报告, 区分「1M input 找 fact」vs「assistant 记住 3 周前 user 说的」, 跨 session memory system 评测 (mem0.ai/blog/ai-memory-benchmarks-in-2026)
   * — 2026-06-17 04:43 cron: type 段首批锚定 (2026 H2 跨 session memory 主战场, 与 NIAH/MRCR 检索互补, Claude Fable 5 / Opus 4.8 / Mythos 5 锚定)
   * — 评测子集: 'locomo' | 'longmemeval' | 'beam' | 'all' (default) */
  locomo_longmemeval_beam?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评测子集: 'locomo' | 'longmemeval' | 'beam' | 'all' (default, 三件套 bundled) */
    suite?: 'locomo' | 'longmemeval' | 'beam' | 'all';
    /** 会话时间跨度: '1d' (default) | '1w' | '1m' | '3w' (跨月 agent memory 主战场) */
    session_horizon?: '1d' | '1w' | '1m' | '3w';
    /** 评测模式: 'recall' (default) | 'reasoning' | 'composite' (recall + reasoning bundled) */
    mode?: 'recall' | 'reasoning' | 'composite';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (2026 memory suite 公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** lm_eval_harness_v0_4_0: EleutherAI lm-evaluation-harness v0.4.0 重大 release 锚定 (2026-05-12 config-based task creation + Jinja2 prompt design + 速度优化 + 4 backend + 60+ 学术基准, 2026 H1 harness 评测范式转折)
   * — 06-17 22:03 cron: type 段锚定, 与 06-13 `lm_eval_harness_v4_config` (config YAML 加载 stub) 形成「harness release 锚定 + 任务 config 加载」对位
   * — Response (POST https://api.lm-eval-harness.local/v0.4.0/run): { yaml_config_hash: string; tasks_completed: string[]; scores: Record<string, number>; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  lm_eval_harness_v0_4_0?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** harness 配置文件路径 (YAML, 60+ 学术基准 bundled, e.g. MMLU / MMLU-Pro / GPQA / GSM8K / MATH / HumanEval / MBPP / BBH / DROP / HellaSwag / ARC / TruthfulQA / IFEval / LCB / SWE-Bench) */
    config_path?: string;
    /** 后端: 'hf' (HuggingFace, default) | 'vllm' (vLLM serving) | 'mps' (Apple Silicon) | 'gpt_neox' */
    backend?: 'hf' | 'vllm' | 'mps' | 'gpt_neox';
    /** prompt 模板: 'jinja2' (default, v0.4.0 新) | 'promptsource' | 'raw' */
    prompt_engine?: 'jinja2' | 'promptsource' | 'raw';
    /** few-shot 数量 (default 5) */
    fewshot?: number;
    /** 后处理: 'output_extraction' (default) | 'answer_extraction' | 'none' */
    post_process?: 'output_extraction' | 'answer_extraction' | 'none';
    /** 评测子集: 'arc' (default) | 'hellaswag' | 'mmlu' | 'mmlu_pro' | 'truthfulqa' | 'winogrande' | 'gsm8k' | 'all' */
    subset?: 'arc' | 'hellaswag' | 'mmlu' | 'mmlu_pro' | 'truthfulqa' | 'winogrande' | 'gsm8k' | 'all';
    /** HTTP 请求超时 (ms, default 60000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (60+ 学术基准公开前沿模型基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** lm_eval_task_conflict_resolver: lm-evaluation-harness 任务冲突依赖管理自动化 (CSDN 2026-03-30 实战痛点, [dependency-groups] 已知冲突组合自动检测 + numpy/torch/datasets 跨 version resolver)
   * — 06-17 22:03 cron: type 段锚定, 跑前 dry-run 验证 + 冲突报告 + 跳过, 与 `lm_eval_harness_v0_4_0` 配对
   * — Response (POST https://llm-benchmark.local/api/v1/lm_eval_task_conflict_resolver/v1): { conflicts_detected: number; resolver_status: 'clean' | 'partial_skip' | 'fail'; skip_tasks: string[]; report_yaml: string; error?: string }
   * — Timeout / 4xx / 5xx 三段 try/catch (不阻塞主评测, 仅 console.warn + 注入 detail) */
  lm_eval_task_conflict_resolver?: {
    enabled: boolean;
    api_base?: string;
    /** 待评测的 task 列表 (e.g. ['acpbench', 'math', 'gsm8k']), 跑前 dry-run 验证版本冲突 */
    tasks?: string[];
    /** resolver 模式: 'dry_run' (default, 仅检测不运行) | 'auto_resolve' (尝试自动解决) | 'report_only' (生成报告) */
    mode?: 'dry_run' | 'auto_resolve' | 'report_only';
    /** 已知冲突版本检测: 'numpy' (default, 1.x vs 2.x) | 'torch' (1.x vs 2.x) | 'datasets' | 'transformers' | 'all' */
    dependency_groups?: 'numpy' | 'torch' | 'datasets' | 'transformers' | 'all';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (已知冲突组合数, 用作 sanity check) */
    anchor_score?: number;
  };
  /** skillvetbench: LLM-as-Judge 5 维 SARS (Skill Agentic Risk Score) agent skill 安全审计 (2026-05-24 snapshot, arXiv 2606.15899, https://huggingface.co/blog/skillvetbench, ClawHub 52,000 skills 库首日安全审计基础设施)
   * — 06-17 23:43 cron: type 段首批锚定 (2026-06 agent skill 安全评测盲点, 与 woclaw 23:43 cron OpenClaw v2026.6.8 + SkillVetBench 自审姊妹信号)
   * — 5 维 SARS: instruction_layer | multi_agent | exfiltration | privilege_escalation | data_poisoning | all
   * — Response (POST https://api.skillvetbench.local/v1/audit): { sars_score: number; per_dim_scores: Record<string, number>; skill_id: string; eval_model: string; error?: string } */
  skillvetbench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 评估模型 (作为 LLM-as-Judge 裁判): 'gpt-5.5' | 'claude-fable-5' | 'claude-opus-4.8' | 'gemini-3.1-pro' | 'deepseek-v4-pro' | 'auto' (default) */
    eval_model?: 'gpt-5.5' | 'claude-fable-5' | 'claude-opus-4.8' | 'gemini-3.1-pro' | 'deepseek-v4-pro' | 'auto';
    /** 评测维度: 'instruction_layer' | 'multi_agent' | 'exfiltration' | 'privilege_escalation' | 'data_poisoning' | 'all' (default) */
    dimension?: 'instruction_layer' | 'multi_agent' | 'exfiltration' | 'privilege_escalation' | 'data_poisoning' | 'all';
    /** SkillVetBench snapshot date (default "2026-05-24") */
    snapshot_date?: string;
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (ClawHub 52k skills 首日审计基线, 用作 sanity check) */
    anchor_score?: number;
  };
  /** frontiermath_v2: Epoch AI FrontierMath v2 (2026-06-12 release, Tiers 1-3 + Tier 4 release, 修正并移除 problem items, research-level 私有问题)
   * — 06-17 23:43 cron: type 段首批锚定 (2026-06 顶级模型 expert math 评测新主战场, SOTA: GPT-5.5 Pro xhigh 87.7% / Claude Fable 5 max 87.0% / GPT-5.5 xhigh 85.3% / Claude Opus 4.8 80.0% / GPT-5.4 xhigh 78.6%)
   * — 难度梯度: 't1' | 't2' | 't3' | 't4' (research-level) | 'all' (default)
   * — Response (POST https://api.frontiermath-v2.local/v1/eval): { tier_score: number; per_tier_scores: Record<string, number>; difficulty_breakdown: Record<string, number>; model_id: string; error?: string } */
  frontiermath_v2?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 难度梯度: 't1' | 't2' | 't3' | 't4' (research-level 私有问题) | 'all' (default, 4 tier bundled) */
    tier?: 't1' | 't2' | 't3' | 't4' | 'all';
    /** 数学难度: 'undergraduate' | 'early_career' | 'research' | 'all' (default) */
    math_difficulty?: 'undergraduate' | 'early_career' | 'research' | 'all';
    /** HTTP 请求超时 (ms, default 60000, Tier 4 私有问题耗时较长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (FrontierMath v2 SOTA 公开基准, GPT-5.5 Pro 87.7% 用作 sanity check) */
    anchor_score?: number;
  };
  /** nemotron_3_ultra: NVIDIA Nemotron-3-Ultra 550B-A55B frontier reasoning (2026-06-04 HF release, https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16, 8× B200 单节点 BF16 chunked prefill + MTP)
   * — 06-17 23:43 cron: type 段首批锚定 (frontier-scale general purpose reasoning and chat, RULER 1M 94.7% 业内 1M 检索新高 / AA-LCR 65.4% / Tau2 76.9% / Longbench v2 ≤1M 61.9% / IFBench 81.7%)
   * — 硬件配置: '8xb200' (default, 单节点) | '8xh200' | '4xb200-single' | 'auto'
   * — Response (POST https://api.nemotron-3-ultra.local/v1/eval): { ruler_1m: number; aa_lcr: number; tau2: number; longbench_v2: number; ifbench: number; model_id: string; error?: string } */
  nemotron_3_ultra?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 硬件配置: '8xb200' (default, 单节点 8× B200) | '8xh200' (Hopper) | '4xb200-single' (4 卡) | 'auto' */
    hardware?: '8xb200' | '8xh200' | '4xb200-single' | 'auto';
    /** 上下文长度: '128k' | '256k' | '512k' | '1m' (default, 业内 1M 检索新高) */
    context_length?: '128k' | '256k' | '512k' | '1m';
    /** HTTP 请求超时 (ms, default 60000, 1M 推理耗时较长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (RULER 1M 94.7% 公开基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** lm_eval_harness_v0_5_0: EleutherAI/lm-evaluation-harness v0.4.0 → v0.5.0 (2026 H1 release, https://github.com/EleutherAI/lm-evaluation-harness, gitee 镜像 2026-03-22 同步 + GitHub 04-09 commit)
   * — 06-18 03:03 cron: type 段首批锚定 (harness 2026 H1 范式转折: hf-multimodal + vllm-vlm model types 首批支持 + MMMU 多模态任务首批 prototype + config-driven task creation (YAML) + Jinja2 prompt + MPS Apple Silicon 支持 + 内部重构 + 评估效率 5×+)
   * — 任务类别: 'multimodal' (MMMU 多模态) | 'reasoning' (MMLU-Pro / GPQA / ARC-AGI-2 / AIME) | 'knowledge' (TriviaQA / NaturalQS) | 'long_context' (MRCR / NIAH / LongBench) | 'all'
   * — model_type: 'hf-multimodal' (text+image 输入) | 'vllm-vlm' (vLLM serving VLM) | 'hf-causal' (纯文本) | 'all'
   * — config_format: 'yaml' (config-driven task creation) | 'jinja2' (Jinja2 prompt) | 'all'
   * — 5 模型锚定: claude-fable-5 + claude-opus-4.8 + claude-mythos-5 + gpt-5.5 + gemini-3.1-pro-preview
   * — Response (POST https://api.lm-eval-harness.local/v1/eval): { mmlu_pro: number; gsm8k: number; mmlu_score: number; mmlu_pro_score: number; eval_model: string; error?: string } */
  lm_eval_harness_v0_5_0?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** 任务类别: 'multimodal' (MMMU 多模态) | 'reasoning' (MMLU-Pro/GPQA/ARC-AGI-2/AIME) | 'knowledge' (TriviaQA/NaturalQS) | 'long_context' (MRCR/NIAH/LongBench) | 'all' */
    task_categories?: 'multimodal' | 'reasoning' | 'knowledge' | 'long_context' | 'all';
    /** model_type: 'hf-multimodal' (text+image 输入) | 'vllm-vlm' (vLLM serving VLM) | 'hf-causal' (纯文本) | 'all' */
    model_type?: 'hf-multimodal' | 'vllm-vlm' | 'hf-causal' | 'all';
    /** config_format: 'yaml' (config-driven task creation) | 'jinja2' (Jinja2 prompt) | 'all' */
    config_format?: 'yaml' | 'jinja2' | 'all';
    /** HTTP 请求超时 (ms, default 60000, 1M 推理耗时较长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (MMMU 公开基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** livebench_2026_06_refresh: LiveBench 2026 H1 contamination-free quarterly refresh (https://github.com/LiveBench/LiveBench/blob/main/changelog.md, 2026-01-08 + 06 月 patch)
   * — 06-18 03:03 cron: type 段首批锚定 (2026 H1 contamination-resistant benchmark 范式首批锚定 + 抗污染机制首日信号: Integrals with Game 数学新任务 + Logic with Navigation 数据分析新任务 + math_comp + olympiad 用最新数学竞赛题刷新 + instruction following 任务用最新 puzzles 刷新 + connections 任务用最新 puzzles 刷新)
   * — task: 'integrals_with_game' (博弈论+积分计算融合) | 'logic_with_navigation' (逻辑题+2D 空间导航) | 'math_comp' (最新数学竞赛题刷新) | 'olympiad' (奥数刷新) | 'connections' (拼图刷新) | 'instruction_following' (指令跟随刷新) | 'all'
   * — refresh_date: '2026-01-08' (Q1) | '2026-06-XX' (Q2) | 'auto'
   * — contamination_check: 'enabled' (抗污染机制开启) | 'disabled'
   * — 3 模型锚定: claude-fable-5 + claude-opus-4.8 + claude-mythos-5
   * — Response (POST https://api.livebench.local/v1/refresh): { livebench_score: number; category_scores: Record<string, number>; refresh_date: string; eval_model: string; error?: string } */
  livebench_2026_06_refresh?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** task: 'integrals_with_game' (博弈论+积分计算融合) | 'logic_with_navigation' (逻辑题+2D 空间导航) | 'math_comp' (最新数学竞赛题刷新) | 'olympiad' (奥数刷新) | 'connections' (拼图刷新) | 'instruction_following' (指令跟随刷新) | 'all' */
    task?: 'integrals_with_game' | 'logic_with_navigation' | 'math_comp' | 'olympiad' | 'connections' | 'instruction_following' | 'all';
    /** refresh_date: '2026-01-08' (Q1 refresh) | '2026-06-XX' (Q2 refresh) | 'auto' */
    refresh_date?: '2026-01-08' | '2026-06-XX' | 'auto';
    /** contamination_check: 'enabled' (抗污染机制开启) | 'disabled' */
    contamination_check?: 'enabled' | 'disabled';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (LiveBench 公开基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** AA Coding Agent Benchmarks v1: Artificial Analysis 跨 platform coding agent 评测 (2026-06 launch, https://artificialanalysis.ai/)
   * — 「Introducing the Artificial Analysis Coding Agent Benchmarks, Highlights Intelligence, Speed, Price」+「Explore agents for general work, coding, customer support, and more, Compare AI agents across capabilities, pricing, and platform support」+「Same mission, new look」3 大入口
   * — 跨 Claude Code / Codex / Cursor / Devin / OpenAI Operator / Anthropic / Google Jules 等平台 agentic 评测矩阵, 「personalized model recommender」为首个 model-aware 评测入口
   * — 配合 06-15 23:43 coding_agent_index_v1 (model+harness 联合) + 06-15 22:43 OPeRA (agent 行为模拟) 形成「model + harness + agent 行为 + platform」 4 维 agentic 评测信号网
   * — 2026-06-18 06:23 cron: type 段首批锚定 (Artificial Analysis 2026-06 7 维评测矩阵第三腿, 跨 platform agentic capability 评测)
   * — 7 platform 选 1: claude_code / codex / cursor / devin / openai_operator / anthropic_agent / google_jules
   * — 3 capability 选 1: general_work / coding / customer_support
   * — 5 metric 选 1: intelligence / speed / price / platform_support
   * — 锚定: claude-code vs codex vs cursor vs devin vs openai-operator (5 平台对位, 跨 capability 评分)
   * — Response (POST https://artificialanalysis.ai/api/v1/coding_agent): { capability_score: number; intelligence_index: number; speed_score: number; price_per_task: number; platform_support_score: number; eval_id: string; eval_model: string; error?: string } */
  aa_coding_agent_bench_v1?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** platform: 'claude_code' (Anthropic 官方 Coding CLI) | 'codex' (OpenAI Codex CLI) | 'cursor' (Cursor Composer) | 'devin' (Cognition Devin) | 'openai_operator' (OpenAI Operator) | 'anthropic_agent' (Anthropic Agent SDK) | 'google_jules' (Google Jules async agent) | 'all' (default) */
    platform?: 'claude_code' | 'codex' | 'cursor' | 'devin' | 'openai_operator' | 'anthropic_agent' | 'google_jules' | 'all';
    /** capability: 'general_work' (default) | 'coding' | 'customer_support' | 'all' */
    capability?: 'general_work' | 'coding' | 'customer_support' | 'all';
    /** metric: 'intelligence' (default) | 'speed' | 'price' | 'platform_support' | 'all' */
    metric?: 'intelligence' | 'speed' | 'price' | 'platform_support' | 'all';
    /** HTTP 请求超时 (ms, default 60000, 跨 platform 实测耗时较长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (AA Coding Agent Benchmarks 公开前沿平台基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** AA Text-to-Speech Leaderboard v1: Artificial Analysis TTS 评测 (2026-06-03 launch, https://artificialanalysis.ai/)
   * — 「Fun-Realtime-TTS: New Text to Speech model topping Artificial Analysis leaderboard, 3 Jun」首日信号, 语音合成评测范式锚定
   * — 4 评测维度: latency (实时性) / voice_quality (音色质量) / emotion (情感表现) / language_coverage (语言覆盖) — 4 维 + 5 模型 (Fun-Realtime-TTS / ElevenLabs Turbo / OpenAI Realtime / Google Studio Voice / Claude Voice) 全维度对比
   * — Artificial Analysis 2026 H1 7 维评测矩阵 (Intelligence × Speed × Price × Coding Agents × TTS × Personalized Recommender × platform support) 第 4 腿 TTS 首日错定
   * — 2026-06-18 06:23 cron: type 段首批锚定 (AA TTS leaderboard Fun-Realtime-TTS 2026-06-03 launch 首批错定, 抢 2026 H1 语音合成主战场话语权)
   * — tts_model 5 选 1: fun_realtime_tts (6 月登顶) / elevenlabs_turbo / openai_realtime / google_studio_voice / claude_voice
   * — dimension 5 选 1: latency (default) / voice_quality / emotion / language_coverage
   * — leaderboard_date: '2026-06-03' (TTS launch 错定) | 'auto' (最近一次)
   * — 5 模型错定: Fun-Realtime-TTS vs ElevenLabs Turbo vs OpenAI Realtime vs Google Studio Voice vs Claude Voice (TTS 维度)
   * — Response (POST https://artificialanalysis.ai/api/v1/tts): { tts_score: number; latency_ms: number; voice_quality: number; emotion_score: number; language_coverage: number; tts_model: string; leaderboard_date: string; eval_id: string; error?: string } */
  aa_tts_leaderboard_v1?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** tts_model: 'fun_realtime_tts' (6 月登顶) | 'elevenlabs_turbo' | 'openai_realtime' | 'google_studio_voice' | 'claude_voice' | 'all' (default) */
    tts_model?: 'fun_realtime_tts' | 'elevenlabs_turbo' | 'openai_realtime' | 'google_studio_voice' | 'claude_voice' | 'all';
    /** dimension: 'latency' (default, 实时性) | 'voice_quality' (音色质量) | 'emotion' (情感表现) | 'language_coverage' (语言覆盖) | 'all' */
    dimension?: 'latency' | 'voice_quality' | 'emotion' | 'language_coverage' | 'all';
    /** leaderboard_date: '2026-06-03' (TTS launch) | 'auto' (最近一次) */
    leaderboard_date?: '2026-06-03' | 'auto';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (AA TTS leaderboard Fun-Realtime-TTS 登顶基准, 用作 sanity check) */
    anchor_score?: number;
  };
  /** AA-AgentPerf v2 (agentic workloads): Artificial Analysis 2026-06-14 launch AA-AgentPerf v2 (agentic AI workloads benchmark, https://artificialanalysis.ai/leaderboards/agentperf + https://wccftech.com/nvidia-gb300-dominates-agentic-ai-workloads-20x-performance-leap-over-hopper/)
   * — 评测 "active agents inference deployment can support under realistic workloads": active coding agents × concurrent sessions × GPU utilization 3 维度
   * — **NVIDIA Blackwell GB300 首测登顶 — 20x perf/MW over HGX H200 (Hopper)**, NVL72 全 GPU 利用率跨并发 agent sessions; Rubin (Blackwell 后继) 临近 launch
   * — AA 7 维评测矩阵 (Intelligence Index × Speed × Price × Coding Agents × TTS × Personalized Recommender × AgentPerf) 第 7.5 维 agentic workloads GPU 维度首批锚定
   * — 2026-06-18 22:03 cron: type 段首批锚定 (AA-AgentPerf v2 + Blackwell GB300 20x perf/MW over H200, agentic workloads GPU 维度; 与 06-18 06:23 cron aa_coding_agent_bench_v1 + aa_tts_leaderboard_v1 + 06-16 03:23 aa_agentperf_v1 + 06-16 05:23 aa_intelligence_index 形成「AA 7 维矩阵 + Blackwell GB300 agentic workloads 范式 + 1M 检索 + 跨 session memory + RAG 真实数据 + 自我认知 + code quality + expert-reasoning + skill 安全 + frontier reasoning」30+ 维评测范式信号网)
   * — agent_count 6 选 1: 1 (单 agent baseline) | 4 (low concurrent) | 8 (medium) | 16 (high) | 32 (NVL72 满载) | 64 (extreme scale)
   * — session_mode 4 选 1: single (default) | multi (multi-session per agent) | concurrent (多 agent 并发) | all
   * — gpu_hardware 5 选 1: blackwell_gb300 (default, 20x perf/MW) | blackwell_gb200 | hgx_h200 (Hopper baseline) | h100 (legacy) | auto
   * — workload 4 选 1: agentic_coding (default, AA-AgentPerf 首批 6 月数据) | research_coding (深度研究) | all
   * — 6 模型锚定: claude-opus-4.8 / claude-fable-5 / claude-mythos-5 / gpt-5.4 / gpt-5.5 / deepseek-v4-pro
   * — 4 GPU 锚定: blackwell_gb300 (20x baseline) / blackwell_gb200 / hgx_h200 (1x baseline) / h100
   * — Response (POST https://artificialanalysis.ai/api/v1/agentperf): { active_agents_supported: number; concurrent_sessions: number; gpu_utilization_pct: number; perf_per_mw: number; model_id: string; gpu_hardware: string; eval_id: string; error?: string } */
  aa_agentperf_v2_agentic_workloads?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** agent_count 6 选 1: 1 (单 agent baseline) | 4 (low concurrent) | 8 (medium) | 16 (high) | 32 (NVL72 满载, default) | 64 (extreme scale) */
    agent_count?: 1 | 4 | 8 | 16 | 32 | 64;
    /** session_mode 4 选 1: single (default) | multi | concurrent | all */
    session_mode?: 'single' | 'multi' | 'concurrent' | 'all';
    /** gpu_hardware 5 选 1: blackwell_gb300 (default, 20x perf/MW) | blackwell_gb200 | hgx_h200 (Hopper 1x baseline) | h100 (legacy) | auto */
    gpu_hardware?: 'blackwell_gb300' | 'blackwell_gb200' | 'hgx_h200' | 'h100' | 'auto';
    /** workload 4 选 1: agentic_coding (default, AA-AgentPerf 首批 6 月数据) | research_coding | all */
    workload?: 'agentic_coding' | 'research_coding' | 'all';
    /** HTTP 请求超时 (ms, default 60000, Blackwell GB300 NVL72 满载实测耗时较长) */
    timeout_ms?: number;
    /** 注入的锚定分数 (NVIDIA Blackwell GB300 20x perf/MW over HGX H200, 用作 sanity check) */
    anchor_score?: number;
  };
  /** livebench_2026_h1_quarterly_v3: LiveBench 2026 H1 contamination-free quarterly refresh v3 (https://livebench.ai + https://github.com/LiveBench/LiveBench/blob/main/docs/CONTRIBUTING.md, 06-09 commit)
   * — 06-19 01:03 cron: type 段首批锚定 (2026 H1 contamination-free benchmark quarterly refresh 范式首批锚定: LiveBench 2026 H1 已完成 1 月 + 4 月 + 6 月 3 次 quarterly refresh, 3.5-month cadence; 06 月 leaderboard SOTA: GPT-5.5 Thinking xHigh Effort 87.71 / GPT-5.4 Thinking xHigh Effort 88.12 / Claude 4.6 Opus Thinking High Effort 88.67 / Claude 4.5 Opus Thinking High Effort 80.09 / Kimi K2.6 Thinking 79.38 / Kimi K2.5 Thinking 75.96; 新题抗污染: Integrals with Game (博弈论+积分融合) + Logic with Navigation (逻辑+2D 空间导航) + math_comp/olympiad 最新数学竞赛题刷新 + connections/instruction_following 抗污染 puzzles 刷新)
   * — task: 'integrals_with_game' (博弈论+积分计算融合) | 'logic_with_navigation' (逻辑题+2D 空间导航) | 'math_comp' (最新数学竞赛题刷新) | 'olympiad' (奥数刷新) | 'connections' (拼图刷新) | 'instruction_following' (指令跟随刷新) | 'all'
   * — refresh_cadence: 'quarterly_3_5_month' (default, 1 月 + 4 月 + 6 月 + 9 月 4 次年 refresh) | 'monthly' (月度) | 'auto'
   * — contamination_check: 'enabled' (抗污染机制开启) | 'disabled'
   * — 5 模型锚定: claude-fable-5 + claude-opus-4.8 + claude-mythos-5 + gpt-5.5-thinking-xhigh + kimi-k2.6-thinking
   * — Response (POST https://api.livebench.ai/v1/refresh/v3): { livebench_score: number; category_scores: Record<string, number>; refresh_date: string; eval_model: string; contamination_status: string; error?: string } */
  livebench_2026_h1_quarterly_v3?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** task: 'integrals_with_game' (博弈论+积分计算融合) | 'logic_with_navigation' (逻辑题+2D 空间导航) | 'math_comp' (最新数学竞赛题刷新) | 'olympiad' (奥数刷新) | 'connections' (拼图刷新) | 'instruction_following' (指令跟随刷新) | 'all' */
    task?: 'integrals_with_game' | 'logic_with_navigation' | 'math_comp' | 'olympiad' | 'connections' | 'instruction_following' | 'all';
    /** refresh_cadence: 'quarterly_3_5_month' (default, 1 月 + 4 月 + 6 月 + 9 月 4 次年 refresh) | 'monthly' (月度) | 'auto' */
    refresh_cadence?: 'quarterly_3_5_month' | 'monthly' | 'auto';
    /** contamination_check: 'enabled' (抗污染机制开启) | 'disabled' */
    contamination_check?: 'enabled' | 'disabled';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (LiveBench 06 月 leaderboard SOTA: GPT-5.5 Thinking xHigh 87.71 / Claude 4.6 Opus Thinking High 88.67, 用作 sanity check) */
    anchor_score?: number;
  };
  /** artificial_analysis_stirrup_agent_framework_v1: AA Stirrup 2026-06-09 公开, MIT 433 stars Python + 16 stars TypeScript 跨语言 agent framework (https://github.com/ArtificialAnalysis/Stirrup + https://github.com/ArtificialAnalysis/StirrupJS)
   * — 06-19 01:03 cron: type 段首批锚定 (2026 H1 AA 从「评测机构 → 评测+框架双角色」范式转折首批锚定: AA 官方发布**轻量级 agent 构建框架**, 跨 Python + TypeScript 双语言; 与 06-18 22:03 `aa_agentperf_v2_agentic_workloads` (评测) + 06-18 05:03 `aa_coding_agent_bench_v1` (评测) 形成「**评测 × 框架**」姊妹; 与 06-18 03:03 `livebench_2026_06_refresh` 形成「**contamination-free 评测 + 跨语言 agent framework**」姊妹)
   * — language: 'python' (MIT 433 stars, 42 forks) | 'typescript' (MIT 16 stars) | 'all' (跨语言)
   * — framework_role: 'agent_builder' (default, 轻量级 agent 构建) | 'agent_evaluator' (与 AA 评测对位) | 'both'
   * — stars: 'python_433' (default) | 'typescript_16'
   * — release_date: '2026-06-09' (AA Stirrup public release) | 'auto'
   * — 5 模型锚定: claude-fable-5 + claude-opus-4.8 + claude-mythos-5 + gpt-5.5 + kimi-k2.6-thinking
   * — Response (POST https://api.artificialanalysis.ai/v1/stirrup/v1/agent): { framework_name: string; language: string; agent_capability_score: number; cross_lang_compat: boolean; eval_model: string; release_date: string; error?: string } */
  artificial_analysis_stirrup_agent_framework_v1?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** language: 'python' (MIT 433 stars) | 'typescript' (MIT 16 stars) | 'all' (跨语言) */
    language?: 'python' | 'typescript' | 'all';
    /** framework_role: 'agent_builder' (default, 轻量级 agent 构建) | 'agent_evaluator' (与 AA 评测对位) | 'both' */
    framework_role?: 'agent_builder' | 'agent_evaluator' | 'both';
    /** stars: 'python_433' (default, 2026-06-09) | 'typescript_16' */
    stars?: 'python_433' | 'typescript_16';
    /** release_date: '2026-06-09' (AA Stirrup public release) | 'auto' */
    release_date?: '2026-06-09' | 'auto';
    /** HTTP 请求超时 (ms, default 30000) */
    timeout_ms?: number;
    /** 注入的锚定分数 (AA Stirrup 公开数据, 用作 sanity check) */
    anchor_score?: number;
  };
}

/**
 * 对比报告
 */
export interface ComparisonReport {
  /** 评测结果列表 */
  results: EvaluationResult[];
  /** 评测时间 */
  generatedAt: Date;
  /** 评测统计 */
  stats: {
    totalModels: number;
    totalQuestions: number;
  };
}
