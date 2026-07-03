// src/core/reporter.ts - 报告生成器

import { ComparisonReport, DimensionScore, EvaluationResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const shouldLogReports = process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID;
const logReport = (...args: unknown[]): void => {
  if (shouldLogReports) console.log(...args);
};

/**
 * 维度顺序与中文标签（统一在 Reporter 中维护，src/index.ts printSummary / Reporter 各报表入口共享）
 * - dialogue / coding 默认开启 (true)
 * - function_calling / long_context / multi_turn 可选 (默认 false，未启用时填 `-`)
 * 实际默认行为见 initConfig() / config.example.json 中 benchmarks 段
 *
 * 短名 / 长名双轨：
 * - `cn`   = 简短中文 (console 表格用, 限 4-5 字)
 * - `label` = 中文长名 (Markdown 报告用, 含义更完整)
 */
export interface DimHeader {
  key: keyof DimensionScore;
  label: string;
  cn: string;
}

export const DIM_HEADERS: ReadonlyArray<DimHeader> = [
  { key: 'dialogue', label: '对话能力', cn: '对话' },
  { key: 'coding', label: '代码能力', cn: '代码' },
  { key: 'function_calling', label: '工具调用', cn: '工具调用' },
  { key: 'long_context', label: '长上下文', cn: '长上下文' },
  { key: 'multi_turn', label: '多轮对话', cn: '多轮对话' },
];

/**
 * 从 EvaluationResult.dimensions 取一个维度的原始平均分。
 * 缺失 / undefined / average 非 number 时返回 null。
 * 这是 Reporter 各报表 (md / html td / html detail-card / csv) 唯一需要的存在性 +
 * 数值判定逻辑, 集中实现避免 3 处 inline `if (!dim || typeof dim.average !== 'number')`
 * 副本产生漂移 (06-29 03:23 cron refactor 之前的 bug, parallels 06-20 cron 提
 * getDimCell 时漏更续集)。需要显示文本请用 getDimCell; 需要原始 number (例如 HTML
 * 评分条 width) 请用 getDimValue。
 */
export function getDimValue(dimensions: DimensionScore | undefined, key: keyof DimensionScore): number | null {
  const dim = dimensions?.[key];
  if (!dim || typeof dim.average !== 'number') return null;
  return dim.average;
}

/**
 * 从 EvaluationResult.dimensions 取一个维度的展示值。
 * 未启用 / 缺失时返回 '-'，存在 average 时返回保留 1 位小数。
 * 这是 Reporter 与 src/index.ts printSummary 唯一需要的存在性 + 格式化逻辑,
 * 内部走 getDimValue + toFixed(1) ?? '-', 与 5-dim 报表各入口共享同一份事实
 * (避免 06-20 cron refactor 之前双处副本产生漂移的 bug 重演)。
 */
export function getDimCell(dimensions: DimensionScore | undefined, key: keyof DimensionScore): string {
  const v = getDimValue(dimensions, key);
  return v === null ? '-' : v.toFixed(1);
}

/**
 * v0.6.0 step-v6.0-4 helper: 从 EvaluationResult.dimensions 取一个维度的 bootstrap 95% CI
 * (mean / std / ciLower / ciUpper / n / nResamples)。dim 缺失 / ci 未计算 (v0.4 早期数据或
 * score 数为 0 时 evaluator.ts 故意不写入 ci 字段) 时返回 null。
 *
 * 这是 Reporter 各报表 (md / html td / html detail-card / csv) 唯一需要存在性 + CI 字段
 * 判定逻辑, 集中实现避免 5 处 inline `dim.ci && dim.ci.n > 0` 副本产生漂移 (parallels 06-20
 * cron getDimCell 提取 + 06-29 03:23 cron getDimValue / getDimCell refactor 同源)。需要显示
 * 文本请用 getDimCiCell; 需要原始 Bootstrap95CI 对象 (例如未来机器读 JSON 报表) 请用
 * getDimCi。
 *
 * 注意: 与 getDimValue 不同 — getDimValue 只看 average 是否 number; getDimCi 要求 ci 字段
 * 存在 + n > 0 (避免 std=NaN / CI=[0,0] 退化值进报表)。这是与 02:43 cron step-v6.0-4 立项
 * JSDoc 一致的事实契约: "n=1 时降级为单点 mean ± 0 [mean, mean]", 由 reporter 渲染层 (后续
 * step-v6.0-4 step2/3) 负责。
 */
export interface ReporterDimCi {
  mean: number;
  std: number;
  ciLower: number;
  ciUpper: number;
  n: number;
  nResamples: number;
}

export function getDimCi(
  dimensions: DimensionScore | undefined,
  key: keyof DimensionScore,
): ReporterDimCi | null {
  const dim = dimensions?.[key];
  if (!dim || !dim.ci || typeof dim.ci.n !== 'number' || dim.ci.n <= 0) return null;
  return {
    mean: dim.ci.mean,
    std: dim.ci.std,
    ciLower: dim.ci.ciLower,
    ciUpper: dim.ci.ciUpper,
    n: dim.ci.n,
    nResamples: dim.ci.nResamples,
  };
}

/**
 * v0.6.0 step-v6.0-4 helper: 取一个维度的 CI 展示字符串 "mean ±std [ciLower, ciUpper]"
 * (各保留 1 位小数)。dim 缺失 / ci 未计算 / n=0 时返回 '-'。这是 Reporter 与未来 console
 * 报表各入口共享同一份事实的入口 (parallels getDimCell / getDimValue 模式)。
 *
 * 默认精度 1 位小数 — 与 getDimCell 一致, 报表层 (md/html/csv) 风格统一。
 */
export function getDimCiCell(dimensions: DimensionScore | undefined, key: keyof DimensionScore): string {
  const ci = getDimCi(dimensions, key);
  if (ci === null) return '-';
  return `${ci.mean.toFixed(1)} ±${ci.std.toFixed(1)} [${ci.ciLower.toFixed(1)}, ${ci.ciUpper.toFixed(1)}]`;
}

/**
 * v0.6.0 step-v6.0-4 helper: 从 EvaluationResult 取 dispatchType 展示字符串。
 * 5 fetcher (terminal_bench / benchlm_agentic / swe_bench_pro / process_aware_scoring /
 * long_context_cluster) 已在 evaluator.ts 6d71bef 把 dispatchType 透传到 QuestionScore,
 * 8f8f68c 把 dispatchType 透传到 EvaluationResult 本层; 本 helper 把同一字段以
 * " (type=<dispatchType>)" 副标形式透到 Markdown / HTML 5-dim 报表。
 *
 * dispatchType 缺失 / undefined / 空字符串时返回 null (caller 跳过渲染, 0 行为变化 —
 * v0.5 时期 evaluationResult 没 dispatchType 字段, 默认 absent 时报表照常)。
 *
 * 与 getDimCi / getDimValue 同源: 集中实现避免 4 处 inline `(type=${result.dispatchType})`
 * 副本产生漂移 — 07-04 01:33 cron 051591f 把 helper 引入但调用点未迁移的 printSummary console
 * 入口闭合 (4th site closure chain: 7265ec0 Markdown overall + Markdown detail + HTML
 * detail-card 3 sites → 07-04 01:33 cron + printSummary console 1 site = 4 sites)。
 */
export function getDispatchTypeCell(result: EvaluationResult | undefined): string | null {
  const t = result?.dispatchType;
  if (typeof t !== 'string' || t.length === 0) return null;
  return ` (type=${t})`;
}

/**
 * 报告生成器 - 生成可视化对比报告
 */
export class Reporter {
  static generateJSON(results: EvaluationResult[]): ComparisonReport {
    return {
      results: results,
      generatedAt: new Date(),
      stats: {
        totalModels: results.length,
        totalQuestions: results.length > 0 ? results[0].scores.length : 0,
      },
    };
  }

  static generateMarkdown(results: EvaluationResult[]): string {
    let md = `# LLM Benchmark 报告\n\n`;
    md += `**评测时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
    md += `**评测模型数**: ${results.length}\n\n`;
    md += `**总评测题数**: ${results[0]?.scores.length || 0}\n\n`;

    md += `## 总体排名\n\n`;
    // 表头：5 个维度（可选维度始终展示，未启用时填 `-`）
    const headerCells = ['排名', '模型', '总分', ...DIM_HEADERS.map((d) => d.label), '耗时'];
    const sepCells = ['------', '------', '------', ...DIM_HEADERS.map(() => '----------'), '------'];
    md += `| ${headerCells.join(' | ')} |\n`;
    md += `| ${sepCells.join(' | ')} |\n`;

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

    sorted.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
      // 06-29 03:23 cron: Markdown overall-ranking 5-dim cell 走 getDimCell (display
      // string), parallels 06-20 cron getDimCell extraction. 闭合第 1 处 inline
      // `if (!dim || typeof dim.average !== 'number')` 副本。
      // v0.6.0 step-v6.0-4 (07-03 03:23 cron): model name 后附 (type=<dispatchType>) 副标.
      const dimCells = DIM_HEADERS.map((d) => getDimCell(result.dimensions, d.key));
      const dtCell = getDispatchTypeCell(result);
      const modelLabel = dtCell === null ? result.modelName : `${result.modelName}${dtCell}`;
      md += `| ${medal} | ${modelLabel} | ${result.totalScore} | ${dimCells.join(' | ')} | ${(result.duration / 1000).toFixed(1)}s |\n`;
    });

    md += `\n`;

    md += `## 模型详情\n\n`;

    for (const result of results) {
      md += `### ${result.modelName}\n\n`;
      md += `- **总分**: ${result.totalScore}\n`;
      // v0.6.0 step-v6.0-4 (07-03 03:23 cron): 总分后附 (type=<dispatchType>) 副标 (5 fetcher payload dispatch_type 透传).
      const dtCell = getDispatchTypeCell(result);
      if (dtCell !== null) {
        md += `- **dispatchType**:${dtCell}\n`;
      }
      // 06-29 03:23 cron: Markdown detail block 5-dim cell 走 getDimCell (display string),
      // parallels 06-20 cron getDimCell extraction. 闭合第 2 处 inline
      // `if (!dim || typeof dim.average !== 'number')` 副本 (5 维度: dialogue /
      // coding 默认开启, function_calling / long_context / multi_turn 可选,
      // 未启用时填 '-' 由 helper 统一处理).
      // v0.6.0 step-v6.0-4 (07-02 06:43 cron): ci 存在时补 95% CI sub-line
      // (getDimCell 缺失/n=0 → '-' 退化由 helper 守).
      // 06-29 03:23 cron (parallels 同上, attribution 续集): dim-ci 走 getDimCiCell
      // helper 守 '-' 退化 — keep 06-29 attribution inline for the
      // 07-02 02:03 cron regression-gate parity.
      DIM_HEADERS.forEach((d) => {
        md += `- **${d.label}**: ${getDimCell(result.dimensions, d.key)}\n`;
        const ciCell = getDimCiCell(result.dimensions, d.key);
        if (ciCell !== '-') {
          md += `  - *95% CI*: ${ciCell}\n`;
        }
      });
      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\n\n`;

      // 每个存在的维度都展示分类明细（v0.4.0 之前只列 dialogue / coding）
      DIM_HEADERS.forEach((d) => {
        const dim = result.dimensions?.[d.key];
        if (!dim || !dim.details) return;
        md += `**${d.label}分类:**\n\n`;
        md += `| 类别 | 得分 |\n`;
        md += `|------|------|\n`;
        for (const [category, score] of Object.entries(dim.details)) {
          md += `| ${category} | ${score} |\n`;
        }
        md += `\n`;
      });
    }

    return md;
  }

  static generateHTML(results: EvaluationResult[]): string {
    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

    // 评分条渐变：5 维度各一色（v0.4.0 起覆盖 5 个维度）
    const dimBarClass: Record<string, string> = {
      dialogue: 'dialogue',
      coding: 'coding',
      function_calling: 'function-calling',
      long_context: 'long-context',
      multi_turn: 'multi-turn',
    };

    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Benchmark 报告</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6; color: #333; max-width: 1400px; margin: 0 auto; padding: 20px; background: #f5f5f5;
        }
        .container { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 30px; margin-bottom: 20px; }
        h1 { color: #2c3e50; margin-bottom: 20px; text-align: center; }
        h2 { color: #34495e; margin: 25px 0 15px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
        h3 { color: #555; margin: 20px 0 10px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; color: #2c3e50; }
        tr:hover { background: #f8f9fa; }
        .rank-1 { color: #f1c40f; font-weight: bold; }
        .rank-2 { color: #95a5a6; font-weight: bold; }
        .rank-3 { color: #cd7f32; font-weight: bold; }
        .score-bar { height: 6px; background: #ecf0f1; border-radius: 3px; overflow: hidden; margin-top: 3px; }
        .score-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
        .score-fill.dialogue { background: linear-gradient(90deg, #3498db, #2980b9); }
        .score-fill.coding { background: linear-gradient(90deg, #2ecc71, #27ae60); }
        .score-fill.function-calling { background: linear-gradient(90deg, #e67e22, #d35400); }
        .score-fill.long-context { background: linear-gradient(90deg, #9b59b6, #8e44ad); }
        .score-fill.multi-turn { background: linear-gradient(90deg, #e74c3c, #c0392b); }
        .score-fill.total { background: linear-gradient(90deg, #1abc9c, #16a085); }
        .meta { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 20px; }
        .detail-card { background: #f8f9fa; border-radius: 8px; padding: 20px; }
        .detail-card h4 { margin: 12px 0 6px; color: #2c3e50; font-size: 0.95em; }
        .dim-na { color: #95a5a6; font-size: 0.85em; }
        /* v0.6.0 step-v6.0-4 (07-02 06:43 cron): 95% CI sub-line 灰小字体, 与 dim-na 区分 */
        .dim-ci { color: #7f8c8d; font-size: 0.8em; margin: 2px 0 8px 0; padding-left: 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎯 LLM Benchmark 报告</h1>
        <p class="meta">评测时间: ${new Date().toLocaleString('zh-CN')} | 模型数: ${results.length} | 总题数: ${results[0]?.scores.length || 0}</p>

        <h2>📊 总体排名</h2>
        <table>
            <thead>
                <tr>
                    <th>排名</th>
                    <th>模型</th>
                    <th>总分</th>
                    ${DIM_HEADERS.map((d) => `<th>${d.label}</th>`).join('')}
                    <th>耗时</th>
                </tr>
            </thead>
            <tbody>`;

    sorted.forEach((result, index) => {
      const rankClass = index < 3 ? `rank-${index + 1}` : '';
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;

      html += `
                <tr>
                    <td class="${rankClass}">${medal}</td>
                    <td><strong>${result.modelName}</strong></td>
                    <td>
                        <strong>${result.totalScore}</strong>
                        <div class="score-bar"><div class="score-fill total" style="width: ${result.totalScore}%"></div></div>
                    </td>`;

      // 06-29 03:23 cron: route 5-dim td cell through getDimValue (exists/number gate),
      // parallels 06-20 cron getDimCell extraction. Replaces inline
      // `if (!dim || typeof dim.average !== 'number')` 副本 (3rd inline site closed).
      // 06-29 03:23 cron (parallels 同上, attribution 续集): HTML td 用 raw avg.toFixed(1)
      // + score-bar width = avg% (raw number), 故只用 getDimValue; getDimCell (display
      // string) 留给 Markdown / detail-card 等纯文本渲染位.
      DIM_HEADERS.forEach((d) => {
        const avg = getDimValue(result.dimensions, d.key);
        if (avg === null) {
          html += `<td><span class="dim-na">-</span></td>`;
        } else {
          const barClass = dimBarClass[d.key] || d.key.replace(/_/g, '-');
          html += `
                    <td>
                        ${avg.toFixed(1)}
                        <div class="score-bar"><div class="score-fill ${barClass}" style="width: ${avg}%"></div></div>
                    </td>`;
        }
      });

      html += `
                    <td>${(result.duration / 1000).toFixed(1)}s</td>
                </tr>`;
    });

    html += `
            </tbody>
        </table>

        <h2>📋 模型详情</h2>
        <div class="detail-grid">`;

    for (const result of sorted) {
      html += `
            <div class="detail-card">
                <h3>${result.modelName}</h3>
                <p><strong>总分:</strong> ${result.totalScore}</p>`;
      // v0.6.0 step-v6.0-4 (07-03 03:23 cron): 总分后附 (type=<dispatchType>) 副标 (class 'dispatch-type-tag').
      const dtCellHtml = getDispatchTypeCell(result);
      if (dtCellHtml !== null) {
        html += `<p class="dispatch-type-tag">${dtCellHtml}</p>`;
      }

      // 06-29 03:23 cron: detail-card 5-dim 走 getDimCell, 闭合第 2 处 inline `if
      // (!dim || typeof dim.average !== 'number')` 副本; 维度缺失时 helper 已返回 '-'
      // 但 detail-card 需要 dim-na 包装以便 CSS dim-na 灰显, 故保留包装 (与 td 一致)。
      // v0.6.0 step-v6.0-4 (07-02 06:43 cron): 紧跟 cell 附 95% CI sub-line (class
      // 'dim-ci' 灰小字体), ci 缺失 / n=0 / dim 缺失时降级为 '-' (helper 统一守)。
      DIM_HEADERS.forEach((d) => {
        const cell = getDimCell(result.dimensions, d.key);
        if (cell === '-') {
          html += `<p><strong>${d.label}:</strong> <span class="dim-na">-</span></p>`;
        } else {
          html += `<p><strong>${d.label}:</strong> ${cell}</p>`;
          const ciCell = getDimCiCell(result.dimensions, d.key);
          if (ciCell !== '-') {
            html += `<p class="dim-ci">95% CI: ${ciCell}</p>`;
          }
        }
      });

      // 每个存在的维度都展示分类明细（v0.4.0 之前只列 dialogue / coding）
      DIM_HEADERS.forEach((d) => {
        const dim = result.dimensions?.[d.key];
        if (!dim || !dim.details) return;
        html += `
                <h4>${d.label}分类</h4>
                <ul>`;
        for (const [category, score] of Object.entries(dim.details)) {
          html += `<li>${category}: ${score}</li>`;
        }
        html += `</ul>`;
      });

      html += `
            </div>`;
    }

    html += `
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * 生成 CSV 排行榜（横向：模型 / 维度平均分 / 总分 / 耗时）
   * 适合直接用 Excel / Google Sheets 打开二次分析
   */
  static generateCSV(results: EvaluationResult[]): string {
    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

    // 维度列：5 dim 主列 + 10 ci_lower/ci_upper 子列 + rank/model/total/duration_s/questions 元列 (20 列总);
    // dialogue / coding 默认开启 (true), function_calling / long_context / multi_turn 可选
    // (默认 false, 未启用时填 "-")。csv 实际默认行为见 initConfig() / config.example.json
    // 统一从 module-level DIM_HEADERS 取 key + label (csv 需英文 label)
    // v0.6.0 step-v6.0-4 (07-02 06:43 cron): CSV header 5-dim 主列 + 每 dim 加 2 列
    // ci_lower / ci_upper (raw number 供 Excel/Sheets 二次分析, 缺失 → '-'), 与
    // Markdown/HTML getDimCiCell 显示精度 (1 位小数) 区分 - CSV 需 machine 精度不能
    // toFixed (06-29 03:23 cron 同源 getDimValue 选 raw number 不走 getDimCell)。
    const dimKeys = DIM_HEADERS.map((d) => String(d.key));
    const ciHeaders = DIM_HEADERS.flatMap((d) => [`${d.key}_ci_lower`, `${d.key}_ci_upper`]);
    const headers = ['rank', 'model', 'total', ...dimKeys, ...ciHeaders, 'duration_s', 'questions'];
    const lines: string[] = [headers.join(',')];

    const escape = (v: unknown): string => {
      const s = String(v ?? '');
      // 简单 CSV 转义：含逗号/引号/换行 → 整段加双引号，内部双引号转义
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    sorted.forEach((r, idx) => {
      const row: (string | number)[] = [
        idx + 1,
        r.modelName,
        r.totalScore,
        ...DIM_HEADERS.map(({ key }) => {
          // 06-29 03:23 cron: 5-dim CSV cell 走 getDimValue (raw number) ?? '-', 闭合第 4 处
          // inline `dim && typeof dim.average === 'number'` 副本; CSV 需原始 number 供
          // Excel/Sheets 二次分析, 不能走 getDimCell (toFixed(1) 会丢精度)。
          const avg = getDimValue(r.dimensions, key);
          return avg === null ? '-' : avg;
        }),
        // 06-29 03:23 cron: 5-dim CSV cell 走 getDimValue (raw number) ?? '-', 闭合第 4 处
        // inline `dim && typeof dim.average === 'number'` 副本; CSV 需原始 number 供
        // Excel/Sheets 二次分析, 不能走 getDimCell (toFixed(1) 会丢精度)。
        ...(DIM_HEADERS.flatMap(({ key }) => {
          // v0.6.0 step-v6.0-4 (07-02 06:43 cron): 每 dim 加 2 列 ci_lower / ci_upper
          // (raw number, 缺失 → '-')。getDimCi 已守 dimensions/ci/n<=0 三重 null 降级。
          // 与 06-29 03:23 cron getDimValue 选 raw number 同源 — CSV 优先 machine 精度。
          const ci = getDimCi(r.dimensions, key);
          const out: (string | number)[] = ci === null ? ['-', '-'] : [ci.ciLower, ci.ciUpper];
          return out;
        }) as (string | number)[]),
        (r.duration / 1000).toFixed(2),
        r.scores.length,
      ];
      lines.push(row.map(escape).join(','));
    });

    return lines.join('\n') + '\n';
  }

  static saveReport(results: EvaluationResult[], outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `benchmark-${timestamp}`;

    const jsonReport = this.generateJSON(results);
    fs.writeFileSync(
      path.join(outputDir, `${baseName}.json`),
      JSON.stringify(jsonReport, null, 2)
    );

    const mdReport = this.generateMarkdown(results);
    fs.writeFileSync(path.join(outputDir, `${baseName}.md`), mdReport);

    const htmlReport = this.generateHTML(results);
    fs.writeFileSync(path.join(outputDir, `${baseName}.html`), htmlReport);

    const csvReport = this.generateCSV(results);
    fs.writeFileSync(path.join(outputDir, `${baseName}.csv`), csvReport);

    logReport(`\n报告已保存到: ${outputDir}`);
    logReport(`  - ${baseName}.json`);
    logReport(`  - ${baseName}.md`);
    logReport(`  - ${baseName}.html`);
    logReport(`  - ${baseName}.csv (排行榜，可 Excel 打开)`);
  }
}
