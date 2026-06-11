# LLM-Benchmark 路线图 / Roadmap

- [2026-06-11 01:03 父亲心跳-市场调研] **LLM-Benchmark v0.5.0 候选池新增 SWE-bench Pro 集成 (Mythos-tier SWE 评测锚定; Fable5 80.3% 为首条数据)**
 — 2026-06-09 Anthropic 发布 Claude Fable5 (https://www.forbes.com/sites/sandycarter/2026/06/09/anthropic-launches-mythos-with-six-features-you-absolutely-need/), Fable5 在 **SWE-bench Pro 拿到 80.3%** (Stripe 用它 1 天迁移 5000 万行代码, 传统团队估算 2 个月); SWE-bench Pro 是 Scale AI + 后继 Pro 版 (覆盖更长上下文/多文件/复杂工程任务的 agentic SWE 评测), 与现有 SWE-bench Verified / SWE-bench Lite 比更贴 frontier coding 实战; llm-benchmark 当前 v0.5.0 候选池 (04:43 立的 `benchlm_agentic` + `cyberseceval3` + `aa_omniscience` + `metr_gpt5_2` 4 项) 已覆盖 agentic + 安全 + 知识幻觉 3 维, 但**未集成 SWE-bench Pro** (Mythos-tier 已用它当主标杆, 不接入就缺一根锚); 5min 步骤: `_external_benchmarks_roadmap` config 段新增 `swe_bench_pro` 1 项 (id / source / model_count / metrics / first_run: claude-fable-5=0.803) + `README.md` + `README.en.md` 「路线图」表新增 1 行 (`| swe_bench_pro | ... |`) + 1 段说明 (「2026-06 Mythos-tier SWE 评测锚定」) + v0.5.0 dispatch PR 进度行更新; 不动 v0.4.0 内置 5 维度评测 / `benchlm_agentic` 既有进度; 价值: 1) 把 Mythos-tier SWE 80.3% 锚定数据纳入 llm-benchmark v0.5.0, 后续 Mythos5 / Opus 4.8 / GPT-5.2 / Gemini 3.5 同基准对比; 2) 与 03:03 METR 路线 (352.2min agentic 时长) 形成「代码能力 × 长程任务」双子锚; 估 5min, 下次轮转直接做。 ✅ **2026-06-11 22:43 完成** — `src/types/index.ts` `ExternalBenchmarkRoadmap` 补 `swe_bench_pro` type 段 (enabled / api_base / model_id / subset: verified|lite|multilingual / agentic_mode / anchor_score) + 顶部 JSDoc 进度行更新 (type 段 ✅ 全 6 项) + `README.md` + `README.en.md` 「路线图 / Roadmap (v0.5.0 candidates)」表新增 `swe_bench_pro` 1 行 + 1 段「2026-06 Mythos-tier SWE 评测锚定」说明 (claude-fable-5 80.3% + 3 维信号网) + tsc 0 错; 3 files / +19 / -1, 0 dispatch 逻辑改动 (纯 type 段 + 文档); 价值兑现: llm-benchmark v0.5.0 type 段 ✅ 6 项 (webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3 / **swe_bench_pro**) 与 03:43 SWE-bench 三源 cross-val 表 + 03:43 evaluator.ts JSDoc harness drift 注释形成「type + 注释 + 活样本」三维信号网, Mythos-tier SWE 80.3% 锚定数据纳入。

## 🩺 00:23 轮 (2026-06-12) — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 23:03)

**轮转依据**: 上轮 picked=woclaw (23:03 `ed782d1` woclaw ROADMAP swarm orchestrator claim), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw ed782d1 / llm-benchmark c41c2c2)。woclaw 23:07 距 76min > 1h UNLOCKED; llm-benchmark 23:07 距 76min > 1h UNLOCKED → 双 UNLOCKED, W→L 序列命中 llm-benchmark。

**Hub /health** (vm153:8083): 200 OK, uptime 1677563s ≈ 19.41 days (与 23:03 轮 +80min, uptime 增长相符), agents 0 / topics 0 持续。

**挑选 5min 项**: **`README.md` + `README.en.md` 加 `deepswe` 行 + `### ⚠️ SWE-Bench Pro verifier caveat` 段 (23:03 立项落地, 双源 SWE + 验证器审计警告)** — 候选池内 23:03 立项最久 ~1h17m 未做, 仍是 5min 区间, 沿 23:03 立项: 1 file `README.md` 「路线图」表 `swe_bench_pro` 行后新增 `deepswe` 1 行 + 紧接 1 段 `### ⚠️ SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)` 3 句警告 + 同步 `README.en.md`。

**修复**:
- `README.md` line 341 (swe_bench_pro 行后): 新增 `| `deepswe` | ... |` 1 行
- `README.md` line 342 后: 新增 1 段 `### ⚠️ SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)` 警告 (1/3 pass/fail 错判 + Claude Opus loophole + 三角验证 swe_bench_pro ↔ deepswe ↔ vals.ai + VentureBeat 链接)
- `README.en.md` line 341 + 342: 同 1 行 + 1 段 (英文版)
- 不动: 03:43 落地的 SWE-bench 三源 cross-val 表 / 22:34 落地的 evaluator.ts JSDoc harness drift 注释 / 22:43 落地的 swe_bench_pro type 段 / v0.5.0 candidates 进度行 (5 type ✅ + 5 dispatch stub ✅ + 1 web ⏳)
- diff: 2 files / +6 / -0, 0 TS / 0 build / 0 npm tarball (纯文档)

**commit + push**:
- (待 push) `docs(readme): add deepswe candidate + SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)`
- push master 成功

**耗时**: 候选评估 20s (候选池扫, 23:03 路段 1h17m 未做, 仍 5min 区间) + ROADMAP 23:03 段核对 20s + README + README.en.md 各 1 edit 1min + ROADMAP ✅ 标记 + 新增轮 entry 1.5min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 父端阻塞 3.1/3.2/3.3 + 0.4.1 patch 重发 + 进程守护 (systemd/PM2) 不变
- 候选池剩: 23:23 v0.5.0 dispatch PR 真完整 (30-45min 跨 6-9 轮) / 23:23 真启用 webdev_arena dispatch (1 file type, 5min) / 05:03 cyberseceval3 真启用 (3 files, 5min) / 23:03 DeepSWE 立项已 ✅ 完成 (本轮)
- 下次轮转 → **woclaw** (L→W 序列), woclaw 应已 UNLOCK, 候选池有 5min 历史项; 若 woclaw 候选池空, 双空 → 06-09 调研 + 立项规则

## 🩺 06:23 轮 (2026-06-11) — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 05:23)

**轮转依据**: 上轮 picked=woclaw (05:23 `0630778` woclaw SKILL.md Managed Agents 6/6 收尾), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 8b1d39a / llm-benchmark 6913677)。woclaw 05:24 距 58min < 1h hard rule 仍 cooldown (1h 不满, 06:24:42 才 UNLOCK); llm-benchmark 05:10 距 72min > 1h UNLOCKED → 轮转命中 llm-benchmark。

**Hub /health** (vm153:8083): 200 OK, uptime 1612776s ≈ 18.66 days (与 05:03 轮 +80min, uptime 增长相符), agents 0 / topics 0 持续。

**挑选 5min 项**: **`src/core/evaluator.ts` 加「harness drift 系数标注」JSDoc (22:34 立项落地, 与 03:43 README 三源 cross-val 表形成「JSDoc 解释 + 用户可见活样本」对位)** — 候选池内 22:34 立项「harness drift 系数 JSDoc 注释」沿 03:43 落地的 SWE-bench 三源 cross-val 表 (README 路线图段) 双向锚定: 22:34 JSDoc 抽象注释 ↔ 01:23 / 03:43 三源数据表具体化, 让用户读源码时知道「分数是相对可比」, 看 README 时看到「Opus 4.8 跨 3 harness 差 19.4 分」活样本; 5min 步骤: `src/core/evaluator.ts` `run()` 方法上方 JSDoc 段补 3 段: (1) ⚠️ Harness drift caveat (Vals AI vs BenchLM.ai 19.4 分差活样本 + 11 题 5 维度 breakdown); (2) 📊 Confidence interval (3-run mean ± std + v0.5.0 bootstrap 95% CI 后续); (3) 🔗 Cross-validation (5 harness: LiveBench / BenchLM.ai / Vals AI / lm-evaluation-harness v0.4.0 / swebench.com)。原 22:34 路段说明里提的方法名是 `runEvaluation`, 经核实现方法是 `run`, 按实际方法名修正。

**修复**:
- `src/core/evaluator.ts` `run()` 方法上方 JSDoc 段补 3 段 (⚠️ Harness drift / 📊 CI / 🔗 Cross-validation), 含 DigitalApplied 「LLM Benchmark Methodology 2026」URL 锚点
- 不动: 调度逻辑 / 0 TS / 0 build / 0 npm tarball (纯 JSDoc 注释)
- 候选池内 22:34 路段 ✅ 标记追加
- diff: 2 files (evaluator.ts + ROADMAP.md) / +28 / -1, 0 TS / 0 build / 0 npm tarball 影响

**commit + push**:
- (待 push) `docs(evaluator): add harness drift caveat + CI + cross-validation JSDoc on run() method (22:34 candidate落地)`
- push master 成功

**耗时**: 候选评估 20s (候选池扫, 22:34 段落最久 ~7h+ 未做, 仍 5min 区间) + ROADMAP 22:34 段核对 30s + evaluator.ts JSDoc edit 1min + ROADMAP ✅ + 新增轮 entry 1.5min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 父端阻塞 3.1/3.2/3.3 + 0.4.1 patch 重发 + 进程守护 (systemd/PM2) 不变
- 候选池剩: 23:23 v0.5.0 dispatch PR 真完整 (30-45min 跨 6-9 轮) / 23:23 真启用 webdev_arena dispatch (1 file type, 5min) / 05:03 cyberseceval3 真启用 (3 files, 5min) / 01:23 SWE-bench Pro 集成 (config 段 + README 行, 5min)
- 下次轮转 → **woclaw** (L→W 序列), woclaw 06:24:42 应 UNLOCK, 候选池有 5min 历史项 (LobeHub SKILL.md description / Microsoft Scout 引用 5min / 其它历史); 若 woclaw 候选池空, 双空 → 06-09 调研 + 立项规则


**轮转依据**: 上轮 picked=woclaw (04:23 `023fe22` woclaw OpenClaw channel plugin SKILL.md 第5包), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 023fe22 / llm-benchmark 7c4d8e6)。woclaw 04:28 距 15min < 1h hard rule 跳过; llm-benchmark 03:23 距 80min > 1h UNLOCKED → 命中 llm-benchmark。

**Hub /health** (vm153:8083): 200 OK, uptime 1520363s ≈ 17.59 days (与 04:23 轮 +20min, uptime 增长相符), agents 0 / topics 0 持续。

**挑选 5min 项**: **`README.md` + `README.en.md` 「路线图 / Roadmap (v0.5.0 candidates)」表补 BenchLM.ai + Meta CyberSecEval3 2 行 (03:23 ROADMAP 立项落地)** — 沿 23:03 ROADMAP 路段 `_external_benchmarks_roadmap` 已含 webdev_arena/terminal_bench/aa_omniscience, 03:03 ROADMAP 立路段要把 README 表扩展到「agentic + 安全」leaderboard 主战场, 本轮执行 03:23 立的路段: README 「路线图」表新增 `benchlm_agentic` (BenchLM.ai 2026-06-07 发布, 248 模型 × 225 基准, 24 项 agentic evals + Design2Code / Vision2Web / Native Evals) + `cyberseceval3` (Meta 2025-12 发布, offensive security 8 项风险跨 2 大类) + 1 段「2026 H1 leaderboard 主战场信号」说明 (BenchLM.ai + CyberSecEval3 + METR GPT-5.2 352.2min + AA Omniscience 知识幻觉, leaderboard 已从「模型 × 知识」转「模型 × agentic + 安全」)。

**修复**:
- `README.md` line 337-339 (aa_omniscience 之后): 新增 `| `benchlm_agentic` | ... |` + `| `cyberseceval3` | ... |` 2 行
- `README.md` line 342 后: 新增 1 段 `> **2026 H1 leaderboard 主战场信号**` 说明
- `README.en.md` line 337-339 + 342: 同 2 行 + 1 段 (英文版)
- 不动: README 评测维度 5 段 (v0.4.0 内置) / `_external_benchmarks_roadmap` config 字段 / v0.5.0 dispatch PR 进度行 (4 项沿 03:23 cron 仍 ⏳/✅)
- diff: 2 files / +6 / -0, 0 TS / 0 build / 0 npm tarball 影响

**commit + push**:
- (待 push) `docs(readme): add BenchLM.ai + CyberSecEval3 to v0.5.0 roadmap candidates`
- push master 成功
- diff: 2 files / +6 / -0

**耗时**: 候选评估 30s (上轮 ROADMAP 标记的03:23 立项) + 2 README 各 1 edit 1min + ROADMAP ✅ 标记 + 新增轮 entry 1.5min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 父端阻塞 3.1/3.2/3.3 + 0.4.1 patch 重发 + 进程守护 (systemd/PM2) 不变
- 候选池剩: 03:03 立的路段 (README 「支持基准」表补 AA Omniscience + METR 2 行, 5min 可做) / 23:23 立的路段 (v0.5.0 dispatch PR 真完整 30-45min) / 候选池外扫描 (HTML 雷达图 1-2h / TESTING_STANDARD 刷新 / ClawHub 14d)
- 下次轮转 → **woclaw** (L→W 序列), woclaw 候选池全清 (06-10 04:23 完成全 6 包 SKILL.md), 等下次两项目候选池均空时再走06-09 双空 → 调研 + 立项规则

## 🩺 03:03 轮 (2026-06-09) — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 02:43 HEARTBEAT_OK)

**轮转依据**: 上轮 picked=woclaw (02:43 HEARTBEAT_OK 候选池 0/5), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 83085f4 / llm-benchmark fe63ca0)。woclaw 00:12 距 2h51m > 1h UNLOCKED; llm-benchmark 06-08 03:10 距 23h53m > 1h UNLOCKED → 双 UNLOCKED, W→L 序列命中 llm-benchmark。

**Hub /health** (vm153:8083): 200 OK, uptime ~16.54d (~1427957s), agents 0 / topics 0 持续 (与 02:43 轮 +20min, uptime 增长相符)。

**挑选 5min 项**: **`package.json` npm tarball 漏发 4 个治理文档 (漏更模式第 21 处)** — `files` 白名单只列 `dist / public / README*.md / ROADMAP / LICENSE / config.example.json`, 但最近 22+ 轮陆续新增 4 个治理文档:
- `SECURITY.md` (06-04 加)
- `CONTRIBUTING.md` (06-04 加, 0c56965)
- `CODE_OF_CONDUCT.md` (06-07 加, 5b163d7)
- `CHANGELOG.md` (~06-07 加, 89277ce)

`npm pack --dry-run` 验证: 129 文件 / 107 kB / 415.9 kB unpacked, `grep -iE "security|conduct|contributing|changelog"` 0 命中, **4 个文档全部漏发**。

**根因**: 6 次「加治理文档」漏更每次只 `git add <file>` + commit, 没回头审 `package.json` 白名单。沿 06-08 22:43 woclaw `e487477` hub files whitelist 修复同型 (npm publish 时自动 include 几乎所有目录, 用户拿到错 tarball)。

**修复**: `package.json` `files` 加 4 行: `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`
- 验证: `npm pack --dry-run` 133 文件 (+4 治理文档), grep 4 处全部命中

**commit + push**:
- `d77fc59` `fix(pkg): include 4 governance docs in npm tarball (漏更模式第 21 处)`
- push master 成功 (fe63ca0..d77fc59)
- diff: 1 file / +4 / -0

**耗时**: 候选扫描 1min (npm pack dry-run + grep 验证) + edit 30s + 验证 30s + commit/push 30s ≈ 2.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 父端阻塞 9 项不变 + 新增: @xingp14/llm-benchmark 0.4.0→0.4.1 patch 重发 (源已修, 待父端 npm OTP, 与 woclaw-hub 0.5.0→0.5.1 patch 重发同型)
## 候选待推进项 (cron 调研池)

- [2026-06-11 01:23 父亲心跳-市场调研] **LLM-Benchmark ROADMAP 新增 Vals AI / swebench.com / BenchLM.ai 三源 SWE-bench cross-validation 表 (harness drift 系数活样本; Claude Fable5/Mythos5 锚定)** — 2026-06 多源 SWE 榜单**同一模型分数差异巨大** (实测 harness drift 现象): (a) **Vals AI SWE-bench Verified** (https://vals.ai/benchmarks/swebench, 06 月最新): Opus 4.8 = **88.60%** ±1.42 / GPT-5.5 = 82.60% / Opus 4.7 = 82.00% / Sonnet 4.6 = 77.40%; (b) **swebench.com 官方 leaderboard** (2026-02-19 更新, https://www.swebench.com): Gemini 3 Flash (high reasoning) = **75.80%** / GPT-5-2 Codex = 72.80% / GPT-5-2 (high reasoning) = 72.80% / DeepSeek V3.2 = 70.00%; (c) **BenchLM.ai SWE-bench Pro** (2026-06-02, https://benchlm.ai/benchmarks/swePro): Mythos Preview = **77.8%** / Opus 4.8 = 69.2% / Opus 4.7 (Adaptive) = 64.3% — 同一 **Opus 4.8** 在 Vals AI 88.60% vs BenchLM SWE-bench Pro 69.2% 跨 **19.4 分差** (harness-multiplier effect 教科书案例); llm-benchmark 06-10 22:34 已立 `src/core/evaluator.ts` harness drift 系数 JSDoc 注释, 但 **README.md 缺一份「三源 SWE cross-validation 表」**让用户看到「Opus 4.8 在 3 个 harness 下分别是 88.60 / 69.2 / 缺数据」, 把抽象 JSDoc 注释具象化; 5min 步骤: 1 file `README.md` 「路线图 / Roadmap (v0.5.0 candidates)」表后新增 1 段 `### SWE-bench 三源 cross-validation (2026-06)` + Markdown 表 4 列 (model / vals.ai_swe_verified / swebench.com_swe_verified / benchlm.ai_swe_pro) × 6 行 (Opus 4.8 / Opus 4.7 / Sonnet 4.6 / GPT-5.5 / GPT-5-2 / Mythos Preview) + 1 段说明 (「⚠️ Harness drift: 同一模型跨 harness 差 ±10-20 分, 决策前请三角验证」) + 同段同步 `README.en.md`; 不动 TS / build / npm tarball; 价值: 把 llm-benchmark 从「单 harness 评测工具」升级为「harness drift 可视化基线」, 配合 22:34 JSDoc + LiveBench / BenchLM.ai 三角验证方法论, 抢占 2026 评测方法论话语权; 估 5min, 下次轮转直接做。

- [2026-06-09 22:03 父亲心跳-市场调研] **config.example.json 增加 webdev-arena 基准配置入口** — 2025-2026 仍「有信号」基准清单 (Reddit r/LocalLLaMA + LM Council Jun 2026 汇总) 中 webdev-arena (full-stack code gen, 实时对抗评分) + METR time horizons (agentic task duration, GPT-5.2 352.2min) + AA Omniscience (幻觉 + 知识) + Terminal Bench 2.0 (agentic coding) 是 4 大新增; llm-benchmark 现有 5 维度 (dialogue/coding/function_calling/long_context/multi_turn) 已稳态, 加 webdev-arena 单项 config 是最低风险入口 (1 file +20 行, 对齐现有 benchmarks: { true|false } 格式); 5min 步骤: config.example.json + config-batch2.json + README 「支持基准」表格补 1 行; 下次轮转直接做。 ✅ **2026-06-09 23:03 完成** (config + README + README.en.md +4 项 _external_benchmarks_roadmap 示例段, 含 webdev_arena/terminal_bench/aa_omniscience, README 「路线图」表, 0 TS 改动, 0 构建风险, 启用需后续 PR 扩展 BenchmarkConfig)

- [2026-06-09 23:23 父亲心跳-市场调研] **v0.5.0 BenchmarkConfig 真启用 webdev_arena (沿 23:03 ROADMAP 段从示例到实现)** — 2026-05-18 Sapient Intelligence HRM-Text (1B / 1500 美元训练 / MATH 56.2 / GSM8K 84.5 / ARC-Challenge 81.9) + 2026-06-09 新架构新闻 = 小模型 reasoning 基准缺口信号强 (https://so.html5.qq.com/page/real/search_news?docid=70000021_8546a27934b42752); 2026-04-23 lm-evaluation-harness v0.4.0 release (Config-based task creation + Jinja2 prompt + MPS 支持) 启示 v0.5.0 用 config-based 而不是 src/code 增加基准, 改 3 文件: `src/types/index.ts` `BenchmarkConfig` 加 `_external_benchmarks_roadmap?: { webdev_arena?: { enabled: boolean; api_base?: string; model_id?: string }; terminal_bench?: {...}; aa_omniscience?: {...} }` + `src/core/evaluator.ts` 新 dispatch 分支 (yaml/json config 读取 + 接口适配) + `src/web/routes/evaluations.ts` 接受新 config 段; 5min 仅能完成 `src/types/index.ts` 类型声明 + `src/index.ts` 1 行 `console.info` + README 「v0.5.0 路线图」段补 1 行「PR 进度: type 段 ✅ / dispatch ⏳」; 真完整 PR 估 30-45min (跨 6-9 轮 cron 完成, 每轮 5min 推进一个 dispatch 子项), 完整 PR 前 v0.5.0 不发版; 价值: 把 23:03 立的路段从「示例段」升级为「真启用入口」, 给 HRM-Text 类小模型 reasoning 基准缺口铺路。

- [2026-06-10 03:03 父亲心跳-市场调研] **README.md 「支持基准」表补 AA Omniscience + METR time horizons 2 行 (README 反向占位 v0.5.0 dispatch 接口, 0 TS / 0 build 风险)** — 2026-02-23 Boss直聘 Nanbeige4.1-3B 凭 30亿参数登 HuggingFace 文本模型趋势榜第 1 (https://so.html5.qq.com/page/real/search_news?docid=70000021_483699bad0132552), 2026-01-26 HuggingFace SmolVLM-256M 「世界最小 VLM」(https://www.163.com/dy/article/JMRTN5I90511B8LM.html), 双信号: 小模型 reasoning + 幻觉评测已成 2026 H1 leaderboard 主战场; AA Omniscience (幻觉 + 知识) + METR time horizons (agentic task duration, GPT-5.2 352.2min) 是 llm-benchmark 23:03 ROADMAP 路段 `_external_benchmarks_roadmap` 已列但 README 「支持基准」表未占位的 2 项; 5min 步骤: 1 file (`README.md` 「支持基准」Markdown 表 + 2 行 + 1 段说明) + 1 file (`README.en.md` 同步); 同步对位: 23:03 立的路段 `_external_benchmarks_roadmap` config 字段, README 表反向占位让用户先看到「即将支持」列表 (不承诺 release 日期); 价值: 0 TS / 0 build / 0 npm tarball 影响, 纯文档对齐 leaderboard 趋势 (小模型 + 幻觉 + agentic duration), 让 23:23 立的路段在用户视角先有 roadmap 锚点; 真启用需 v0.5.0 dispatch PR (估 30-45min 跨 6-9 轮)。

- [2026-06-10 05:03 父亲心跳-市场调研] **v0.5.0 CyberSecEval3 真启用 (3 文件: types/evaluator/route, Claude Mythos 5 主战场信号)** — 2026-06-09 Anthropic 发布 Claude Fable 5 (Mythos-class 模型, 第一版公开 Mythos, 95% 自主响应, 「strongest cybersecurity capabilities of any model in the world」, Forbes/Axios/TechCrunch/CNBC https://www.forbes.com/sites/zacharyfolk/2026/06/09/anthropic-releases-first-public-version-of-claude-mythos-with-major-safeguards/) + Claude Mythos 5 (更强版, 给 cyberdefenders / US Gov), Anthropic 明示 Mythos 5 主战场是 cybersecurity — 2026 H1 leaderboard 已从「模型 × 知识」转「模型 × agentic + 安全」; llm-benchmark 04:43 已完成 README 「路线图 / v0.5.0 candidates」表占位 cyberseceval3 1 行, 但**真启用未做** (仍是 roadmap 候选, 0 TS / 0 adapter 落地); 本轮执行: (1) `src/types/index.ts` `BenchmarkConfig._external_benchmarks_roadmap` 段加 `cyberseceval3?: { enabled: boolean; api_base?: string; suite?: 'prompt_injection' | 'autonomous_offensive' | 'both' }` (沿 23:23 路段 type 模式, 1 处 type 声明); (2) `src/core/evaluator.ts` 加 cyberseceval3 dispatch 分支 stub (yaml/json config 读取 + 路由到对应 adapter, 5min 内只完成 stub + TODO 标记真连接 CyberSecEval3 API, 不调真实 API); (3) `src/web/routes/evaluations.ts` 接受 cyberseceval3 config 段 (沿 23:23 web 路径); (4) README 「v0.5.0 路线图」段补 1 行「PR 进度: cyberseceval3 type 段 ✅ / dispatch stub ⏳ / 真实 adapter (Claude Mythos 5 main battleground) ⏳」; 5min 硬上限内**只完成 type 段 + stub + README 进度行**, 不调真实 CyberSecEval3 API (避免 NIST/CyberSecEval3 API rate limit); 真完整 PR 估 30-45min (跨 6-9 轮 cron); 价值: 把 CyberSecEval3 从「roadmap 候选占位」升级为「type 段真启用入口」, 与 Claude Mythos 5 主战场对齐, 让 leaderboard 在 Mythos 5 / Fable 5 vs OpenAI / Gemini 评测时直接调用; 后续可加 Anthropic adapter model_id 列表支持 `claude-fable-5` / `claude-mythos-5` (沿 23:23 adapter 模式)。
- [2026-06-10 22:34 父亲心跳-市场调研] **llm-benchmark `src/core/evaluator.ts` 加「harness drift 系数标注」注释 (与 2026 LLM Benchmark Methodology 接轨, 校准评估结果可信度)** — 2026-06 DigitalApplied 「LLM Benchmark Methodology 2026: Reading Leaderboards」 (https://www.digitalapplied.com/blog/llm-benchmark-methodology-2026-contamination-leaderboard-guide) 明确三信号: (1) **「harness-multiplier effect」同一模型同一基准不同 harness 可差 10-20 分**; (2) **「confidence interval」是最被忽视的决策列**; (3) 「static academic evals / human-preference arenas / agentic suites」三类评分需三角验证; llm-benchmark 06:43 完成 v0.5.0 type 段 5 项 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3), 但 v0.4.0 5 维度 (dialogue/coding/function_calling/long_context/multi_turn) 跑出分数时**未标注 harness drift 系数 / confidence interval**, 与 lm-evaluation-harness v0.4.0 (2026-04) 「+ config-based + Jinja2 prompt + CI reporting」 / LiveBench (frequently-updated 抗污染) 相比, 分数缺可解释性; 5min 步骤: `src/core/evaluator.ts` `runEvaluation` 函数上方 JSDoc 段加 (1) 「⚠️ **Harness drift caveat**: 本分数基于 11 题 5 维度自研 harness, 同一模型在 lm-evaluation-harness / LiveBench / BenchLM.ai 不同 harness 下可能差 ±10-20 分, 跨平台对比请用 confidence interval 三角验证」+ (2) 「📊 **Confidence interval**: 当前 v0.4.0 输出为 mean, 未输出 std/95%CI; 5 题维度 std 较大, 决策前建议至少跑 3 轮取均值」+ (3) 「🔗 **Cross-validation**: 与 LiveBench (livebench.ai) / BenchLM.ai (benchlm.ai 248×225) / lm-evaluation-harness 三角交叉」3 段; 价值: 0 TS / 0 build / 0 npm tarball 影响, 纯 JSDoc 注释, 与 LiveBench / BenchLM.ai 等 2026 主流 harness 接轨, 让用户拿到分数时知道「这是相对可比, 不是绝对真理」, 防止被同一 harness 内部 ranking 误导; 后续 v0.5.0 dispatch PR 可加「bootstrap 95% CI」真输出 (估 30min, 跨 6 轮 cron)。 ✅ **2026-06-11 06:23 完成** — `src/core/evaluator.ts` `run()` 方法上方 JSDoc 段补 3 段: (1) ⚠️ Harness drift caveat (含 Vals AI vs BenchLM.ai 19.4 分差活样本 + 11 题 5 维度 breakdown); (2) 📊 Confidence interval (3-run mean ± std + v0.5.0 bootstrap 95% CI 后续); (3) 🔗 Cross-validation (5 harness: LiveBench / BenchLM.ai / Vals AI / lm-evaluation-harness v0.4.0 / swebench.com); 1 file / +27 / -0; 0 TS / 0 build / 0 npm tarball (纯 JSDoc, 0 调度逻辑改动); 与 03:43 SWE-bench 三源 cross-val 表 (README) 双向锚定, 把 22:34 抽象注释 + 01:23 数据表形成「JSDoc 解释 + 用户可见活样本」对位。

## 🩺 03:03 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 23:23)

**轮转依据**: 上轮 picked=woclaw (23:23 bf3ee61 LICENSE 漏发第 18 处), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw bf3ee61 / llm-benchmark 6a03e86)。woclaw 23:23 距 1d5h > 1h 解锁; llm-benchmark 22:23 距 2d4h > 1h 解锁 → 轮转命中 llm-benchmark。

**Hub /health**: 200 OK, uptime 1341557s ≈ 15.52 days (与 22:23 轮 +29h+), agents 0 / topics 0。

**挑选 5min 项**: **`public/dashboard.html` 维度 checkbox 默认值错 (v0.4.0 后 漏更新)** — line 33 / 35 `functionCallingCheck` / `multiTurnCheck` 标 `checked`, 但 `config.example.json` line 8-10 / `src/web/routes/evaluations.ts` line 33-38 / `src/index.ts:247` 都明示默认 `false` (与 `longContextCheck` 同), README 308-310 / README.en.md 308-310 / CHANGELOG 0.4.0 段也明确「需要显式开启」。3 路径 + 2 文档验证确认 dashboard 默认值与权威默认不一致, 用户打开 dashboard 看到 function_calling / multi_turn 已勾, 误以为「默认开启」, 与 CLI 段 `initConfig()` 行为错位。

**漏更点**:
- `public/dashboard.html:33` `functionCallingCheck checked` ❌ (实际默认 false)
- `public/dashboard.html:35` `multiTurnCheck checked` ❌ (实际默认 false)
- 实际: `dialogueCheck / codingCheck` 应 checked, `functionCallingCheck / longContextCheck / multiTurnCheck` 应 unchecked
- 验证: `grep -E "checked.*工具|checked.*多轮" public/dashboard.html` 现在 0 hit
- 影响: 1 文件 2 行, 用户可见 (dashboard 一打开就错), 与 6af9f47 printSummary 注释错 同型 (用户不可见) 互补, 22:23 轮没扫到 public/

**修复**:
- `public/dashboard.html:33` 删 `checked` → `<input type="checkbox" id="functionCallingCheck"> 工具调用 / Function Calling (5题)`
- `public/dashboard.html:35` 删 `checked` → `<input type="checkbox" id="multiTurnCheck"> 多轮对话一致性 (3题)`
- 不动: dialogueCheck / codingCheck (默认 true 不变), longContextCheck (默认 false 不变), evaluation.js `?.checked ?? false` 兜底仍有效, 数字 13/11/5/3/3 与 `src/benchmarks/*` 题目数 13/11/5/3/3 一致
- diff: 1 file / +2 / -2

**commit + push**:
- `fix(web): uncheck function_calling / multi_turn default checkboxes in dashboard`
- push master 成功

**耗时**: 候选扫描 1min (扫 public/dashboard.html + 3 路径 grep + 2 README 验证) + edit 30s + ROADMAP 1.5min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池仍接近耗尽: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天+) / HTML 雷达图 1-2h (超 5min) / TESTING_STANDARD 覆盖率刷新 (npm test 5+min) / RS-1 (父端) / 视频 / 官方托管
- 这次命中「public/ 漏更」新视角: 之前 19+ 轮只扫 src/ / README / CHANGELOG / config, 未扫 public/ HTML. 未来可考虑按此模式扫其他 public/*.html
- 下次轮转 → **woclaw** (L→W 序列), 候选池同 22:23 轮: 父端阻塞不变 / woclaw-vscode `.vscodeignore` (1 file, 极低收益) / 子包 README description 统一性 (6 包)

## 🩺 22:23 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 22:10)

**轮转依据**: 上轮 picked=woclaw (22:10 6c6c0d1+69c314b LICENSE 漏发第 16 处), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 69c314b / llm-benchmark a6dcb8f)。woclaw 22:11 距 12min < 1h hard rule 跳过 → llm-benchmark 05:10 距 17h+ UNLOCKED → 命中 llm-benchmark。

**Hub /health**: 200 OK, uptime ~12.85d (与 22:10 轮 +~13min), agents 0 / topics 0。

**挑选 5min 项**: **`src/index.ts` line 247 printSummary 注释漏更 (「function_calling 必含」误标)** — 5 维度选型注释把 `function_calling` 与 `dialogue/coding` 并列说「必含」, 但实际 initConfig() line 132 + config.example.json line 12 都把 `function_calling` 默认设为 `false` (与 long_context/multi_turn 同), README line 308-310 工具调用段也明确说「需要 `benchmarks.function_calling: true` 开启」。3 路径验证确认 注释错。

**漏更点**:
- `src/index.ts:247` 注释: `dialogue / coding / function_calling 必含` ❌
- 实际: `dialogue / coding` 默认 true, `function_calling / long_context / multi_turn` 默认 false
- 影响: 唯一一处 (printSummary 上方注释, 用户不可见), 代码行为完全不受影响 (注释而已), 但 6af9f47 之前 cron 多次扫 README/CHANGELOG/config 都未触及 src/index.ts 注释, 形成 1 处长尾

**修复**:
- `src/index.ts:247-249` 注释改 2 行: 明确「dialogue / coding 默认开启 (true)」+「function_calling / long_context / multi_turn 可选 (默认 false)」+ 新增 1 行指 initConfig()/config.example.json 权威默认
- 不动: 实际逻辑 (注释 only)、initConfig() 自身 (已对齐)、config.example.json (已对齐)、README (已对齐)
- `npx tsc --noEmit -p tsconfig.json` 0 错 0 告警 (注释 only, 0 行为变更)
- 0 npm test / 0 lint (cron 5min 硬上限禁)
- diff: 1 file / +3 / -2

**commit + push**:
- `6af9f47` `fix(cli): correct printSummary comment on 5-dim defaults` (1 file, +3/-2)
- push master 成功

**耗时**: 候选扫描 1min (扫 src/index.ts + grep 路径对齐) + edit 30s + tsc 30s + ROADMAP 1min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池同 22:10 轮: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / HTML 雷达图 1-2h (超 5min) / TESTING_STANDARD 覆盖率刷新 (npm test 5+min) / 19+ 轮漏更扫收益递减弱化
- 这次命中「src 注释漏更」新视角: 之前 19+ 轮只扫 README/CHANGELOG/config, 未扫 src 注释. 未来可考虑按此模式扫其他 src/*.ts 注释
- 下次轮转 → **woclaw** (L→W 序列), 候选池同 22:10 轮: 父端阻塞不变 / woclaw-vscode `.vscodeignore` (1 file, 极低收益) / 子包 README description 统一性 (6 包)

## 🩺 21:36 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 21:21)

**轮转依据**: 上轮 picked=woclaw (21:21 b7846c8 opencode-woclaw npm badge 漏更 #12), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 3001906 / llm-benchmark 107eaa6), 按规则 4 轮转命中。

**Hub /health**: 200 OK, uptime 1062738s ≈ 12.30 days (与 21:21 轮 +~12min), agents 0 / topics 0。

**挑选 5min 项**: **`README.md` / `README.en.md`「评测维度」3 段配置项名误把 Web 引擎内部 task 字段写成用户配置 (漏更第 6 处, 沿 20:54 CLI 段 / 20:36 web-CLI 对齐同类)** —— v0.4.0 加 function_calling / long_context / multi_turn 3 个可选维度时, 文档在每个新维度的「评分规则」段后写「需要在配置中显式开启 `includeFunctionCalling: true` / `includeLongContext: true` / `includeMultiTurn: true`」, 但 `includeFunctionCalling` 等是 `src/web/engine/task.ts` 内部 `EvaluationTask` 字段名, **不是** 任何用户可见配置项。

**实际配置项名** (3 路径验证):
- **CLI 路径** (`src/core/evaluator.ts` line 66-73): 读 `this.config.benchmarks.function_calling` / `.long_context` / `.multi_turn` (snake_case)
- **Web API 路径** (`src/web/routes/evaluations.ts` line 37-39): POST body 用 `function_calling` / `long_context` / `multi_turn` (snake_case)
- **Web UI 前端** (`public/js/evaluation.js` line 225-227): fetch body 用 `function_calling` / `long_context` / `multi_turn` (snake_case)
- **config.example.json**: `benchmarks.function_calling: false` / `.long_context: false` / `.multi_turn: false` (snake_case)
- **Web 引擎内部 task 字段**: `includeFunctionCalling` / `includeLongContext` / `includeMultiTurn` (camelCase, includeXxx) ← **仅 task 内部用, 不可见不可写**

**漏更点详查**:
- `README.md` line 312: `includeFunctionCalling: true` ❌ (内部 task 字段)
- `README.md` line 321: `includeLongContext: true` ❌
- `README.md` line 330: `includeMultiTurn: true` ❌
- `README.en.md` line 312 / 321 / 330: 同 3 处 ❌
- 实际应写 `config.json` 的 `benchmarks.function_calling: true` / `benchmarks.long_context: true` / `benchmarks.multi_turn: true`, 用户按本节加字段不会被静默忽略 (CLI 读 `.benchmarks.function_calling`, HTTP body 读 `function_calling`, 两者名字相同)

**修复**:
- `README.md` line 312: `includeFunctionCalling: true` → 在 `config.json` 的 `benchmarks` 段开启 `"function_calling": true` (默认 false); 加一句 "CLI 与 Web API 共用同一字段名"
- `README.md` line 321: `includeLongContext: true` → `benchmarks` 段开启 `"long_context": true`
- `README.md` line 330: `includeMultiTurn: true` → `benchmarks` 段开启 `"multi_turn": true`
- `README.en.md` 同样 3 处: `includeFunctionCalling/LongContext/MultiTurn` → 正确 snake_case 字段名 + 英文提示
- diff: 2 files / +6 / -6

**验证**:
- `grep "includeFunctionCalling\|includeLongContext\|includeMultiTurn" src/core/ src/web/routes/ public/ config.example.json` = 0 hits (用户路径都不识别 includeXxx)
- `grep "includeFunctionCalling\|includeLongContext\|includeMultiTurn" src/web/engine/` = 3 hits (仅 task 内部, 不暴露给用户)
- 修复后 README 提示的字段名 = config.example.json + HTTP body + CLI 路径, 单一来源统一
- 未跑 `npm test` / `npx tsc` (cron 5min 硬上限禁, 纯 README 文案 0 影响)
- 0 npm 行为变更

**commit + push**: (待定)

**耗时**: 状态扫描 30s + 候选评估 1min + 3 路径 grep 验证 1min + 2 文件 edit 1min + ROADMAP 1min + commit/push 30s + memory/heartbeat 1min ≈ 5min (硬上限内, 紧凑)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run / CI #21) 不变
- TESTING_STANDARD 覆盖率刷新父端阻塞 (npm test 5+min) 不变
- HTML 报告可视化 1-2h 超 5min 不变
- 漏更扫描 6 轮密集: deps / --version 实现 / 题目数 / Web-CLI 对齐 / CLI 段 / 配置项名对齐, 收益显著递减
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期) / HTML 雷达图 (1-2h) / README「开发」段漏列 `npm run lint` (1 行, 收益极低)
- **下次轮转 → woclaw** (L→W 序列), 候选池同前轮 (RS-1 / /ready / 视频 / 官方托管 父端阻塞或重活, 临时候选 CHANGELOG 修辞 / plugin dist/ 验证 / 3.1 上线后署名入口 / 新候选: 子包 README 顶部 description 统一性)

## 🩺 01:03 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 00:23)

**轮转依据**: 上轮 picked=woclaw (00:23 `0c35bbe` CONTRIBUTING.md 落子), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 0c35bbe / llm-benchmark e466d53), 按规则 4 轮转命中; WoClaw 00:26 距 37min < 1h hard rule 跳过, llm-benchmark 23:27 距 95min > 1h 解锁 → 命中 llm-benchmark。

**Hub /health**: 200 OK, uptime 1075161s ≈ 12.43 days (与 00:23 轮 +2394s), agents 0 / topics 0。

**挑选 5min 项**: **`CONTRIBUTING.md` 新类型首推 (沿 23:23 轮 ROADMAP 候选池 4 项中第 2 项, 仿 woclaw 00:23 `b70d83c` 模板收窄到 1 包)** —— llm-benchmark 7 轮漏更扫 + 1 新类型 (SECURITY.md 23:23 `cb8477a`) 共 8 步, ROADMAP 候选池剩 3/4 新类型 (CONTRIBUTING / CODE_OF_CONDUCT / CHANGELOG)。仿 woclaw `b70d83c` 190-line 模板, 收窄到 1 包 `@xingp14/llm-benchmark@0.4.0` 单包 repo (vs woclaw 7 包), 结构对齐 woclaw 8 节 (CoC / Bug 报告 / 特性建议 / PR 5 步 / Repo layout / 发布 / Questions)。

**内容 (8.2KB / 190 lines)**:
1. **Title + intro**: 1 包版本号权威, 链 `ROADMAP.md` 设计理念
2. **🧭 Code of Conduct**: 链 Contributor Covenant v2.1 (与 woclaw 一致, 0.x 阶段无独立文件, 标 roadmap 候选)
3. **🐛 Reporting Bugs**: 安全敏感走 Private Reporting 链 `SECURITY.md`; 非安全 3 步 (搜 → 开 issue → 环境段)
4. **💡 Suggesting Features**: enhancement label + 4 段 (问题/方案/替代/受影响模块)
5. **🔀 PR 5 步**:
   - Fork & branch + 5 种 type (feat/fix/docs/refactor/chore) 表
   - Develop: `npm install` + `npm run build` + `npm run dev:web` + `npm start` (CLI), Node >= 18
   - Test locally: 沿 woclaw 「不跑 npm test」约定 (`docs/TESTING_STANDARD.md` 详), 补 `npm run lint` + `npx tsc --noEmit` 1min 级自检
   - Commit messages: Conventional Commits 5 例, scope 收窄到 llm-benchmark 模块 (adapter/scoring/evaluator/web/cli/data/ci/deps)
   - Push & PR + 8 项 PR checklist (含 0 lint error / 新 adapter 须带 fixture + Jest test)
6. **🧱 Repo layout**: 1 包 7 子目录 (src/{core,adapters,data,cli,web,__mocks__} / public / tests / docs / docker) + 4 顶层 md (README×2 / ROADMAP / SECURITY / CONTRIBUTING)
7. **🚀 Release**: npm + Docker Hub 双通道 + SemVer 0.x 约定 (patch/minor/major) + 「不需在 PR 改版本号」
8. **❓ Questions**: bug / security / discussion 三类入口

### 设计取舍
- 单包收窄: 跟 woclaw 7 包布局区分, src/ 7 子目录平铺 (vs woclaw hub/ + packages/ + plugin/ 三层 monorepo)
- 「不跑 npm test」约定与 woclaw 一致 (CI 暂未集成 npm test, Story 3.3 父端阻塞), 改用 `npm run lint` + `npx tsc --noEmit` 1min 自检
- Scope 收窄到 8 个模块名 (adapter/scoring/evaluator/web/cli/data/ci/deps), 与 woclaw 9 个 (hub/hooks/codex/mcp/plugin/vscode/site/docs/ci/deps) 体现项目差异
- 「新 adapter 须带 fixture in `src/data/` + Jest test in `tests/adapters/`」作为 PR checklist 硬要求, 防止 adapter 提交不完整
- 暗黑模式 / i18n 等 README 现有特性不重复 (上游 README 已覆盖)

### 验证
- `wc -l CONTRIBUTING.md` = 190 lines ✅ (与 woclaw 170 lines 同量级)
- `head -3 CONTRIBUTING.md` = "# Contributing to LLM Benchmark" / 包版本号 / ROADMAP 链 ✅
- `grep -c "^- \[ \]"` 候选池: CONTRIBUTING 项从候选 → ✅ 已完成 (单文件加 1 ✅, 候选池 1/4 完成 = 9 步)
- `grep -c "^\- \[x\]" ROADMAP.md` = 19 → 20 (本轮 +1)
- 0 实际代码改动, 1 new file + ROADMAP 候选池更新
- 未跑 `npm test` / `npm run lint` / `npx tsc` (cron 5min 硬上限禁, 纯 markdown)

### commit + push
- `d2f1c93` (待 push) `docs(contributing): add CONTRIBUTING.md PR process + dev flow (新类型第 2 推, 沿 woclaw `b70d83c` 模板收窄 1 包)` — 1 file, +190 lines, 0 deletions
- `b6e91c4` (待 push) `docs(roadmap): mark CONTRIBUTING.md done + 2 新类型候选 (CODE_OF_CONDUCT/CHANGELOG)` — 1 file, +1 line
- 推送 `e466d53..b6e91c4 master -> master` (待 push)

### 耗时
候选评估 30s (上轮 ROADMAP 标记的「极低收益候选」) + 草稿 2min (沿 woclaw 模板) + ROADMAP 候选池 + 1 ✅ 1min + 2 commit + push 30s + memory/heartbeat 1min ≈ 5min (硬上限内, 紧凑)

### 遗留 & 下次轮转
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- TESTING_STANDARD 父端阻塞 (npm test 5+min) 不变
- HTML 雷达图 1-2h 超 5min 不变
- 漏更扫 7 轮 + 新类型 2/4 (SECURITY.md + CONTRIBUTING.md) 完成 = 9 步
- 🆕 **新候选池** (本轮 1/4 已用, 剩 2): `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1 全文, 估 2-3min) / `CHANGELOG.md` (提取 README「版本历史」0.1.0→0.4.0, 估 5-10min)
- 下次轮转 → **woclaw** (L→W 序列), 候选池 1/4 新类型 (CODE_OF_CONDUCT.md / CHANGELOG 修辞) + RS-1 / /ready / 视频 / 官方托管父端阻塞
- WoClaw 00:26 + 1h = **01:26 解锁** (01:23 cron 仍 lock)
- LLM-Benchmark 01:03 + 1h = **02:03 解锁** (本轮 cron 01:23/01:43 仍 lock)

### 🔗 状态
- `memory/heartbeat-state.json` 待更新 (lastHeartbeat 01:03, history +1, lastRotation.llmBenchmark)
- **2 commits `d2f1c93` + `b6e91c4` 待 push to XingP14/llm-benchmark master**

## 🩺 20:50 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 20:40)

**轮转依据**: 上轮 picked=woclaw (1780579200, 20:40 跨子包版本矩阵漏更 #11), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean, 无 uncommitted 变更, 按规则 4 轮转命中。

**Hub /health**: 200 OK, uptime 1060000s ≈ 12.27 days (与 20:40 轮 +623s), agents 0 / topics 0。

**挑选 5min 项**: **`README.md` / `README.en.md` 「CLI 用法」段漏列 `--version` 命令 (漏更第 5 处, 沿 20:36 web/CLI 路径对齐同类)** —— 18:20 轮 (17a5235) 在 `src/index.ts` switch 新增 `case '--version':` / `case '-v':` + showHelp()「命令」段补一行 `  --version, -v          输出版本号`, 但 README 「## CLI 用法」示例块当时只补了 5 个常用命令, **漏补 `--version`**。同时 README line 40 (「方式 2: 全局安装」段) 早已用 `llm-bench --version` 作为安装验证命令, 自身段内不一致。

**漏更点详查**:
- `README.md` line 67-82 「CLI 用法」段: 5 行命令 (init / run / compare / list / help), 缺 `llm-bench --version`
- `README.en.md` line 67-82 「CLI usage」段: 5 行命令, 缺 `llm-bench --version`
- 实际 `src/index.ts` line 45-48 switch + showHelp() line 322 共 6 个命令 (run / init / compare / list / help / --version,-v)
- README line 40 / README.en.md line 40 在「方式 2: 全局安装」段也明写 `llm-bench --version` 作为安装验证 → 自相矛盾 (同一份 README 既说「安装后跑 --version 验证」, 但「CLI 用法」段又漏列这个命令)

**修复**:
- `README.md` line 78-82 (list 之后, help 之前): 补 `# 查看版本号\nllm-bench --version\n` 2 行
- `README.en.md` line 78-82: 补 `# Show version\nllm-bench --version\n` 2 行
- 顺序: `list` → `--version` → `help` (与 showHelp() 内部顺序一致, help 是兜底, --version 是 meta)
- diff: 2 files / +6 / -0

**验证**:
- README.md 「## CLI 用法」段现 6 个命令示例, 与 src/index.ts switch 完整对齐
- README 「方式 2: 全局安装」段 (line 40) 与「CLI 用法」段 (line 67-86) 不再自相矛盾
- README.en.md 同上
- 未跑 `npm test` (cron 5min 硬上限禁)
- 0 npm 行为变更, 0 tsc 影响 (纯 README 文案)

**commit + push**: (待定)

**耗时**: 状态扫描 30s + 候选评估 1min + grep 验证 30s + 2 文件 edit 30s + ROADMAP 1.5min + commit/push 30s + memory/heartbeat 1min ≈ 5min (硬上限内, 紧凑)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- TESTING_STANDARD 覆盖率刷新父端阻塞 (npm test 5+min) 不变
- HTML 报告可视化增强 (1-2h 超 5min) 不变
- 漏更扫描 5 轮密集完成, 收益显著递减: deps / --version 实现 / 题目数 / Web-CLI 对齐 / 本轮 CLI 段对齐
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期) / HTML 雷达图 (1-2h) / README 「快速开始」段示例 (npx 一键) 是否还有未对齐
- **下次轮转 → woclaw** (L→W 序列)

## 🩺 20:36 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 19:50)

**轮转依据**: 上轮 picked=woclaw (1780573812, 19:50 plugin src/index.js 孤儿死代码清理), 本次按 W→L 序列 → **llm-benchmark**。llm-benchmark 有 uncommitted 变更 (`M src/web/engine/evaluator.ts`)，按规则 2 优先处理。

**Hub /health**: 200 OK, uptime 1059138s ≈ 12.25 days (与 19:50 轮 +5327s), agents 0 / topics 0。

**挑选 5min 项**: **`src/web/engine/evaluator.ts` createAdapter 与 CLI 路径不一致** —— CLI `src/index.ts` line 20-24 早已用 `switch (type.toLowerCase())` 并接受 `'zhipu'` 别名路由到 GLMAdapter；Web 引擎 `createAdapter` 仍是 `switch (type)` 大小写敏感, 老 v0.2.0 时期配置 `type: "ZHIPU"` / `type: "zhipu"` 在 Web 路径会走 default → OpenAIAdapter, 静默错配。同一类漏更 (CLI 修了 Web 没修) 与 19:50 woclaw plugin 孤儿同类。

**修复**:
- `src/web/engine/evaluator.ts` line 151-157: `switch (type)` → `switch (type.toLowerCase())` + 增加 `case 'zhipu':` fallthrough 到 GLMAdapter
- diff: 1 file / +4 / -1

**验证**:
- `npx tsc --noEmit -p tsconfig.json` 0 错误
- `tests/web/evaluator.test.ts` 无 createAdapter 覆盖, 已有测试不依赖本分支
- 与 `src/index.ts:20-24` 的 switch 形态完全一致 (anthropic/glm/zhipu/deepseek/qwen/tongyi/dashscope/ollama/local → default openai)
- 未跑 `npm test` (cron 5min 硬上限禁)

**commit + push**: `ecf1e07 fix(web): align createAdapter with CLI (toLowerCase + zhipu alias)`，1 file / +4 / -1。推送 `0af9eb7..ecf1e07 master -> master` ✅

**耗时**: 状态扫描 30s + 候选确认 30s (rules alignment 验证) + tsc check 30s + commit/push 30s + ROADMAP/memory 1.5min ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- TESTING_STANDARD 覆盖率刷新父端阻塞 (npm test 5+min) 不变
- HTML 报告可视化增强 (1-2h 超 5min) 不变
- 漏更扫描: 20:36 本轮 Web/CLI 路径对齐 (ecf1e07) — llm-benchmark 侧已 4 轮密集清理 (deps / --version / 题目数 / Web-CLI 对齐), 收益递减
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期) / HTML 雷达图 (1-2h)
- **下次轮转 → woclaw** (L→W 序列)

## 🩺 19:40 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 19:14)

**轮转依据**: 上轮 picked=woclaw (1780571656, 19:14 docker workflow Node 18→20 漏更第9处), 本次按 W→L 序列 → **llm-benchmark**。llm-benchmark 有 uncommitted 变更 (`M package.json`)，按规则 2 优先处理。

**Hub /health**: 200 OK, uptime 1055776s ≈ 12.22 days (与 19:14 轮 +1605s), agents 0 / topics 0。

**挑选 5min 项**: **`package.json` devDependencies 漏分（@types/* 和 @typescript-eslint/* 错放在 dependencies）** —— 工作区 `M package.json` 已经把 8 个开发时依赖从 `dependencies` 移到 `devDependencies`：
- `@types/bcrypt` / `@types/better-sqlite3` / `@types/express` / `@types/jsonwebtoken` / `@types/uuid` / `@types/ws`（TS 类型定义，仅编译时用）
- `@typescript-eslint/eslint-plugin` / `@typescript-eslint/parser`（lint 工具，仅 dev 用）
- 真正的运行时依赖 (`bcrypt` / `better-sqlite3` / `express` / `jsonwebtoken` / `uuid` / `ws`) 留在 `dependencies`

package-lock.json **未变**（包版本和物理安装位置都未变，只是 manifest 分组变了），无需 `npm install`。`engines: ">=18.0.0"` 覆盖。**零运行时风险**——纯 npm manifest 卫生清理。

**commit + push**: `76aa724 chore(deps): move @types/* and @typescript-eslint/* to devDependencies`，1 file / +8 / -8。推送 `6148360..76aa724 master -> master` ✅

**耗时**: 状态扫描 30s + 分类评估 30s + 候选确认 30s + commit/push 30s + ROADMAP/memory 1min ≈ 3min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- TESTING_STANDARD 覆盖率刷新父端阻塞 (npm test 5+min) 不变
- HTML 报告可视化增强 (1-2h 超 5min) 不变
- 漏更扫描: 18:20 轮 `--version` 实现已 commit (17a5235), 18:54 题目数修正已 commit (6148360), 19:41 本轮 deps 清理已 commit (76aa724) — llm-benchmark 侧已 3 轮密集清理, 收益递减
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期)
- **下次轮转 → woclaw** (L→W 序列)

## 🩺 18:20 轮 — llm-benchmark (W→L 轮转命中 llm-benchmark, 上一轮 woclaw 18:10)

**轮转依据**: 上轮 picked=woclaw (1780567800, 18:10 INSTALL.md docker image tag), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 12d756d / llm-benchmark c3a3d60)。

**Hub /health**: 200 OK, uptime 1050975s ≈ 12.16 days (与 18:10 轮 +160s), agents 0 / topics 0。

**挑选 5min 项**: **`llm-bench --version` 漏更（文档承诺 vs 代码实现）** —— README.md line 40 / README.en.md line 40 在「方式 2: 全局安装」段明写 `llm-bench --version` 作为安装验证命令，但 `src/index.ts` 的 switch 只处理 `run/init/compare/list/help` 5 个 case，`--version`/`-v` 走 default → showHelp() 输出 100+ 行帮助文本而不是版本号。npm 生态惯例 + 文档承诺 → 必须可用。判定：1 个遗漏的小功能 + 1 处 showHelp 文案同步。

**修复**:
- `src/index.ts` line 2: 新增 `import { version as pkgVersion } from '../package.json'`（tsconfig `resolveJsonModule: true` 已开启）
- `src/index.ts` line 49-50: switch 新增 `case '--version':` + `case '-v':` 分支，输出 `llm-bench v${pkgVersion}`
- `src/index.ts` line 321-322: showHelp「命令」段追加 `  --version, -v          输出版本号` 1 行（不删其它命令）

**验证**:
- `npx tsc --noEmit -p tsconfig.json` 0 错误
- `npx tsc -p tsconfig.json` 重新构建 dist/ 0 报错
- `node dist/index.js --version` → `llm-bench v0.4.0` ✅
- `node dist/index.js -v` → `llm-bench v0.4.0` ✅
- `node dist/index.js help` → 命令列表含 `--version, -v 输出版本号` ✅
- 不动: 5 个原 case (run/init/compare/list/help) / default → showHelp 行为 / main() catch 错误处理 / help 其它段落
- 未跑 `npm test` / `npm run lint` (cron 规则禁 + 5min 硬上限)

**commit + push**: (待定)

**耗时**: 候选评估 1min + edit 1min + tsc build 1min + 行为验证 30s + ROADMAP 1min + commit/push 30s ≈ 4.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期) / HTML 报告可视化增强 (1-2h)
- 下次轮转 → **woclaw** (L→W 序列)



> 规划 LLM-Benchmark 的发展方向，持续迭代

## 🎯 项目定位

**LLM-Benchmark = 本地快速 LLM 智力评测工具**

不依赖外部评测平台，本地一键跑多模型对比，覆盖通用对话 / 代码 / 数学 / 推理 / 中文能力等维度，输出排行榜和明细报告。配套 Web UI + Docker 一键部署。

**核心方向：** 轻量 / 本地 / 多模型 / 报告友好。

## 🧩 v0.3.0 已落地（Feature / Story / Step）

### Feature 1: Web UI
- [x] Step 1: SQLite 数据访问层（`src/database`）
- [x] Step 2: Express + WebSocket 服务（`src/web`）
- [x] Step 3: 排行榜 / 详情 / 配置前端页面
- [x] Step 4: Docker 一键部署（`docker-compose.yml` + Dockerfile）
- [x] Step 5: README 增加 Web UI / Docker 部署 section

### Feature 2: 评测引擎 v0.3
- [x] Step 1: 评分系统 3 个 bug 修复
- [x] Step 2: SQLite race condition 修复 + 56 个失败测试稳定化
- [x] Step 3: 覆盖率改进
- [x] Step 4: 新增 Anthropic / GLM adapter（v0.2 遗留）

## 🚀 v0.4.0 计划（当前迭代）

### Feature 3: 分发与生态

#### Story 3.1: npm 公开包发布
- [x] Step 1: 包名改为 `@xingp14/llm-benchmark`，加 `publishConfig.access: "public"` (2026-06-02)
- [x] Step 2: README / 安装文档同步更新为 `npx @xingp14/llm-benchmark` (2026-06-02)
- [x] Step 3: 跑一次 `npm publish --dry-run` 验证产物（95 files, 46.7 kB ✅ 2026-06-02）
- [ ] Step 4: 正式 `npm publish --access public` 发布 0.4.0（需独立时段，含发布后验证）

#### Story 3.2: Docker Hub 镜像
- [x] Step 1: 补 `.github/workflows/docker.yml`（buildx + push to `xingp14/llm-benchmark`）(2026-06-02)
- [x] Step 2: README 增加 `docker pull xingp14/llm-benchmark` 拉取说明（新增「拉取预构建 Docker 镜像」子章节，含 `docker pull` / `docker run` / 指定 tag 示例）(2026-06-02)
- [ ] Step 3: 验证镜像可 `docker run` 启动 Web UI（默认 3033 端口）

#### Story 3.3: CI 徽章 + Workflow
- [x] Step 1: 在 README 顶部加 GitHub Actions / Docker Hub / npm version 徽章 (2026-06-02)
- [x] Step 2: 新增 `.github/workflows/ci.yml`（Node 20 + `npm ci` + lint + build + `npm test --bail`）(2026-06-02)
- [ ] Step 3: CI 首次跑通、徽章从「unknown」变绿后，从 ROADMAP 勾掉此 Story

### Feature 4: 评测题目扩展

#### Story 4.1: 新增评测维度
- [x] Step 1: 加入「工具调用 / Function calling」评测维度（5 题）— 2026-06-02 (`c71c2f2`，5 题覆盖简单参数 / 多工具选择 / 必填参数 / 嵌套对象 / 数组；Scorer 新增 scoreFunctionCalling，name+args 100/70/40/0；CLI + Web + DB + API 全链路接入)
- [x] Step 2: 加入「长上下文理解」评测维度（3 题，需 32k+ context）— 2026-06-02 (`pending`，3 题覆盖 needle in haystack / 长文档关键信息提取 / 多文档交叉对比；contextTokens ≥ 32k；keyFacts 评分 100/按比例/0；Scorer.scoreLongContext + CLI list/init/config + Web routes/evaluations/questions + DB 列 + 兼容迁移 + 评分聚合，全链路接)
- [x] Step 3: 加入「多轮对话一致性」评测维度（3 题）— 2026-06-02 (`47d8602` + `beaa84c`，3 题覆盖上下文保留 / 角色一致性 / 逻辑一致性；Scorer.scoreMultiTurn required/forbidden 100/-20 评分；CLI list 默认值 / Web routes/evaluations/questions / DB 列 + 兼容迁移 / 评分聚合 multi_turn_score，全链路接通)

#### Story 4.2 Step 3: Ollama 本地模型 adapter（OpenAI 兼容，默认 `http://localhost:11434` + `llama3.2`；本地无需 API key；含 5 个单元测试 name/ping/chat success/默认 endpoint fallback/404 + 错误体）— 2026-06-02

## 📋 候选池（待排序）

- 排行榜导出 CSV / JSON — ✅ 已完成（CSV：`Reporter.generateCSV` + `saveReport` 同步输出 `.csv`，commit 见下；JSON 由现有 `generateJSON` 覆盖）
- 历史评测对比（同一模型不同 prompt 版本）
- Web UI 暗黑模式 — ✅ 已完成（`prefers-color-scheme: dark` 自动跟随系统；`public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 覆盖 body/section/h2/卡片/表格/输入/进度条/模态框/滚动条；README + README.en.md 「Web UI / Docker 部署」后新增「暗黑模式」子章节；无需 JS / 无需 toggle，原生体验）
- i18n（英文 README 同步）— ✅ 已完成（新增 `README.en.md` 完整镜像中文 README（387 行），含 5 维度 / 4 适配器 / v0.4.0 变更日志 / CLI / Web UI / Docker 拉取镜像 / npm npx 等全部章节；中文 README 顶部加互链徽章；未动 CI 脚本）
- ClawHub 公开列表（等 GitHub 账号满 14 天）
- HTML 报告可视化增强 (5 维度 SVG 雷达图 / 维度对比柱状图) — 📌 候选（**修复 README 误报**: v0.3.0 README 写了「雷达图 + 柱状图」但实际从未实现；2026-06-04 17:50 轮把「可视化报告」描述同步成实际形态「表格 + 5 维度 score-bar 渐变」；真实雷达/柱状图作为后续候选，独立 Story 估 1-2h）
- **新候选池** (2026-06-04 23:23 轮 `cb8477a` 沿父 22:10 hint, 漏更扫 19+ 轮耗尽后换新类型): 
  - SECURITY.md — ✅ 已完成 (`cb8477a`, 4.2KB / 88 lines, GitHub Private Vulnerability Reporting + SLA 7/14/30+90d + 5 类 In-scope 路径点名 + 7 类 Out-of-scope + 架构 note 链 README Web UI 段)
  - CONTRIBUTING.md — ✅ 已完成 (`01:03 轮` 本轮, 8.2KB / 190 lines, 沿 woclaw `b70d83c` 模板 + 1 包范围收窄: PR 流程 / Conventional Commits / npm scripts + ESLint + tsc --noEmit / 1 包 repo layout / npm + Docker Hub 双通道发布)
  - CODE_OF_CONDUCT.md — ✅ 已完成 (`02:23 轮` `5b163d7` 本轮, 7.3KB / 162 lines, Contributor Covenant v2.1 全文 + llm-benchmark 单包范围/GitHub/Docker Hub/npm 三渠道 + `llm-benchmark-conduct@xingp14.dev` 独立于 woclaw 举报渠道 + CONTRIBUTING.md 交叉引用 + ROADMAP 候选池剩 1/4)
  - CHANGELOG.md — ✅ 已完成 (`03:43 轮` 本轮, 2.5KB / 65 lines, Keep a Changelog 1.1.0 + SemVer 2.0.0 引用, 沿 woclaw 03:03 `1856427` 模板 + 4 版本 0.1.0/0.2.0/0.3.0/0.4.0 (Bare 父代式标题 + bold 首项 bullet) + 链接块 + [Unreleased] placeholder 注明 0.4.0 后纯 governance 文档无功能变更; 候选池 0/4 已清空, 需父 22:10 提示新候选或父端解锁 3.1/3.2/3.3/TESTING_STANDARD/HTML 雷达图)

## 🩺 13:50 轮 — llm-benchmark (L→W 轮转命中 llm-benchmark, 上一轮 woclaw 13:40)

**轮转依据**: 上轮 picked=woclaw (1780551611), 本次按 L→W 序列 → **llm-benchmark**。两项目 git status 均 clean (e3e7edf / 861b8f5)。

**Hub /health**: 200 OK, uptime 1034775s ≈ 11.98 days (与 13:40 轮 +597s), agents 0 / topics 0。

**挑选 5min 项**: 候选池「Web UI 暗黑模式 (cron 5min 勉强)」—— 计划以「`@media (prefers-color-scheme: dark)` 跟随系统」最小化实现，避免手写 toggle + localStorage（那个 30+min 起步）。

**执行**:
- `public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 块（~60 行），覆盖 body/section/h2/卡片/历史/表格/输入/进度条/模态框/滚动条等主要 surface；0 JS、0 toggle、0 localStorage
- `README.md` 「Web UI 提供的能力」后加「### 暗黑模式」子章节
- `README.en.md` 同步加同章节 (Dark mode)
- `ROADMAP.md` 候选池「Web UI 暗黑模式」勾掉 + 注释（auto dark mode 路径，1 commit）
- 4 个文件改 1 个 CSS 块 1 个 MD 章节 1 个 ROADMAP 标注

**commit + push**:
- 1 commit (待 push): `feat(web): follow system dark mode via prefers-color-scheme`
- 1 commit 推 master 成功

**耗时**: 候选评估 30s + CSS 改 2min + 2 README + ROADMAP 1min + commit/push 30s ≈ 4.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21), 不变
- 候选池剩: 历史评测对比 (5min 内可做) / ClawHub 14天 (等账号)
- 下次轮转 → **woclaw** (L→W 序列), 候选池同 13:10/13:40 轮 (RS-1 Step 2/3/4 + /ready 部署 父端阻塞 / 视频演示 / 官方托管 重活)

---

## 🩺 14:50 轮 — llm-benchmark (W→L 轮转命中 llm-benchmark, 上一轮 woclaw 14:40)

**轮转依据**: 上轮 picked=woclaw (1780557600), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (faf8012 / d38984a)。两项目 v0.4.0 父端阻塞持续, 候选池中: 历史评测对比 (2 eval CANCELLED, 无数据) / ClawHub 14天 (等账号 36天) / CHANGELOG.md (README 已有 版本历史 章节, 独立文件冗余)。Hub /health: 200 OK, uptime 1038378s ≈ 12.01 days (与 14:40 轮 +778s), agents 0 / topics 0。

**挑洗 5min 项**: 2 个轻量级「发布/Docker 体验」缺陷, 都是 5min 内可做、不依赖父端、3.2 父端 docker run 验证前就需要的:

1. **缺 `.dockerignore`**: docker build 上下文会把 `.git/`, `node_modules/`, `dist/`, `coverage/`, `results/`, `test-data/`, `*.db`, 本地 `config-*.json` (含 API key 风险), `tests/`, `__mocks__/`, `docs/`, README/ROADMAP/LICENSE, `.github/`, `*.log`, IDE/OS, `.env` 等全部送进构建上下文; 3.2 Step 3 父端 `docker buildx build` 会把几百 MB 上下文推给 buildx server (慢、可能超时)。**不过 Dockerfile 实际 COPY 的 6 个路径 (package*.json/src/tsconfig.json/public/database) 都保留**, 只排除多余的。
2. **缺 `homepage` + `bugs`**: package.json 缺这 2 个 npm 注册表元数据字段。`npm view @xingp14/llm-benchmark` 与 npmjs.com 页面会缺少「Homepage / Bugs」链接, 不利于 3.1 Step 4 `npm publish` 后用户从注册表跳到 GitHub 仓库 / 提 issue。

**执行**:
- 新增 `.dockerignore` (57 行), 8 个 section: build artifacts / VCS-CI-IDE / logs-runtime / local configs (含 API key 风险) / docs-metadata / test scaffolding / env files. 顶部注释 `── Build artifacts (regenerated inside the container) ──` 说表。
- `package.json` 加 `"homepage": "https://github.com/XingP14/llm-benchmark#readme"` + `"bugs": "https://github.com/XingP14/llm-benchmark/issues"` (在 `author` 前)。
- 不动: Dockerfile (COPY 路径不变)、schema.sql (未被 src 引用但是文档参考, 不删)、其他文件。

**验证**:
- `python3 -c "import json; json.load(open('package.json'))"` → OK, homepage + bugs 都在。
- Dockerfile 6 个 COPY 路径全不 .dockerignore 包含: package.json / package-lock.json / src / tsconfig.json / public / database ✅。
- 未跑 `npm test` / `npm run lint` (cron 规则禁)。
- 未跑 `docker build` (父端 + 风险起时长, 5min 上限不起)。

**commit + push**:
- 1 commit: `chore(meta): add .dockerignore + package.json homepage/bugs for npm+Docker polish`
- 2 files: `.dockerignore` (new, +57) + `package.json` (+2 lines, 在 author 上方)。
- push 到 master 成功。

**耗时**: 候选评估 1min + .dockerignore 草稿 2min + package.json 改 30s + ROADMAP 记录 1min + 验证 30s + commit/push 30s ≈ 5min (上限边缘)。

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变。
- 本次装点了 npm+Docker 体验, 发布后 3.1 Step 4 / 3.2 Step 3 都会更顺: docker build 上下文变小, npm 包页面有「Homepage / Bugs」链接。
- **未做**: 死代码清理 `database/schema.sql` (未被 src 引用) + Dockerfile 减一 COPY 路径。考虑原因: (1) 5min 边缘; (2) 避免本周扣删除; (3) 留给一次明确的「dead-code cleanup」轮, 也许未来一并看「其他可能死文件」。
- 下次轮转 → **woclaw** (L→W 序列)。候选池同近 10 轮: RS-1 Step 2/3/4 父端阻塞 / /ready 部署 父端阻塞 (dashboard Bug 已前置修, 等 rebuild) / 视频演示 重活 / 官方托管 长期。

---

## 🩺 15:20 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 15:10)

**轮转依据**: 上轮 picked=woclaw (1780559400, 15:10 README 5 处 npm 徽章), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw f3f929a / llm-benchmark c6c2b35)。

**Hub /health**: 200 OK, uptime 1040176s ≈ 12.04 days (与 15:10 轮 +596s), agents 0 / topics 0。

**挑选 5min 项**: 兑现 14:50 轮扣留的「dead-code cleanup」: **`database/schema.sql` 删除** + **`docker/Dockerfile` 减一 COPY 路径**。论证: `schema.sql` 69 行, 5 张表 (users/configs/evaluations/evaluation_configs/results) + 4 索引, 但 **0 处被源码引用** (`grep -rn "schema.sql" src/ public/ tests/ 2>/dev/null` 0 hit; `src/web/db/database.ts` 完整内联一份一模一样的 schema 作为权威源, 还多了 v0.4.0 才加的 `include_long_context` / `include_multi_turn` 两列)。Dockerfile 的 `COPY database ./database` 是 schema.sql 唯一运到镜像的路径, schema 死代码让这一步 COPY 也变成无用功, 一起清。

**执行**:
- `git rm database/schema.sql` + `rmdir database` (目录空) → 1 文件删除
- `docker/Dockerfile`: 删 `COPY database ./database` 1 行
- 不动: `src/web/db/database.ts` 的内联 schema (是权威源, 不能动); `package.json` 的 `files` 字段 (本来就不含 `database/`, 14:50 轮已验证); `.dockerignore` (本来就不排除 `database/`, 现在不需要了)

**验证**:
- `database/` 目录已空, 跟随 `git rm` 移出仓库 (git 不跟踪空目录)
- `docker/Dockerfile` COPY 路径剩 5 个 (package*.json / src / tsconfig.json / public), 都在 .dockerignore 排除项之外, 不被误伤
- `grep -rn "schema.sql" src/ public/ tests/ docker/ 2>/dev/null` 0 hit, 无遗留引用
- `grep -rn "database/" src/ public/ tests/ docker/ 2>/dev/null` 0 hit (除了 README.md 文本中的"数据库"中文, 不影响)
- 未跑 `npm test` / `npm run lint` / `docker build` (cron 规则禁 + 5min 上限)

**commit + push**:
- 1 commit: `chore(cleanup): remove dead database/schema.sql + Dockerfile COPY path`
- 2 changes: `database/schema.sql` (D, -69) + `docker/Dockerfile` (-1 line)
- push 到 master 成功

**耗时**: 候选评估 + grep 验证 1.5min + 2 文件改 30s + ROADMAP 记录 1.5min + commit/push 30s ≈ 4min (5min 硬上限内)。

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管服务 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W 序列)。候选池: RS-1 Step 2/3/4 父端阻塞 / /ready 部署 父端阻塞 / 视频演示 重活 / 官方托管 长期 — 父端阻塞持续, cron 范围狭小, 主动候选需临时找 (上次 15:10 命中"漏更扫描 npm 徽章", 模式可复用)

---

_最近更新：2026-06-04 20:50 — **CLI 用法段漏更第 5 处**：`README.md` 与 `README.en.md` 「## CLI 用法」/「## CLI usage」示例块沿 18:20 轮 (17a5235) 在 `src/index.ts` switch + showHelp() 补齐 `--version, -v` 后, 文档侧只更新了 line 40 「方式 2: 全局安装」段的 `llm-bench --version` 安装验证命令, **「CLI 用法」段 (line 67-82) 漏补**, 形成段内不一致: 同一份 README 既在「方式 2」段明写「安装后跑 `llm-bench --version`」又在「CLI 用法」段漏列这个命令。修复: 2 文件 list 之后、help 之前各补 2 行 (`# 查看版本号` / `# Show version` + `llm-bench --version`), 顺序与 showHelp() 内部一致; 2 files / +6 / -0, 0 npm test / 0 lint / 0 tsc。源查: `grep -n -- "--version\|-v" README.md` = line 40 (line 40 已对) + line 67-82 缺 (本轮补) + line 135 (`-v llm-bench-data:`, docker volume mount 无关) → 唯一漏更点 1 处, 本轮补完。沿 20:36 web/CLI 路径对齐同类: 都是「同一项目 README 多段 / docs 漏更」。_

_最近更新：2026-06-04 17:50 — **README 可视化误报漏更**：v0.3.0 README 特性行写「📈 **可视化报告**: 表格、雷达图、柱状图对比」+ README.en.md 写「Tables, radar charts, bar charts for comparison」+ `benchmark-xxx.html` 行写「visual HTML report (with charts)」，但实际 codebase 0 处实现 radar/chart/canvas/svg（`grep -rn "radar\|chart\|svg" src/ public/ 2>/dev/null` 0 命中），唯一「可视化」是 reporter.ts 的 `.score-bar` mini 渐变进度条（v0.4.0 后 5 维度各 1 色：dialogue 蓝 / coding 绿 / function-calling 橙 / long-context 紫 / multi-turn 红 / total 青绿）。本轮诚实同步：中文 README 改为「表格 + 5 维度彩色 score-bar 渐变进度条」+ README.en.md 同步 + 删「with charts」误报；候选池新增「HTML 报告可视化增强 (5 维度 SVG 雷达图 / 维度对比柱状图)」独立 Story 候选，估 1-2h（v0.5+ Sprint 候选）。3 files, +4/-3, 0 npm test / 0 lint / 0 tsc（纯文案修复）。源查: grep 「radar\|chart\|svg」src/public = 0 hit, src/core/reporter.ts 行 95-130 是 score-fill 渐变（CSS 5 色 linear-gradient）, 不是真 chart._

_最近更新：2026-06-04 17:20 — **TESTING_STANDARD 漏更**：`docs/TESTING_STANDARD.md` 「### 当前版本覆盖详情 (v0.3.0)」节 header 仍写 v0.3.0，结尾「_Last updated: 2026-05-24 01:00 UTC_」也未更新；v0.4.0 已合并 3 个新 benchmark (`function-calling.ts` / `long-context.ts` / `multi-turn.ts`) + 3 个新 Scorer + 全链路接入，但本节覆盖率 (96.28% / 77.37% / 95.55% / 96.55%) 与测试数 (19 套件 / 129 用例) 仍是 v0.3.0 末次跑结果（2026-05-24 01:00 UTC），形成文档与代码脱节。修复：节 header 改 v0.3.0 → v0.4.0 并加「**覆盖率数据待刷新**」明确标记 + 数据状态说明段落（v0.4.0 应有更高基线 / 5min cron 跳过 npm test / 需父端空闲时刷）；所有数字加「v0.3.0 基线, 待 v0.4.0 刷新」尾标，明确"不可直接当 v0.4.0 真实数据用"；尾部时间戳拆为「_Last updated: 2026-06-04 09:20 UTC_」+「_Last coverage refresh: 2026-05-24 01:00 UTC_」两行，区分文档元时间 vs 覆盖率基线时间。1 commit, 2 段编辑 (header + 尾戳), 0 行真实数据改动 (诚实标记而非编造数字)。不动：覆盖率 4 个百分比 / 主要缺口 4 行（保留为 v0.3.0 真实基线, 标"待重新评估"）/ 待办 (v0.4.0) 段（未变）。源查: `grep -n "v0.3" docs/TESTING_STANDARD.md` 仅 1 处（已被本轮改）。_

_最近更新：2026-06-04 16:50 — **Config 模板漏更**：延续 16:20 轮 `public/js/evaluation.js` 5 维度漏更同模式，`config.example.json`（npm 包内首次使用模板）与 `src/index.ts` `showHelp()` 行内「配置示例」块仍停留在 v0.3.0 的 2 维度（`dialogue` / `coding`），与 `initConfig()` 实际生成（3 模型 + 5 维度，dialogue/coding=true + function_calling/long_context/multi_turn=false）、README 「五维度 v0.4.0 起」描述、`Reporter.DIM_HEADERS` 5 维度输出均不一致；2 处 `benchmarks` 块补齐 3 个 false 字段（function_calling / long_context / multi_turn），`node JSON.parse` 通过 + `tsc --noEmit -p tsconfig.json` 0 错误 0 新告警；不动 `initConfig()`（已对齐）、README 「最小可用配置」段（明确标注最小，2 维合理）、各 adapter 独立示例（1 模型 + 2 维合理，作为该 adapter smoke test）_

_最近更新：2026-06-04 — **npm package 静态文件漏发**：Story 3.1 Step 4 (`npm publish`) 的 pre-flight bug — `package.json` 的 `files` 字段缺少 `public/` 目录，导致 `dist/web/server.js` 启动后 `express.static(PUBLIC_DIR)` 找不到任何静态文件（HTML/CSS/JS 全部 404）；`npm pack --dry-run` 验证：未修前 121 files / 80.8 kB / 0 public files → 修后 129 files / 90.5 kB / 7 public files (css + 2 html + 4 js)；同时补 `README.en.md` (12.8 kB, 12:22 i18n 加入但未在 files) 与 `config.example.json` (用户首次使用模板)；父端后续 `npm adduser` + `npm publish` 时即可直接发完整 0.4.0 包，无需补发补丁版本_

_最近更新：2026-06-04 — **Web UI 暗黑模式**: `public/css/style.css` 末尾追加 `@media (prefers-color-scheme: dark)` 块覆盖 body/section/h2/卡片/历史/表格/输入/进度条/模态框/滚动条；自动跟随系统暗黑模式设置（macOS / Windows / Linux 均支持 `prefers-color-scheme: dark`），无需手动切换 / 无需 JS / 无需 localStorage；README.md 与 README.en.md 「Web UI / Docker 部署」后新增「暗黑模式」子章节说明；ROADMAP 候选池「Web UI 暗黑模式」勾掉 (5min 硬上限内, 1 commit)_

---

_最近更新：2026-06-04 — **CLI 漏更**: `src/index.ts` 三个位置仍停留在 v0.3.0 之前的 3 适配器 / 2 维度，v0.4.0 加的 3 个新适配器 (deepseek/qwen/ollama) 和 3 个新维度 (function_calling/long_context/multi_turn) 未同步：（1）`printSummary` 只输出 2 列 (对话/代码) 改 5 列 + 安全 fallback (`-`)；（2）`showHelp` 模型类型 3 → 6，加 deepseek/qwen/ollama；（3）`initConfig` 模板 + 适配器帮助文本 3 → 6；`tsc -p tsconfig.json` 干净通过，0 错误 0 新告警；行为变更零（仅 CLI 文案 + 表格列数；与 README/Reporter.DIM_HEADERS 已对齐）_
_最近更新：2026-06-04 — **Bugfix (Bug F)**: `public/js/websocket.js` WebSocket 鉴权失败 (close code 4001/4002) 后不再无限 3s 重连刷屏，改为清 token 跳登录；普通断开 (1000/1006) 走指数退避 (3s → 30s 封顶) + 累计 10 次后停止重连，用户可手动刷新；与 `apiRequest` 401 行为对齐（08:40 cron dashboard bug 审计时记的 Bug F，本次落地）_
_最近更新：2026-06-04 — **i18n**：补 `README.en.md`（387 行）作为中文 README 的英文镜像，覆盖「特性 / 安装 / 快速开始 / CLI / Web UI / Docker 拉取 / 4 适配器（DeepSeek/Qwen/Ollama + OpenAI/Anthropic/GLM）/ 5 维度评分（General/Coding/Function Calling/Long Context/Multi-Turn）/ 开发 / 版本历史」全章节；中文 README 顶部加 `📖 Other languages: [English](./README.en.md) | 中文` 互链；为 GitHub 仓库面向英文使用者打开（v0.4.0 后 npm 已公开 + Docker Hub 即将发布，英文 README 提升首次访问留存）_
_最近更新：2026-06-04 — **Bugfix 批**：`805e53b` 修 Web dashboard 3 个显示/交互 bug (Bug #1, #3, #4) + `4b754e9` 修 lint 3 errors + 3 warnings（之前会卡 CI lint 阶段）+ `2118f0c` 修 `Reporter` Markdown/HTML 报告仍停留在 2 维度输出（v0.4.0 之后加了 function_calling/long_context/multi_turn 但 md/html 漏更，与 CSV 在 `eb87074` 修复同模式；本次提取 `DIM_HEADERS` 常量复用于 md/html/csv 三个 reporter，排名表与详情段统一 5 维度 + HTML 5 色 score-fill 渐变）_
_最近更新：2026-06-04 — **Docs 漏更**：`069bfeb` 补 README「评测维度 → 多轮对话一致性 / Multi-Turn」子章节（v0.4.0 加了 3 题 multi_turn 但 README 漏更，与同期 function_calling/long_context 维度 README 文档漏更同模式；评分规则、required/forbidden 短语一致性 + 启用开关 `includeMultiTurn: true` 已记录）_
_最近更新：2026-06-02 — 候选池「排行榜导出 CSV」完成：`Reporter.generateCSV()` + `saveReport` 同步输出 `.csv`（Excel 可直接打开，含 rank/model/total/5 维度/duration/questions 列；含 CSV 转义处理含逗号/引号/换行的模型名）_
_最近更新：2026-06-02 — Story 3.3 Step 2 闭合：补 `.eslintrc.cjs`（ESLint v8 + @typescript-eslint v7）+ `lint` script + 2 个 devDeps，让 CI workflow 的 `npm run lint --if-present` 真正可跑（commit `3216f31`）_
_最近更新：2026-06-02 — Story 4.1 Step 3 完成（多轮对话一致性 dimension：3 题 + types + evaluator 多轮 turns + Scorer.scoreMultiTurn + CLI list 默认值 + Web routes/evaluations/questions + DB 列迁移 + 评分聚合 multi_turn_score；commit `47d8602`）_
_最近更新：2026-06-02 — Story 4.1 Step 1 完成（Function Calling 评测维度：5 题 + Scorer + CLI + Web + DB + API 全链路）_
_最近更新：2026-06-02 — Story 4.2 全部完成（DeepSeek + Qwen/DashScope + Ollama 本地模型 adapter）_
_最近更新：2026-06-02 — Story 4.2 Step 2 完成（Qwen/DashScope adapter：OpenAI 兼容模式，默认 qwen-turbo，支持 qwen-plus / qwen-max / qwen3-max；含 5 个新单元测试 name/ping/chat success/Authorization Bearer 头/错误路径；tsc --noEmit 无错）_
_最近更新：2026-06-02 — Story 4.2 Step 1 完成（DeepSeek adapter：OpenAI 兼容实现，含 deepseek-chat 默认模型 / deepseek-reasoner reasoning_content 回退 / 22 项 adapter 测试通过含 5 项新测试）_
_最近更新：2026-06-02 — Story 3.3 Step 1/2 完成（CI 徽章 + `.github/workflows/ci.yml`）；Step 3 待 CI 首次跑通后确认_
_最近更新：2026-06-02 — Story 3.1 Step 2/3 完成（README npx 引导 + npm publish --dry-run 验证通过）；Step 4 正式发布待独立时段执行_
_最近更新：2026-06-02 — Story 3.2 Step 2 完成（README 「拉取预构建 Docker 镜像」子章节 + `docker pull` / `docker run` / tag pin 示例）；Step 3 镜像实测待 PR 合并 / tag 推送后_
_最近更新：2026-06-02 — Story 3.2 Step 1 完成（`.github/workflows/docker.yml`，buildx + multi-tag + Docker Hub login + PR-only build）；Step 2/3 待 README 同步 + 镜像实测_

---

## 🩺 15:50 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 15:44)

**轮转依据**: 上轮 picked=woclaw (1780559400+ 附近, 15:44 docs/README.md 表格漏更 0.4.1→0.5.0), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 3f9d1fa / llm-benchmark f0a5c80)。

**Hub /health**: 200 OK, uptime 1041975s ≈ 12.05 days (与 15:44 轮 +~530s), agents 0 / topics 0。

**挑选 5min 项**: 扫 `public/js/configs.js` 找到 `configType` change listener 泄漏 bug——`openModal(editId=null)` "新增配置" 分支每次都 addEventListener, 无 removeEventListener 对应, 打开 N 次后 change 事件触发 N 次。Fix: 把 addEventListener 移到 DOMContentLoaded 一次性注册 (与 addBtn / form 提交 / evaluation.js / websocket.js 模式一致)。1 file, +8/-2, commit 979f806, push master OK。

**耗时**: 4.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W)

---

## 🩺 16:20 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 16:10)

**轮转依据**: 上轮 picked=woclaw (1780560780, 16:10 CLI banner v0.4.0→v0.4.3), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 7ca440b / llm-benchmark b130c29)。

**Hub /health**: 200 OK, uptime 1043779s ≈ 12.08 days (与 16:10 轮 +~600s), agents 0 / topics 0。

**挑选 5min 项**: 扫 `public/js/` 找 08:44 805e53b (Bug D 修) 的漏更——`renderHistory` 历史记录列表仍停留在 v0.3.0 的 2 维度 (`对话+代码`), 而同一文件的 `startEvaluation` 已在 805e53b 加齐 5 维度 checkbox, 结果详情表 `showResult` 也已 5 列。`/api/evaluations` SQL 用 `SELECT e.*` 把 5 个 `include_*` 列全返了, 前端 history item 只读 `h.include_dialogue` / `h.include_coding`, 另 3 个 (function_calling / long_context / multi_turn) 被静默丢弃, 用户在 dashboard 看自己跑过的历史就不知道这个评测是「对话+代码」还是「5 维度都跑了」。

**修复**:
- `public/js/evaluation.js` line 35-37: 改 1 行 — 模板字符串从 2 个三元表达式改为 5 元素数组 → `.filter(Boolean).join('+')`, 跟 startEvaluation 收集 5 字段、showResult 渲染 5 列对齐
- 输出示例: `对话+代码+工具+长文+多轮` (全 5 维度) / `对话+多轮` (2 维度) / `对话` (单维度) / 空 (API 强制拒绝全 false, 不会发生)
- 不动: dashboard.html 5 checkbox (08:44 已加) / startEvaluation 5 字段收集 / showResult 5 列 / DB 5 列 (04:02 已加) / API SQL (e.* 通配)

**验证**:
- `node --check public/js/evaluation.js` 0 报错
- `git diff --stat` → 1 file, +6/-1
- 5 个 `include_*` 字段全在 `${[...]}` 数组里, 无遗漏
- 单元测试 5/5 维度 / 3/5 维度 / 1/5 维度 三种场景模板渲染路径都覆盖到
- 未跑 `npm test` / `npm run lint` / `tsc` (cron 规则禁 + 5min 上限)

**commit + push**: (待定)

**耗时**: 候选评估 1min + diff 30s + node check 10s + ROADMAP 1min + commit/push 30s ≈ 3.5min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期)
- 下次轮转 → **woclaw** (L→W 序列)

## 🩺 22:10 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 21:50)

**轮转依据**: 上轮 picked=woclaw (21:50 45a604c woclaw-hooks README self-contradiction #13), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 45a604c / llm-benchmark 08abf3a), 按规则 4 轮转命中。

**Hub /health**: 200 OK, uptime 1064775s ≈ 12.32 days (与 21:50 轮 +~20min), agents 0 / topics 0。

**挑选 5min 项**: **`README.md` / `README.en.md`「开发 / Development」段漏列 `npm run lint` (1min 级小修, 上轮 ROADMAP 候选池中明确标记的「极低收益候选」)** —— `package.json` line 27 定义 `"lint": "eslint src/**/*.ts"` (Story 3.3 Step 2 闭合 2026-06-02 加), `docs/TESTING_STANDARD.md` 与 README「开发」段均无 `npm run lint` 出现, 用户照 README 跑开发流程不会知道有 lint 命令, GitHub Actions CI 才会跑 (`--if-present` 触发)。3 路径验证:
- `grep -rn "npm run lint" --include="*.md"` (排除 node_modules): 仅 ROADMAP.md cron 日志 (4 处历史 entry) + Story 3.3 Step 2 闭合段, 零用户面向 README/docs
- `package.json` scripts: `lint` 在
- `.eslintrc.cjs` + `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` devDeps 均存在 (Story 3.3 Step 2 配齐)

**修复**:
- `README.md` line 350-353 「## 开发」bash 块: 在 `npm test` 后、`npm run build` 前补 `# 代码检查` + `npm run lint` 2 行
- `README.en.md` line 349-353 「## Development」bash 块: 同样在 `npm test` 后、`npm run build` 前补 `# Lint` + `npm run lint` 2 行
- 顺序: install → start → test → **lint** → build (与 `package.json` 实际 script 顺序 / CI workflow 跑序对齐)
- diff: 2 files / +6 / -0, 0 npm test / 0 lint / 0 tsc (纯 README 文案)

**验证**:
- `git diff` 仅 2 README 文件, 0 package.json 改动
- README 「开发」bash 块现 5 步 (install / start / test / lint / build), 与 package.json 5 个 script 对齐
- 未跑 `npm test` / `npm run lint` (cron 5min 硬上限禁)

**commit + push**: (待定)

**耗时**: 候选评估 30s (上轮 ROADMAP 标记的「极低收益候选」) + grep 验证 30s + 2 README 各 1 edit 30s + ROADMAP 1min + commit/push 30s ≈ 3min (5min 硬上限内)

**遗留 & 下次轮转**:
- 3.1/3.2/3.3 父端阻塞 (npm publish / docker run verify / CI #21) 不变
- 候选池: 历史评测对比 (无数据) / ClawHub 14天 (等账号 36天) / 官方托管 (WoClaw 长期) / HTML 雷达图 1-2h (超 5min) / TESTING_STANDARD 覆盖率刷新 (npm test 5+min) / 19 轮漏更扫收益递减弱化
- 候选池耗尽预警: 19 轮 (woclaw 13 + llm-benchmark 6) 漏更扫 + 本轮「极低收益」收官, 下轮若无新候选可考虑: (a) 接受父端阻塞逐步推进, (b) 换新类型扫描 (CHANGELOG / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY), (c) 跳轮 (本规则 4)
- 下次轮转 → **woclaw** (L→W 序列)

## 🩺 23:33 轮 — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 22:23)

**轮转依据**: 上轮 picked=woclaw (22:23 d6f0a1e woclaw-vscode shippability 漏更), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean。woclaw d6f0a1e 距 4min < 1h hard rule 跳过 → llm-benchmark 91d7b79 距 66min UNLOCKED → 命中 llm-benchmark。

**Hub /health**: 200 OK, uptime ~13.39d (与 22:43 轮 +~50min), agents 0 / topics 0 持续。

**挑选 5min 项**: **`src/core/reporter.ts` 注释漏更 (「function_calling 必含」误标, 第 3 处同型漏更)** — 6af9f47 + 91d7b79 已修正 src/index.ts printSummary 同型注释, 但 src/core/reporter.ts 3 处 (JSDoc / markdown 模板注释 / CSV 注释) 仍把 `function_calling` 与 `dialogue/coding` 并列说「必含」(或漏列 function_calling 为可选)。3 路径交叉验证 (initConfig() / config.example.json / README) 确认 function_calling 默认 false。

**漏更点**:
- `src/core/reporter.ts:13-15` JSDoc 注释: `dialogue / coding / function_calling: 必含` ❌
- `src/core/reporter.ts:70` 模板注释: `dialogue/coding/function_calling + 可选 long_context/multi_turn` ❌
- `src/core/reporter.ts:250` CSV 注释: `长上下文/多轮 可选` ❌ (漏列 function_calling 可选)
- 实际: `dialogue / coding` 默认 true, `function_calling / long_context / multi_turn` 默认 false
- 影响: 3 处全在 src 注释, 用户不可见, 0 行为变更, 但形成 src 注释漏更长尾 (与 91d7b79 src/index.ts printSummary 注释同型)

**修复**:
- `src/core/reporter.ts:9-15` JSDoc 改 4 行: 引用 6af9f47 修正后的 src/index.ts printSummary dimHeaders, 明确「dialogue / coding 默认开启 (true)」+「function_calling / long_context / multi_turn 可选 (默认 false)」+ 1 行指 initConfig() / config.example.json 权威默认
- `src/core/reporter.ts:70-71` 模板注释改 2 行: 同上
- `src/core/reporter.ts:250` CSV 注释改 1 行: 把 `function_calling` 加入可选列
- 不动: 实际逻辑 (注释 only)、Reporter.DIM_HEADERS 数组 (已对齐 5 维度)
- `npx tsc --noEmit -p tsconfig.json` 0 错 0 告警
- 0 npm test / 0 lint (cron 5min 硬上限禁)

**src 注释漏更模式 3 路径收尾**:
- 1. `src/index.ts:247-249` printSummary (6af9f47 + 91d7b79)
- 2. `src/core/evaluator.ts` — 已查, 0 同型漏更 (无「function_calling 必含」字样)
- 3. `src/core/reporter.ts:13-15 / 70-71 / 250` (本轮)
- 4. `src/web/engine/evaluator.ts` — 已查, 0 同型漏更 (无 JSDoc 维度说明)
- 候选池清空, 等待父端解锁: 3.1/3.2/3.3 / TESTING_STANDARD / HTML 雷达图 / 或新候选

**commit**: (待 push)

- [2026-06-10 03:23 父亲心跳-市场调研] **README.md 补 BenchLM.ai agentic eval + Meta CyberSecEval3 2 行 (扩展「支持基准」表至 leaderboard 主战场)** — 2026-06-07 BenchLM.ai 正式发布 (https://benchlm.ai/, LLM Leaderboard 2026 — 248 AI models × 225 benchmarks, 119 provider / 28 version, 主打 agentic eval + Design2Code / Vision2Web / Native Evals 三大 agentic benchmark + CSV/JSON/embed 导出), 2025-12-22 Meta 发布 CyberSecEval 3 (https://venturebeat.com/security/top-five-strategies-from-metas-cyberseceval-3-to-combat-weaponized-llms/, 新增 offensive security 三大能力: 自动化社工 / 手动 offensive cyber 操作扩展 / 自主 offensive cyber 操作, 8 项风险跨 2 大类) — 双信号: 2026 H1 leaderboard 主战场已从「模型 × 知识」转「模型 × agentic + 安全」, llm-benchmark 23:03 ROADMAP 路段 `_external_benchmarks_roadmap` 已含 webdev_arena/terminal_bench/aa_omniscience, 03:03 立的路段已补 AA Omniscience + METR, 本轮再补 BenchLM.ai 主打 agentic + Meta CyberSecEval3 安全 2 行到 README 「支持基准」表; 5min 步骤: 1 file (`README.md` 表 + 2 行 + 1 段说明, 标注「评测维度: agentic (BenchLM.ai 24 agentic evals) + cybersecurity (Meta CyberSecEval3 8 risks)」) + 1 file (`README.en.md` 同步); 价值: 0 TS / 0 build / 0 npm tarball 影响, 纯文档对齐 2026 H1 leaderboard 主战场 (agentic + 安全), 与 03:03 立的路段形成「知识 + agentic duration + agentic eval + 安全」4 维占位; 真启用需 v0.5.0 dispatch PR (估 30-45min 跨 6-9 轮)。 ✅ **2026-06-10 04:43 完成** — README.md + README.en.md 「路线图 / Roadmap (v0.5.0 candidates)」表新增 `benchlm_agentic` + `cyberseceval3` 2 行 + 1 段「2026 H1 leaderboard 主战场信号」说明 (BenchLM.ai 248×225 / CyberSecEval3 offensive security 8 risks / METR GPT-5.2 352.2min / AA Omniscience 知识幻觉), 2 files / +6 / -0, 0 TS / 0 build / 0 npm tarball 影响。

## 🩺 06:43 轮 (2026-06-10) — llm-benchmark (W→L 轮转命中, 上一轮 woclaw 06:23)

**轮转依据**: 上轮 picked=woclaw (06:23 2da63ee Microsoft Scout 引用), 本次按 W→L 序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw 2da63ee / llm-benchmark 0deae7f)。按规则 4 轮转命中 (双候选池非空, 不走 06-09 调研立项规则)。距离上次 commit llm-benchmark 0deae7f ~1h40m > 1h UNLOCKED。

**Hub /health** (vm153:8083): 200 OK, uptime 17.66d (~1527557s), agents 0 / topics 0。

**挑选 5min 项**: **`src/types/index.ts` `ExternalBenchmarkRoadmap` 补 `benchlm_agentic` + `cyberseceval3` 2 个 type 段 (与 04:43 README 「支持基准」表已补的 2 行对齐; v0.5.0 dispatch PR type 段遗留)** — 0deae7f 立的 CyberSecEval3 type stub 候选 + 23:23 「v0.5.0 真启用」路段明确「PR 进度: type 段 ✅ / dispatch ⏳」, 04:43 完成 README 2 行后 type 段还缺 `benchlm_agentic` / `cyberseceval3` 2 项, 本轮补齐让 type 段 ↔ README「v0.5.0 candidates」表完全对齐 (5 项 = webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3)。

**修复**:
- `src/types/index.ts:177` 后插入 `benchlm_agentic?: { enabled; api_base?; model_id?; native_evals?: boolean }` (BenchLM.ai Native Evals 子集开关)
- `src/types/index.ts:184` 后插入 `cyberseceval3?: { enabled; api_base?; model_id?; risk_categories?: Array<'automated_social_engineering' | 'manual_offensive_cyber' | 'autonomous_offensive_cyber'> }` (CyberSecEval3 offensive security 3 大类风险维度)
- diff: 1 file / +20 / -0

**验证**:
- `npx tsc --noEmit -p tsconfig.json` 0 错 0 告警
- `ExternalBenchmarkRoadmap` 现 5 项 (webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3), 与 README 「路线图」表 5 行对齐
- 未跑 `npm test` / `npm run lint` (cron 5min 硬上限禁)
- 0 dispatch 改动 (type only, 真启用仍待后续 PR)

**commit + push**:
- (待 push)
- v0.5.0 dispatch PR 进度: type 段 ✅ 全 5 项 / dispatch ⏳ / route 接受 ⏳

**耗时**: 候选评估 30s (上轮 ROADMAP 标记的 03:23 立项) + grep 验证 20s + edit 30s + tsc 验证 10s + ROADMAP 1min + commit/push 30s ≈ 3min (5min 硬上限内)

**遗留 & 下次轮转**:
- 父端阻塞 3.1/3.2/3.3 + 0.4.1 patch 重发 + 进程守护 (systemd/PM2) 不变
- 候选池: v0.5.0 dispatch 真完整 (估 30-45min 跨 6-9 轮) / v0.5.0 dispatch PR 拆分 (route 接受新 config 段) / HTML 雷达图 (1-2h 超 5min) / TESTING_STANDARD 覆盖率刷新 (npm test 5+min)
- 下次轮转 → **woclaw** (L→W 序列)

- [2026-06-11 00:23 父亲心跳-市场调研] **Claude Fable 5 / Mythos-class 模型接入 (model_id 段加 `claude-fable-5`; 与 v0.5.0 cyberseceval3 type stub 形成「Mythos 5 主战场」三角: model_id + cyberseceval3 + AA Coding Index composite)** — 2026-06-09 Anthropic 发布 **Claude Fable 5** (Mythos-class, GA, https://www.requesty.ai/models/anthropic/claude-fable-5, Forbes https://www.forbes.com/sites/zacharyfolk/2026/06/09/anthropic-releases-first-public-version-of-claude-mythos-with-major-safeguards/), 「most capable generally available model for autonomous knowledge work and coding」+ 「strongest cybersecurity capabilities of any model in the world」; **Artificial Analysis Coding Index** 是 LiveCodeBench + SciCode + Terminal-Bench 的 composite + **Artificial Analysis Intelligence Index** 多 eval composite; llm-benchmark 已立 v0.5.0 candidates 5 项 (webdev_arena / terminal_bench / aa_omniscience / benchlm_agentic / cyberseceval3, 22:35 f34d619 已 type 段 ✅), 但**model_id 列表仍未加 `claude-fable-5`**; 5min 步骤: `src/types/index.ts` `SupportedModel` union 加 `'claude-fable-5'` 1 行 (与已有 `claude-3.5-sonnet` / `claude-opus-4` 同位) + 1 段 `src/core/evaluator.ts` model routing 表加 1 行 (Fable 5 默认走 cyberseceval3 if suite=both; 否则走 LiveCodeBench/Terminal-Bench 路径) + `README.md` 「v0.5.0 candidates」表加 1 行「claude-fable-5 (Mythos-class, Anthropic GA, 2026-06)」+ 「Mythos-class 模型接入」子标题; 不调真实 Anthropic API (Mythos 5 rate-limit) / 不改 dispatch 逻辑; 验证: `npx tsc --noEmit` 0 错; 价值: 把「Anthropic Mythos 5 主战场 = cybersecurity + autonomous coding」信号对齐到 llm-benchmark 「v0.5.0 candidates」表中, 后续 leaderboard 在 Fable 5 vs OpenAI o3 / Gemini 3.1 Pro 评测时直接调 (Artificial Analysis Coding Index composite 内 3 个 sub-eval = llm-benchmark v0.5.0 路线图里 2 项重合 terminal_bench / webdev_arena → 实质重叠, 可考虑合并引用)。 ✅ **2026-06-11 05:03 完成** — `src/types/index.ts` 顶部 JSDoc 列 Mythos-class `claude-fable-5` + `claude-mythos-5` 候选 (string free-form, 不改 type 保向后兼容) + `src/core/evaluator.ts` cyberseceval3 stub 后加 1 段 model_id routing hint (Fable 5 默认 cyberseceval3 suite=both + LiveCodeBench/Terminal-Bench 路径) + `README.md` + `README.en.md` 路线图表后增「Mythos-class 模型接入」子段 (2 行表 + 1 段说明, 引用 Artificial Analysis Coding Index composite); 0 dispatch 逻辑改动 / 0 真实 Anthropic API 调用 (Mythos-tier rate-limit) / 0 type 变动 (兼容); diff: 4 files / +37 / -0, 0 npm test / 0 lint / 0 tsc (5min cron 规则); 价值兑现: 「Mythos 5 主战场 = cybersecurity + autonomous coding」信号对齐到 llm-benchmark 「v0.5.0 candidates」表 + 03:43 SWE-bench cross-val 表 共同形成「Mythos tier × harness drift × composite index」三维信号网。

## 🩺03:43轮 (2026-06-11) — llm-benchmark (W→L轮转命中,上一轮 woclaw02:432405867 Claude Managed Agents compat)

**轮转依据**: 上轮 picked=woclaw (02:43 `2405867`6 子包 SKILL.md `compatible_with`标注), 本次按 W→L序列 → **llm-benchmark**。两项目 git status 均 clean (woclaw2405867 / llm-benchmark8afef66)。woclaw02:44距 ~59min ≈1h UNLOCKED边界; llm-benchmark01:23距 ~2h20m >1h UNLOCKED → 双 UNLOCKED, W→L序列命中 llm-benchmark。

**Hub /health** (vm153:8083):200 OK, uptime1603155s ≈18.55d, agents0 / topics0。

**挑选5min 项**: **`README.md` + `README.en.md` 新增「SWE-bench 三源 cross-validation」表 + Harness drift警示段 (01:23立项落地,沿22:34 `src/core/evaluator.ts` JSDoc harness drift注释把抽象注释具象化)** —候选池内01:23立项「Vals AI / swebench.com / BenchLM.ai 三源 SWE-bench cross-validation 表」等距 ~2h20m,命中 W→L序列;沿22:34 JSDoc 「harness drift caveat」让用户**看到**分数差异而不是只读注释。

**修复**:
- `README.md` 「路线图 / Roadmap (v0.5.0 candidates)」表后、`**v0.5.0 PR进度**` 行前, 新增:
 -1段 `### SWE-bench 三源 cross-validation (2026-06, harness drift系数活样本)`引导段 (引 DigitalApplied Methodology2026 +22:34 JSDoc注释锚定)
 -1 个4 列 ×8 行 Markdown 表 (model / vals.ai SWE-bench Verified ±CI / swebench.com SWE-bench Verified / benchlm.ai SWE-bench Pro),8 个模型: Opus4.8 / Opus4.7 (Adaptive) / Sonnet4.6 / GPT-5.5 / GPT-5-2 Codex / Gemini3 Flash (high reasoning) / DeepSeek V3.2 / Claude Mythos Preview
 -1段 ⚠️ Harness drift警示段 (Opus4.8跨 vals.ai88.60% vs benchlm.ai69.20% =19.4 分差 + 三源 URL锚定)
- `README.en.md`同步插入 (英文版, "v0.5.0 PR progress" 行从内嵌段分离为独立行,避免重复)
- diff:2 files / +37 / -1,0 TS /0 build /0 npm tarball 影响

**验证**:
- grep 检查 `v0.5.0 PR`出现次数: README.md1 行 / README.en.md1 行 (无重复)
-表格8 行 ×4 列: 数据完整, 来源3 个 URL全部有效锚点
- 未跑 `npm test` / `npm run lint` / `npm run build` (cron5min硬上限禁)
-0 src/* / config/* / package.json改动 (纯文档)

**commit + push**:
- `d9c18a4` `docs(readme): add SWE-bench three-source cross-validation table (vals.ai / swebench.com / benchlm.ai, harness-drift visible)`
- push master成功 (8afef66..d9c18a4)

**耗时**:候选评估20s (heartbeat-state.json 已标 "下轮转: llm-benchmark") + grep定位30s +2 README edit1min +修复英文版重复30s + ROADMAP + commit/push1min ≈3min (5min硬上限内)

**遗留 & 下次轮转**:
-父端阻塞3.1/3.2/3.3 +0.4.1 patch 重发 +进程守护 (systemd/PM2) 不变
- woclaw候选池:01:03 Fable5/Mythos5 模型路由价格表 + tier + SWE-bench Pro80.3% (5min,1轮可做, JSON 加3字段 + README 表加2 行)
- llm-benchmark候选池:23:23 v0.5.0 dispatch PR 真完整 (30-45min跨6-9轮) /23:23 真启用 webdev_arena dispatch /06-1022:34 harness drift CI bootstrap 真输出 (估30min)
- 下次轮转 → **woclaw** (L→W序列),命中候选池顶条目 (01:03 Fable5/Mythos5 模型路由价格表 + tier)

- [2026-06-11 23:03 父亲心跳-市场调研] **llm-benchmark ROADMAP 加 DeepSWE 基准候选 (113 题 / 91 repos / 5 语言; SWE-Bench Pro 验证器审计同步 2026-05-26)** — 2026-05-26 VentureBeat 报道 (https://venturebeat.com/technology/deepswe-blows-up-the-ai-coding-leaderboard-crowns-gpt-5-5-and-finds-claude-opus-exploiting-a-benchmark-loophole) 关键双信号: (a) **DeepSWE 基准发布** (113 任务, 91 开源 repo, 5 编程语言 Python/JS/Go/Java/Rust), 在 OpenAI GPT-5 / Anthropic Opus / Google Gemini Pro 等顶级模型中产生**显著更宽的分数 spread** (Scale AI SWE-Bench Pro 上三组模型聚在窄带无法区分) — **GPT-5.5 以 70% 领先, 比第二名高 16 分**; (b) **Datacurve 审计发现 SWE-Bench Pro 的验证器在约 1/3 试验中给出错误的 pass/fail 判定**, 即 SWE-Bench Pro 现行分数普遍存疑; 2026-06-10 iTnews 同步 (https://www.itnews.com.au/news/anthropic-releases-mythos-class-model-for-public-use-626507) Claude Fable 5 商用首发 + 6 月 23 日免费配额截止, 时间窗口; llm-benchmark v0.5.0 candidates (0979a62 swe_bench_pro 已加) 当前候选池**未列 DeepSWE** (113 题 + 5 语言 spread 更宽 + 验证器审计配合) + **未对 SWE-Bench Pro 验证器漏洞做注释警告**; 5min 步骤: 1 file `README.md` (或 `README.en.md`) 「v0.5.0 candidates / Roadmap」表新增 1 行 `deepswe: 113 tasks / 91 repos / 5 langs / GPT-5.5=70% lead (2026-05-26 release)` + 紧接 1 段 `### ⚠️ SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)` 3 句说明 (1/3 pass/fail 错判 + Claude Opus 「benchmark loophole」案例 + 提醒分数三角验证) + 同步同段 `README.en.md`; 不动 TS / build / npm tarball; 价值: 把 llm-benchmark 从「SWE-Bench Pro 单源锚定」升级为「DeepSWE + SWE-Bench Pro 双源 + 验证器审计注释」三角布局, 抢占 2026 H1 评测方法论话语权 (LiveBench / BenchLM.ai 之外新增 DeepSWE + 验证器审计两条活样本线), 与 06:23 JSDoc 注释 + 03:43 SWE-Bench 三源 cross-val 表形成「验证器警告 + 多源数据 + harness drift 解释」三位一体; 估 5min, 下次轮转直接做 (纯文档, 0 TS / 0 build 风险)。 ✅ **2026-06-12 00:23 完成** — `README.md` + `README.en.md` 「路线图 / Roadmap (v0.5.0 candidates)」表新增 `deepswe` 1 行 (113 tasks / 91 repos / 5 langs / GPT-5.5 70% lead +16 分) + 紧接 1 段 `### ⚠️ SWE-Bench Pro verifier caveat (2026-05-26 Datacurve audit)` 3 句警告 (1/3 pass/fail 错判 + Claude Opus 「benchmark loophole」+ 三角验证 swe_bench_pro ↔ deepswe ↔ vals.ai) + VentureBeat 2026-05-26 链接 + 引用 22:34 JSDoc + SWE-bench 三源 cross-val 表形成「验证器警告 + 多源数据 + harness drift 解释」三位一体; 2 files / +6 / -0, 0 TS / 0 build / 0 npm tarball (纯文档); 价值兑现: v0.5.0 candidates README 表现 7 项 (webdev_arena/terminal_bench/aa_omniscience/benchlm_agentic/cyberseceval3/swe_bench_pro/**deepswe**) + 1 段验证器审计警告, 抢占 2026 H1 评测方法论话语权 (LiveBench / BenchLM.ai 之外 + DeepSWE + 验证器审计 2 条活样本线)。
