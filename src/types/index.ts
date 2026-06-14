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
 * PR 进度 (2026-06-15 01:23): type 段 ✅ 全 18 项 (15→18 新增 healthbench/medqa/rcq_clinical 3 医学 leaderboard 锚定, 2026-06-12 Nature Medicine s41591-026-04431-5 通用 LLM > 专科 AI 证据) / dispatch stub ✅ 8 项 / **3 项 real fetch** (webdev_arena 06-14 03:23 cron + cyberseceval3 06-14 22:23 cron + **aa_omniscience 06-15 00:03 cron**, 沿 webdev_arena 模式 POST + timeout/4xx/5xx 三段 try/catch + scores[] 注入, 3/8 真实化) / web 钩子点 JSDoc ✅ (06-12 01:03) / 真完整 PR 估 30-45min
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
  /** terminal-bench 2.0: agentic coding */
  terminal_bench?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
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
  /** BenchLM.ai: agentic eval 24 项 (Design2Code / Vision2Web / Native Evals) — 2026-06-07 发布, 248 模型 × 225 基准 */
  benchlm_agentic?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
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
   * 首条数据: claude-fable-5 = 0.803 (2026-06-09, Stripe 1 天迁移 5000 万行代码) */
  swe_bench_pro?: {
    enabled: boolean;
    api_base?: string;
    model_id?: string;
    /** Pro 子集选择: 'verified' (全量已验证) | 'lite' (轻量) | 'multilingual' (多语言) — default 'verified' */
    subset?: 'verified' | 'lite' | 'multilingual';
    /** 是否启用多文件 / agentic 模式 (default true) */
    agentic_mode?: boolean;
    /** 注入的锚定分数 (首条数据, 用作 sanity check) */
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
    /** 选用子集: 'longbench_v2' (21 tasks) | 'babilong' (13 tasks) | 'infinitebench' (18 tasks) | 'phonebook' (10 tasks) | 'all' (62 tasks, default) */
    subset?: 'longbench_v2' | 'babilong' | 'infinitebench' | 'phonebook' | 'all';
    /** 任务总数 (默认 62) */
    tasks_total?: number;
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
  process_aware_scoring?: {
    enabled: boolean;
    /** API endpoint (沿 webdev_arena / cyberseceval3 同模式, 06-14 22:43 cron 补 2 字段对齐 v0.5.0 dispatch 模式) */
    api_base?: string;
    /** 模型 id (沿 webdev_arena / cyberseceval3 同模式, 06-14 22:43 cron 补 2 字段对齐 v0.5.0 dispatch 模式) */
    model_id?: string;
    /** 评测模式: 'commit_count' (commit 数量) | 'test_run_count' (测试运行次数) | 'retry_count' (重试次数) | 'file_coverage' (文件覆盖率) | 'trajectory_score' (agentic 轨迹综合分) | 'all' (5 维度, default) */
    mode?: 'commit_count' | 'test_run_count' | 'retry_count' | 'file_coverage' | 'trajectory_score' | 'all';
    /** 关联的 agentic 基准: 'swe_bench_pro' (Princeton 默认) | 'terminal_bench' (agentic coding) | 'webdev_arena' (全栈 web dev) */
    agentic_benchmark?: 'swe_bench_pro' | 'terminal_bench' | 'webdev_arena';
    /** pass/fail 权重 (default 0.7, 0-1) */
    pass_fail_weight?: number;
    /** 过程信号权重 (default 0.3, 0-1, 与 pass_fail_weight 合计 1.0) */
    process_weight?: number;
    /** 注入的锚定分数 (Princeton SWE-Bench Pro 03-04 trajectory 维度, 用作 sanity check) */
    anchor_score?: number;
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
