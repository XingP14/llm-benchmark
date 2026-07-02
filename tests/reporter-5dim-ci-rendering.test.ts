// tests/reporter-5dim-ci-rendering.test.ts
// v0.6.0 step-v6.0-4 step2 regression: pin CI rendering in Markdown / HTML / CSV
// (parallels 06-29 03:23 cron getDimCell extraction + 06-30 06:43 cron getDimCi helper).
// 数据层 Bootstrap95CI 已在 evaluator.ts b3cb35e (step-v6.0-2) 计算,
// helper 层 getDimCi / getDimCiCell 已在 2c4d613 (06-29 03:23 cron) 实现;
// 本轮 step-v6.0-4 step2 闭环报表层 (Markdown detail block + HTML detail card +
// CSV header + CSV row ci_lower / ci_upper 列)。
//
// DIM_HEADERS 真实 label (src/core/reporter.ts L28-34): 对话能力 / 代码能力 / 工具调用 / 长上下文 / 多轮对话

import { Reporter, getDimCell, getDimCiCell } from '../src/core/reporter';
import { EvaluationResult, DimensionScore, QuestionScore } from '../src/types';

const baseDim = (avg: number, ci?: { mean: number; std: number; ciLower: number; ciUpper: number; n: number; nResamples: number }) => ({
  total: avg,
  count: 1,
  average: avg,
  details: { test: avg },
  ci,
});

const mockScore = (modelName: string, dimensions: DimensionScore, total = 85): EvaluationResult => ({
  modelName,
  model: { name: modelName, model: modelName } as any,
  totalScore: total,
  duration: 10000,
  scores: [] as QuestionScore[],
  dimensions,
  timestamp: new Date('2026-07-02T06:43:00+08:00'),
});

describe('reporter 5-dim CI rendering (v0.6.0 step-v6.0-4 step2)', () => {
  const dimsWithCi: DimensionScore = {
    dialogue: baseDim(85, { mean: 85, std: 3.5, ciLower: 78.4, ciUpper: 92.6, n: 5, nResamples: 1000 }),
    coding: baseDim(75, { mean: 75, std: 2.1, ciLower: 71, ciUpper: 79, n: 5, nResamples: 1000 }),
    function_calling: baseDim(70),  // no ci
    long_context: baseDim(0, { mean: 0, std: 0, ciLower: 0, ciUpper: 0, n: 0, nResamples: 1000 }),  // n=0
    // multi_turn: undefined
  };

  describe('Markdown detail block CI sub-line', () => {
    test('emits CI sub-line when ci present + n>0 (dialogue)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('**对话能力**: 85.0');
      expect(md).toContain('*95% CI*: 85.0 \u00b13.5 [78.4, 92.6]');
      // 顺序保证 + 紧邻
      const dIdx = md.indexOf('**对话能力**: 85.0');
      const ciIdx = md.indexOf('*95% CI*: 85.0');
      expect(ciIdx).toBeGreaterThan(dIdx);
      expect(ciIdx - dIdx).toBeLessThan(100);
    });
    test('emits CI sub-line for coding dim (independent ci)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('**代码能力**: 75.0');
      expect(md).toContain('*95% CI*: 75.0 \u00b12.1 [71.0, 79.0]');
    });
    test('omits CI sub-line when ci absent (function_calling legacy path)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('**工具调用**: 70.0');
      const fcIdx = md.indexOf('**工具调用**: 70.0');
      const next = md.slice(fcIdx, fcIdx + 200);
      expect(next).not.toContain('*95% CI*:');
    });
    test('omits CI sub-line when n=0 (long_context safeguard)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('**长上下文**: 0.0');
      const lcIdx = md.indexOf('**长上下文**: 0.0');
      const next = md.slice(lcIdx, lcIdx + 200);
      expect(next).not.toContain('*95% CI*:');
    });
    test('omits CI sub-line when dim undefined (multi_turn)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('**多轮对话**: -');
      const mtIdx = md.indexOf('**多轮对话**: -');
      const next = md.slice(mtIdx, mtIdx + 200);
      expect(next).not.toContain('*95% CI*:');
    });
  });

  describe('HTML detail card CI sub-line', () => {
    test('emits <p class="dim-ci">95% CI: ...</p> when ci present', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<strong>对话能力:</strong> 85.0');
      expect(html).toContain('<p class="dim-ci">95% CI: 85.0 \u00b13.5 [78.4, 92.6]</p>');
      // 顺序保证
      const dIdx = html.indexOf('<strong>对话能力:</strong> 85.0');
      const ciIdx = html.indexOf('class="dim-ci"');
      expect(ciIdx).toBeGreaterThan(dIdx);
    });
    test('omits CI sub-line when ci absent (function_calling)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<strong>工具调用:</strong> 70.0');
      const fcIdx = html.indexOf('<strong>工具调用:</strong> 70.0');
      const next = html.slice(fcIdx, fcIdx + 300);
      expect(next).not.toContain('class="dim-ci"');
    });
    test('includes .dim-ci CSS class for grey small-font styling', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const html = Reporter.generateHTML([r]);
      expect(html).toMatch(/\.dim-ci \{ color: #7f8c8d; font-size: 0\.8em;/);
    });
  });

  describe('CSV ci_lower / ci_upper columns', () => {
    test('CSV header has 5 _ci_lower + 5 _ci_upper columns after main dim columns', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const csv = Reporter.generateCSV([r]);
      const header = csv.split('\n')[0];
      // flatMap interleave: dim1_ci_lower, dim1_ci_upper, dim2_ci_lower, dim2_ci_upper, ...
      expect(header).toBe('rank,model,total,dialogue,coding,function_calling,long_context,multi_turn,dialogue_ci_lower,dialogue_ci_upper,coding_ci_lower,coding_ci_upper,function_calling_ci_lower,function_calling_ci_upper,long_context_ci_lower,long_context_ci_upper,multi_turn_ci_lower,multi_turn_ci_upper,duration_s,questions');
    });
    test('CSV row ci cells = raw numbers for ci present + n>0', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const csv = Reporter.generateCSV([r]);
      const row = csv.split('\n')[1];
      // 列顺序: rank(0) model(1) total(2) dialogue(3) coding(4) function_calling(5)
      //         long_context(6) multi_turn(7)
      //         dialogue_ci_lower(8) dialogue_ci_upper(9)
      //         coding_ci_lower(10) coding_ci_upper(11)
      //         function_calling_ci_lower(12) function_calling_ci_upper(13)
      //         long_context_ci_lower(14) long_context_ci_upper(15)
      //         multi_turn_ci_lower(16) multi_turn_ci_upper(17)
      //         duration_s(18) questions(19)
      const cols = row.split(',');
      expect(cols[8]).toBe('78.4');
      expect(cols[9]).toBe('92.6');
      expect(cols[10]).toBe('71');
      expect(cols[11]).toBe('79');
    });
    test('CSV row ci cells = "-" when ci absent (function_calling)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const csv = Reporter.generateCSV([r]);
      const row = csv.split('\n')[1];
      const cols = row.split(',');
      expect(cols[12]).toBe('-');
      expect(cols[13]).toBe('-');
    });
    test('CSV row ci cells = "-" when n=0 (long_context)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const csv = Reporter.generateCSV([r]);
      const row = csv.split('\n')[1];
      const cols = row.split(',');
      // long_context ci but n=0 → getDimCi returns null → '-' '-'
      expect(cols[14]).toBe('-');
      expect(cols[15]).toBe('-');
    });
    test('CSV row ci cells = "-" when dim undefined (multi_turn)', () => {
      const r = mockScore('gpt-5.4', dimsWithCi);
      const csv = Reporter.generateCSV([r]);
      const row = csv.split('\n')[1];
      const cols = row.split(',');
      expect(cols[16]).toBe('-');
      expect(cols[17]).toBe('-');
    });
  });

  describe('regression gates (源码契约)', () => {
    test('reporter.ts no raw String(err) literal in new code path', () => {
      const fs = require('fs');
      const src = fs.readFileSync('src/core/reporter.ts', 'utf8');
      expect(src).not.toMatch(/String\(err\)/);
    });
    test('getDimCiCell is still exported (parallels 2c4d613 step1 helper)', () => {
      expect(typeof getDimCiCell).toBe('function');
    });
    test('getDimCell is still exported (regression gate, no helper rename)', () => {
      expect(typeof getDimCell).toBe('function');
    });
  });
});
