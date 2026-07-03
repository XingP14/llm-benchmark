// tests/reporter-5dim-dispatch-type-cell.test.ts
// v0.6.0 step-v6.0-4 step3 regression: pin dispatchType (type=...) 副标渲染 in Markdown / HTML
// (parallels 06-30 06:43 cron getDimCi / getDimCiCell helper + 07-02 06:43 cron Markdown detail CI sub-line).
// 数据层 EvaluationResult.dispatchType 已在 8f8f68c (06-30 03:23 cron) 加 optional field,
// 本轮 step-v6.0-4 step3 闭环报表层 (Markdown overall-ranking model name + Markdown detail 总分 + HTML detail-card 总分).

import * as fs from 'fs';
import * as path from 'path';
import { Reporter, getDispatchTypeCell } from '../src/core/reporter';
import { EvaluationResult, DimensionScore, QuestionScore } from '../src/types';

const baseDim = (avg: number) => ({
  total: avg,
  count: 1,
  average: avg,
  details: { test: avg },
});

// DimensionScore requires dialogue + coding mandatory; function_calling/long_context/multi_turn optional
const mockDims = (dialogue = 85, coding = 75): DimensionScore => ({
  dialogue: baseDim(dialogue) as DimensionScore['dialogue'],
  coding: baseDim(coding) as DimensionScore['coding'],
});

const mockScore = (
  modelName: string,
  dimensions: DimensionScore,
  total = 85,
  dispatchType?: string,
): EvaluationResult => ({
  modelName,
  model: { name: modelName, model: modelName } as any,
  totalScore: total,
  duration: 10000,
  scores: [] as QuestionScore[],
  dimensions,
  timestamp: new Date('2026-07-03T03:23:00+08:00'),
  ...(dispatchType !== undefined ? { dispatchType } : {}),
});

describe('reporter dispatchType cell helper (v0.6.0 step-v6.0-4 step3)', () => {
  describe('getDispatchTypeCell helper', () => {
    test('returns " (type=agentic_coding)" when dispatchType is agentic_coding', () => {
      const r = mockScore('gpt-5.4', mockDims(), 85, 'agentic_coding');
      expect(getDispatchTypeCell(r)).toBe(' (type=agentic_coding)');
    });
    test('returns null when dispatchType is undefined (v0.5 backward-compat)', () => {
      const r = mockScore('gpt-5.4', mockDims());
      expect(getDispatchTypeCell(r)).toBeNull();
    });
    test('returns null when result is undefined', () => {
      expect(getDispatchTypeCell(undefined)).toBeNull();
    });
    test('returns null when dispatchType is empty string', () => {
      const r = mockScore('gpt-5.4', mockDims(), 85, '');
      expect(getDispatchTypeCell(r)).toBeNull();
    });
    test('returns the literal "(type=   )" when dispatchType is whitespace-only (caller-trimming not handled here)', () => {
      // helper only treats length===0 as null; whitespace passes through verbatim
      const r = mockScore('gpt-5.4', mockDims(), 85, '   ');
      expect(getDispatchTypeCell(r)).toBe(' (type=   )');
    });
    test('5 v0.5 dispatch_type literals round-trip via helper', () => {
      const literals = ['agentic_coding', 'agentic_fullstack', 'agentic_swe', 'process_agentic', 'long_context_retrieval'];
      for (const lit of literals) {
        const r = mockScore('m', mockDims(), 50, lit);
        expect(getDispatchTypeCell(r)).toBe(` (type=${lit})`);
      }
    });
  });

  describe('Markdown overall-ranking dispatchType subtitle', () => {
    test('model name carries (type=agentic_swe) when dispatchType set', () => {
      const r = mockScore('claude-opus-4.8', mockDims(), 85, 'agentic_swe');
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('claude-opus-4.8 (type=agentic_swe)');
      expect(md).toMatch(/\| 🥇 \| claude-opus-4\.8 \(type=agentic_swe\) \| 85 \|/);
    });
    test('model name has no (type=...) suffix when dispatchType absent (v0.5 path)', () => {
      const r = mockScore('gpt-5.4', mockDims());
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('gpt-5.4');
      expect(md).not.toContain('gpt-5.4 (type=');
      expect(md).toMatch(/\| 🥇 \| gpt-5\.4 \| 85 \|/);
    });
  });

  describe('Markdown detail block dispatchType subtitle', () => {
    test('emits `- **dispatchType**: (type=process_agentic)` line after 总分 when dispatchType set', () => {
      const r = mockScore('claude-fable-5', mockDims(), 85, 'process_agentic');
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('- **dispatchType**: (type=process_agentic)');
      const totIdx = md.indexOf('**总分**: 85');
      const dtIdx = md.indexOf('**dispatchType**: (type=process_agentic)');
      const dimIdx = md.indexOf('**对话能力**');
      expect(totIdx).toBeGreaterThan(-1);
      expect(dtIdx).toBeGreaterThan(totIdx);
      expect(dimIdx).toBeGreaterThan(dtIdx);
    });
    test('omits dispatchType line when dispatchType absent (v0.5 backward-compat)', () => {
      const r = mockScore('gpt-5.4', mockDims());
      const md = Reporter.generateMarkdown([r]);
      expect(md).not.toContain('**dispatchType**');
    });
  });

  describe('HTML detail-card dispatchType subtitle', () => {
    test('emits <p class="dispatch-type-tag"> (type=long_context_retrieval)</p> when dispatchType set', () => {
      const r = mockScore('claude-mythos-5', mockDims(), 85, 'long_context_retrieval');
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<p class="dispatch-type-tag"> (type=long_context_retrieval)</p>');
      const totIdx = html.indexOf('<strong>总分:</strong> 85');
      const dtIdx = html.indexOf('<p class="dispatch-type-tag">');
      const dimIdx = html.indexOf('<strong>对话能力:</strong>');
      expect(totIdx).toBeGreaterThan(-1);
      expect(dtIdx).toBeGreaterThan(totIdx);
      expect(dimIdx).toBeGreaterThan(dtIdx);
    });
    test('omits dispatch-type-tag <p> when dispatchType absent (v0.5 backward-compat)', () => {
      const r = mockScore('gpt-5.4', mockDims());
      const html = Reporter.generateHTML([r]);
      expect(html).not.toContain('dispatch-type-tag');
    });
  });

  describe('CSV column unchanged (CSV stays machine-precision, no dispatchType text contamination)', () => {
    test('CSV header unchanged + dispatchType does NOT leak into CSV cell values', () => {
      const r = mockScore('claude-opus-4.8', mockDims(), 85, 'agentic_swe');
      const csv = Reporter.generateCSV([r]);
      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe('rank,model,total,dialogue,coding,function_calling,long_context,multi_turn,dialogue_ci_lower,dialogue_ci_upper,coding_ci_lower,coding_ci_upper,function_calling_ci_lower,function_calling_ci_upper,long_context_ci_lower,long_context_ci_upper,multi_turn_ci_lower,multi_turn_ci_upper,duration_s,questions');
      expect(lines[1]).toContain('claude-opus-4.8,');
      expect(lines[1]).not.toContain('(type=agentic_swe)');
    });
  });

  describe('reporter.ts JSDoc getDispatchTypeCell comment-correctness (07-04 02:43 cron)', () => {
    // 07-04 02:43 cron (v0.6.0 step-v6.0-4 closure step5): JSDoc 上方
    // "集中实现避免 N 处 inline `(type=${result.dispatchType})` 副本产生漂移" 的 N 计数
    // 必须与实际 call site 数同步 (parallels 6af9f47 5-dim defaults comment-only stale
    // drift fix)。修复前 N=3 stale (helper 引入但 printSummary 入口漏更); 修复后 N=4
    // (3 reporter.ts + 1 index.ts printSummary console)。
    test('JSDoc claims "4 处 inline" (refreshed from stale 3 处 after 07-04 01:33 cron 051591f printSummary migration)', () => {
      const reporterSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'reporter.ts'), 'utf-8');
      // JSDoc 必须在「集中实现避免」之后紧跟 「4 处 inline `(type=${result.dispatchType})`」
      expect(reporterSrc).toMatch(/集中实现避免 4 处 inline `\(type=\$\{result\.dispatchType\}\)`/);
      // 不许残留 stale 3 处 计数 (parallels 6af9f47 fix 的本质 — stale count drift)
      expect(reporterSrc).not.toMatch(/集中实现避免 3 处 inline `\(type=/);
    });

    test('JSDoc attribution refreshed to mention 07-04 01:33 cron + 051591f 4-site closure', () => {
      const reporterSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'reporter.ts'), 'utf-8');
      // 修复后必须明示 07-04 01:33 cron + 051591f + 4th site closure chain
      expect(reporterSrc).toContain('07-04 01:33 cron');
      expect(reporterSrc).toContain('051591f');
      expect(reporterSrc).toContain('printSummary console');
      expect(reporterSrc).toContain('4 sites');
    });

    test('reporter.ts has exactly 3 getDispatchTypeCell call sites (parity: Markdown overall + Markdown detail + HTML detail-card) + index.ts has 1 = 4 total', () => {
      // 6af9f47 模式基线: JSDoc N 与实际 call site 数同步。grep-style 二次校验 —
      // 4 sites 1:1 对齐 JSDoc 声明 (而非 3 stale count)。
      const reporterSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'reporter.ts'), 'utf-8');
      const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
      const reporterCallSites = reporterSrc.match(/getDispatchTypeCell\s*\(\s*result\s*\)/g) || [];
      const indexCallSites = indexSrc.match(/getDispatchTypeCell\s*\(\s*result\s*\)/g) || [];
      expect(reporterCallSites.length + indexCallSites.length).toBe(4);
      expect(reporterCallSites.length).toBe(3);
      expect(indexCallSites.length).toBe(1);
    });
  });
});
