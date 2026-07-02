// tests/evaluator-build-dim-entry-helper.test.ts
// 钉住 src/core/evaluator.ts calculateDimensions → buildDimEntry() helper 抽取 + bootstrap95CI 真接线:
// 1) calculateDimensions 体 < 30 行 (原 73 行, buildDimEntry 抽出后净减 -62 行, 现 11 行)
// 2) 恰好 1 个 private buildDimEntry( 声明
// 3) buildDimEntry 签名: 1 params (dimScores: QuestionScore[]), 返回 DimensionScore['dialogue']
// 4) buildDimEntry body canonical: total/count/average/details 4 字段 + count >= 2 才挂 entry.ci = bootstrap95CI(...)
// 5) calculateDimensions 5 维全部走 this.buildDimEntry('dialogue'/'coding'/'function_calling'/'long_context'/'multi_turn')
// 6) 0 inline 5-dim entry 构造 (回归门)
// 7) evaluator.ts 1373 行 (1400 - 27 buildDimEntry 净减), size floor < 1400
// 8) 5-dim entry 调用类型兼容 DimensionScore['dialogue'] union (dialogue/coding/function_calling/long_context/multi_turn 共享同一 shape 因 type stub 已对齐 06-30 03:33 + 07-01 cron pending type)
import * as fs from 'fs';
import * as path from 'path';

const EVALUATOR_PATH = path.resolve(__dirname, '../src/core/evaluator.ts');

describe('evaluator calculateDimensions → buildDimEntry helper (v0.6.0 step-v6.0-2 caller)', () => {
  const src = fs.readFileSync(EVALUATOR_PATH, 'utf-8');

  it('file size in expected range (1300..1420 — buildDimEntry 抽出净减 27 行 + dispatch return 注入净增 20 行)', () => {
    expect(src).toBeDefined();
    const lineCount = src.split('\n').length;
    expect(lineCount).toBeGreaterThanOrEqual(1300);
    expect(lineCount).toBeLessThan(1420); // buildDimEntry helper 抽出净减 (v0.6.0 step-v6.0-2 caller) + dispatch return 注入净增 20 行 (v0.6.0 step-v6.0-4 step4, 07-03 02:43 cron)
  });

  it('declares exactly one private buildDimEntry helper', () => {
    const matches = src.match(/private buildDimEntry\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it('buildDimEntry signature canonical: 1 params (dimScores: QuestionScore[]), returns DimensionScore["dialogue"]', () => {
    const m = src.match(/private buildDimEntry\(\s*([\s\S]*?)\):\s*DimensionScore\['dialogue'\]/);
    expect(m).not.toBeNull();
    const params = m![1];
    expect(params).toMatch(/dimScores:\s*QuestionScore\[\]/);
  });

  it('buildDimEntry body canonical: total/count/average/details 4 fields + count >= 2 才挂 entry.ci', () => {
    const helperStart = src.indexOf('private buildDimEntry(');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const afterDecl = src.indexOf(': DimensionScore[\'dialogue\'] {', helperStart);
    expect(afterDecl).toBeGreaterThan(0);
    const bodyEnd = src.indexOf('\n  }\n', afterDecl);
    expect(bodyEnd).toBeGreaterThan(afterDecl);
    const body = src.slice(afterDecl, bodyEnd);
    expect(body).toMatch(/const\s+total\s*=\s*dimScores\.reduce\(\(sum,\s*s\)\s*=>\s*sum\s*\+\s*s\.score/);
    expect(body).toMatch(/const\s+count\s*=\s*dimScores\.length/);
    expect(body).toMatch(/count\s*>\s*0\s*\?\s*Math\.round\(total\s*\/\s*count\)\s*:\s*0/);
    expect(body).toMatch(/const\s+details\s*=\s*this\.calculateCategoryDetails\(dimScores\)/);
    expect(body).toMatch(/if\s*\(\s*count\s*>=\s*2\s*\)\s*\{[\s\S]*?entry\.ci\s*=\s*bootstrap95CI\(/);
  });

  it('calculateDimensions 5-dim call sites all use this.buildDimEntry with lowercase dim literal', () => {
    const expected = ['dialogue', 'coding', 'function_calling', 'long_context', 'multi_turn'];
    for (const dim of expected) {
      const re = new RegExp(`this\\.buildDimEntry\\(dimScores\\('${dim}'\\)\\)`);
      expect(re.test(src)).toBe(true);
    }
    const totalCalls = (src.match(/this\.buildDimEntry\(/g) || []).length;
    expect(totalCalls).toBeGreaterThanOrEqual(5); // 5-dim call sites
  });

  it('calculateDimensions body < 30 lines (was 73, buildDimEntry 抽出净减 -62)', () => {
    const calcStart = src.indexOf('private calculateDimensions(scores: QuestionScore[])');
    expect(calcStart).toBeGreaterThanOrEqual(0);
    const bodyStart = src.indexOf('{', calcStart);
    expect(bodyStart).toBeGreaterThan(0);
    // 找下一个 class-bottom 收尾 \n  }\n (下一个 private 方法前)
    const nextMethodMatch = src.slice(bodyStart).match(/\n  \n  (private|public|\})\s/);
    // 简单计数: 从 calculateDimensions 到下一个 \n  private 或 \n} (类底) 之间的行数
    const searchFrom = bodyStart + 1;
    const afterCalc = src.slice(searchFrom, searchFrom + 5000);
    const closeIdx = afterCalc.indexOf('\n  }\n');
    expect(closeIdx).toBeGreaterThan(0);
    const body = afterCalc.slice(0, closeIdx);
    const bodyLines = body.split('\n').length;
    expect(bodyLines).toBeLessThan(30); // 原 73 行, 抽 helper 后 < 30 行
  });

  it('0 inline 5-dim entry construction patterns remain (regression gate)', () => {
    // 老的 inline 模式: 5 个 dim 各有 total/count/average/details 4 字段 inline 构造
    // 抽出 buildDimEntry 后, calculateDimensions body 内不该再有这种 5-replica 构造
    // 只允许 buildDimEntry 自己有这个 shape
    const dimEntryShape = /total:\s*\w+\.reduce\(\(sum,\s*s\)\s*=>\s*sum\s*\+\s*s\.score,\s*0\),\s*count:\s*\w+\.length,\s*average:/g;
    const matches = src.match(dimEntryShape) || [];
    // 只允许 buildDimEntry 内 1 处有这种 inline 构造 (helper 自己), calculateDimensions 不该再有
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
