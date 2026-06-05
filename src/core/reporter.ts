// src/core/reporter.ts - 报告生成器

import { ComparisonReport, DimensionScore, EvaluationResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 报告生成器 - 生成可视化对比报告
 */
export class Reporter {
  /**
   * 维度顺序与中文标签（与 src/index.ts printSummary 中 dimHeaders 保持一致）
   * - dialogue / coding 默认开启 (true)
   * - function_calling / long_context / multi_turn 可选 (默认 false，未启用时填 `-`)
   * 实际默认行为见 initConfig() / config.example.json 中 benchmarks 段
   */
  private static readonly DIM_HEADERS: Array<{ key: keyof DimensionScore; label: string; cn: string }> = [
    { key: 'dialogue', label: 'dialogue', cn: '对话能力' },
    { key: 'coding', label: 'coding', cn: '代码能力' },
    { key: 'function_calling', label: 'function_calling', cn: '工具调用' },
    { key: 'long_context', label: 'long_context', cn: '长上下文' },
    { key: 'multi_turn', label: 'multi_turn', cn: '多轮对话' },
  ];

  private static getDimValue(dimensions: DimensionScore, key: keyof DimensionScore): string {
    const dim = (dimensions as any)[key];
    if (!dim || typeof dim.average !== 'number') return '-';
    // 保留 1 位小数，避免整数字段（如 100.0）和小数字段（如 92.5）格式不一致
    return Number(dim.average).toFixed(1);
  }

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
    const headerCells = ['排名', '模型', '总分', ...Reporter.DIM_HEADERS.map((d) => d.cn), '耗时'];
    const sepCells = ['------', '------', '------', ...Reporter.DIM_HEADERS.map(() => '----------'), '------'];
    md += `| ${headerCells.join(' | ')} |\n`;
    md += `| ${sepCells.join(' | ')} |\n`;

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

    sorted.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
      const dimCells = Reporter.DIM_HEADERS.map((d) => Reporter.getDimValue(result.dimensions, d.key));
      md += `| ${medal} | ${result.modelName} | ${result.totalScore} | ${dimCells.join(' | ')} | ${(result.duration / 1000).toFixed(1)}s |\n`;
    });

    md += `\n`;

    md += `## 模型详情\n\n`;

    for (const result of results) {
      md += `### ${result.modelName}\n\n`;
      md += `- **总分**: ${result.totalScore}\n`;
      // 5 维度概览（v0.4.0 起覆盖 5 维度：dialogue / coding 默认开启，
      // function_calling / long_context / multi_turn 可选，未启用时填 -）
      Reporter.DIM_HEADERS.forEach((d) => {
        md += `- **${d.cn}**: ${Reporter.getDimValue(result.dimensions, d.key)}\n`;
      });
      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\n\n`;

      // 每个存在的维度都展示分类明细（v0.4.0 之前只列 dialogue / coding）
      Reporter.DIM_HEADERS.forEach((d) => {
        const dim = (result.dimensions as any)[d.key];
        if (!dim || !dim.details) return;
        md += `**${d.cn}分类:**\n\n`;
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
                    ${Reporter.DIM_HEADERS.map((d) => `<th>${d.cn}</th>`).join('')}
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

      Reporter.DIM_HEADERS.forEach((d) => {
        const dim = (result.dimensions as any)[d.key];
        if (!dim || typeof dim.average !== 'number') {
          html += `<td><span class="dim-na">-</span></td>`;
        } else {
          const v = Number(dim.average).toFixed(1);
          const barClass = dimBarClass[d.key] || d.key.replace(/_/g, '-');
          html += `
                    <td>
                        ${v}
                        <div class="score-bar"><div class="score-fill ${barClass}" style="width: ${dim.average}%"></div></div>
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

      Reporter.DIM_HEADERS.forEach((d) => {
        const dim = (result.dimensions as any)[d.key];
        if (!dim || typeof dim.average !== 'number') {
          html += `<p><strong>${d.cn}:</strong> <span class="dim-na">-</span></p>`;
        } else {
          const v = Number(dim.average).toFixed(1);
          html += `<p><strong>${d.cn}:</strong> ${v}</p>`;
        }
      });

      // 每个存在的维度都展示分类明细（v0.4.0 之前只列 dialogue / coding）
      Reporter.DIM_HEADERS.forEach((d) => {
        const dim = (result.dimensions as any)[d.key];
        if (!dim || !dim.details) return;
        html += `
                <h4>${d.cn}分类</h4>
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

    // 维度列：固定 5 列（function_calling / 长上下文 / 多轮 可选，没有时填 -）
    const dimHeaders: Array<{ key: keyof DimensionScore; label: string }> = [
      { key: 'dialogue', label: 'dialogue' },
      { key: 'coding', label: 'coding' },
      { key: 'function_calling', label: 'function_calling' },
      { key: 'long_context', label: 'long_context' },
      { key: 'multi_turn', label: 'multi_turn' },
    ];

    const headers = ['rank', 'model', 'total', ...dimHeaders.map((d) => d.label), 'duration_s', 'questions'];
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
        ...dimHeaders.map(({ key }) => {
          const dim = (r.dimensions as any)[key];
          return dim && typeof dim.average === 'number' ? dim.average : '-';
        }),
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

    console.log(`\n报告已保存到: ${outputDir}`);
    console.log(`  - ${baseName}.json`);
    console.log(`  - ${baseName}.md`);
    console.log(`  - ${baseName}.html`);
    console.log(`  - ${baseName}.csv (排行榜，可 Excel 打开)`);
  }
}
