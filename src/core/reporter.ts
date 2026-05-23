// src/core/reporter.ts - 报告生成器

import { ComparisonReport, EvaluationResult } from '../types';
import * as fs from 'fs';
import * as path from 'path';

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
    md += `| 排名 | 模型 | 总分 | 对话能力 | 代码能力 |\n`;
    md += `|------|------|------|----------|----------|\n`;

    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

    sorted.forEach((result, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
      md += `| ${medal} | ${result.modelName} | ${result.totalScore} | ${result.dimensions.dialogue.average} | ${result.dimensions.coding.average} |\n`;
    });

    md += `\n`;

    md += `## 模型详情\n\n`;

    for (const result of results) {
      md += `### ${result.modelName}\n\n`;
      md += `- **总分**: ${result.totalScore}\n`;
      md += `- **对话能力**: ${result.dimensions.dialogue.average}\n`;
      md += `- **代码能力**: ${result.dimensions.coding.average}\n`;
      md += `- **评测耗时**: ${(result.duration / 1000).toFixed(1)}s\n\n`;

      md += `**对话能力分类:**\n\n`;
      md += `| 类别 | 得分 |\n`;
      md += `|------|------|\n`;
      for (const [category, score] of Object.entries(result.dimensions.dialogue.details)) {
        md += `| ${category} | ${score} |\n`;
      }

      md += `**代码能力分类:**\n\n`;
      md += `| 类别 | 得分 |\n`;
      md += `|------|------|\n`;
      for (const [category, score] of Object.entries(result.dimensions.coding.details)) {
        md += `| ${category} | ${score} |\n`;
      }

      md += `\n`;
    }

    return md;
  }

  static generateHTML(results: EvaluationResult[]): string {
    const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore);

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
            line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5;
        }
        .container { background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 30px; margin-bottom: 20px; }
        h1 { color: #2c3e50; margin-bottom: 20px; text-align: center; }
        h2 { color: #34495e; margin: 25px 0 15px; padding-bottom: 10px; border-bottom: 2px solid #eee; }
        h3 { color: #555; margin: 20px 0 10px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f9fa; font-weight: 600; color: #2c3e50; }
        tr:hover { background: #f8f9fa; }
        .rank-1 { color: #f1c40f; font-weight: bold; }
        .rank-2 { color: #95a5a6; font-weight: bold; }
        .rank-3 { color: #cd7f32; font-weight: bold; }
        .score-bar { height: 20px; background: #ecf0f1; border-radius: 10px; overflow: hidden; }
        .score-fill { height: 100%; border-radius: 10px; transition: width 0.3s ease; }
        .score-fill.dialogue { background: linear-gradient(90deg, #3498db, #2980b9); }
        .score-fill.coding { background: linear-gradient(90deg, #2ecc71, #27ae60); }
        .score-fill.total { background: linear-gradient(90deg, #9b59b6, #8e44ad); }
        .meta { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
        .detail-card { background: #f8f9fa; border-radius: 8px; padding: 20px; }
        .detail-card h4 { margin-bottom: 10px; color: #2c3e50; }
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
                    <th>对话能力</th>
                    <th>代码能力</th>
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
                        <div class="score-bar">
                            <div class="score-fill total" style="width: ${result.totalScore}%"></div>
                        </div>
                    </td>
                    <td>
                        ${result.dimensions.dialogue.average}
                        <div class="score-bar">
                            <div class="score-fill dialogue" style="width: ${result.dimensions.dialogue.average}%"></div>
                        </div>
                    </td>
                    <td>
                        ${result.dimensions.coding.average}
                        <div class="score-bar">
                            <div class="score-fill coding" style="width: ${result.dimensions.coding.average}%"></div>
                        </div>
                    </td>
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
                <p><strong>总分:</strong> ${result.totalScore}</p>
                <p><strong>对话能力:</strong> ${result.dimensions.dialogue.average}</p>
                <p><strong>代码能力:</strong> ${result.dimensions.coding.average}</p>
                
                <h4>对话分类</h4>
                <ul>`;
      for (const [category, score] of Object.entries(result.dimensions.dialogue.details)) {
        html += `<li>${category}: ${score}</li>`;
      }
      html += `</ul>
                
                <h4>代码分类</h4>
                <ul>`;
      for (const [category, score] of Object.entries(result.dimensions.coding.details)) {
        html += `<li>${category}: ${score}</li>`;
      }
      html += `</ul>
            </div>`;
    }

    html += `
        </div>
    </div>
</body>
</html>`;

    return html;
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

    console.log(`\n报告已保存到: ${outputDir}`);
    console.log(`  - ${baseName}.json`);
    console.log(`  - ${baseName}.md`);
    console.log(`  - ${baseName}.html`);
  }
}
