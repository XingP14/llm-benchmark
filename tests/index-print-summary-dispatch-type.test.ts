// tests/index-print-summary-dispatch-type.test.ts
// v0.6.0 step-v6.0-4 closure step4 regression: pin printSummary console 5-dim 报表
// 的 (type=<dispatchType>) 副标渲染. 修复 helper 引入但调用点未迁移的漏更模式
// (parallels 6af9f47 5-dim console-error defaults + 7265ec0 dispatchType helper 引入
// 同源). printSummary 是 src/index.ts 中唯一 5-dim console 报表入口, 与 reporter.ts
// Markdown overall-ranking / Markdown detail / HTML detail-card 形成 4-site parity.
//
// 数据层 EvaluationResult.dispatchType 已在 8f8f68c (06-30 03:23 cron) 加 optional
// field; reporter.ts 3 个 getDispatchTypeCell call site 已在 7265ec0 (07-03 03:23)
// step-v6.0-4 step3 闭合; 本测试 closure 4th site = printSummary console.

import * as fs from 'fs';
import * as path from 'path';
import { Reporter, getDispatchTypeCell } from '../src/core/reporter';
import { EvaluationResult, DimensionScore, QuestionScore, ExternalDispatchType } from '../src/types';

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
  dispatchType?: ExternalDispatchType | '',
  // 07-15 05:03 cron: ExternalDispatchType union is strict; legacy "empty string" probe
  // case uses `''` to test the helper's tolerant contract. Allow this probe string
  // through the fixture only — production callers are gated to the typed union.
): EvaluationResult => ({
  modelName,
  model: { name: modelName, model: modelName } as any,
  totalScore: total,
  duration: 10000,
  scores: [] as QuestionScore[],
  dimensions,
  timestamp: new Date('2026-07-04T01:33:00+08:00'),
  ...(dispatchType !== undefined ? { dispatchType: dispatchType as ExternalDispatchType } : {}),
});

describe('src/index.ts printSummary dispatchType 副标 closure (v0.6.0 step-v6.0-4 step4)', () => {
  describe('src/index.ts source parity gate', () => {
    const indexPath = path.join(__dirname, '..', 'src', 'index.ts');
    let src: string;
    let lines: string[];

    beforeAll(() => {
      src = fs.readFileSync(indexPath, 'utf-8');
      lines = src.split('\n');
    });

    test('src/index.ts imports getDispatchTypeCell from ./core/reporter (4th call site wired)', () => {
      expect(src).toMatch(/^import\s*\{[^}]*getDispatchTypeCell[^}]*\}\s*from\s*'\.\/core\/reporter'/m);
    });

    test('src/index.ts contains exactly 1 getDispatchTypeCell call site (printSummary body)', () => {
      // count occurrences (excluding comments and strings); single helper-call site
      const matches = src.match(/getDispatchTypeCell\s*\(/g) || [];
      // import adds 1 occurrence (without ()), call site adds 1 occurrence (with ())
      // count strict-call pattern: getDispatchTypeCell\s*\(result\)
      const callSites = src.match(/getDispatchTypeCell\s*\(\s*result\s*\)/g) || [];
      expect(callSites.length).toBe(1);
    });

    test('getDispatchTypeCell call site is inside printSummary function (not duplicate / not orphan)', () => {
      const callLineIdx = lines.findIndex((l) => /getDispatchTypeCell\s*\(\s*result\s*\)/.test(l));
      expect(callLineIdx).toBeGreaterThan(0);
      // window: 12 lines above should contain 'printSummary' (function definition) OR
      //          'modelLabel' (the const we declared for the wire)
      const window = lines.slice(Math.max(0, callLineIdx - 30), callLineIdx).join('\n');
      expect(window).toMatch(/printSummary|modelLabel/);
    });

    test('attribution comment mentions 07-04 01:33 cron + step-v6.0-4 closure', () => {
      const callLineIdx = lines.findIndex((l) => /getDispatchTypeCell\s*\(\s*result\s*\)/.test(l));
      expect(callLineIdx).toBeGreaterThan(0);
      const window = lines.slice(Math.max(0, callLineIdx - 14), callLineIdx).join('\n');
      expect(window).toMatch(/07-04[\s\S]*cron/i);
      expect(window).toMatch(/step-v6\.0-4[\s\S]*step4|closure[\s\S]*step4/i);
    });

    test('modelLabel template-literal gate (07-05 02:03 cron step-v6.0-5 closure: dtCell ?? subCell ?? concatenated after modelName)', () => {
      // step-v6.0-4 ternary form 已演化: 现 modelLabel = `${result.modelName}${dtCell ?? ''}${subCell ?? ''}`
      // (副标串联 dtCell + subCell, 视觉 "modelname (type=X) [...]").
      const src2 = fs.readFileSync(indexPath, 'utf-8');
      expect(src2).toMatch(/modelLabel\s*=\s*`\$\{result\.modelName\}\$\{dtCell\s*\?\?\s*''\}\$\{subCell\s*\?\?\s*''\}`/);
    });

    test('getSubLabel helper imported in index.ts (chain #7 closure 4th site parallel to getDispatchTypeCell 4-site chain 7265ec0)', () => {
      // 07-05 02:03 cron: 闭合 chain #7 helper-extraction (getSubLabel 引入但调用点未迁移的漏更),
      // 4 处 call site (Markdown overall + Markdown detail + HTML detail-card + printSummary)
      // parallels getDispatchTypeCell 4-site chain (7265ec0 + 07-04 01:33 cron).
      const src2 = fs.readFileSync(indexPath, 'utf-8');
      expect(src2).toMatch(/import\s*\{[^}]*getSubLabel[^}]*\}\s*from\s*'\.\/core\/reporter'/);
      expect(src2).toMatch(/const\s+subCell\s*=\s*getSubLabel\(/);
    });

    test('subCell lookup uses result.scores find() pattern (chain #7 helper跨 QuestionScore 层聚合, parallels 6d71bef dispatchType 跨层)', () => {
      // subset/mode/risk 字段在 QuestionScore 层 (vs dispatchType 在 EvaluationResult 层),
      // 跨层聚合需 result.scores.find() 取首个 subset/mode/risk 任一非空的 QuestionScore.
      const src2 = fs.readFileSync(indexPath, 'utf-8');
      expect(src2).toMatch(/getSubLabel\(\s*result\.scores\?\.find\(/);
    });

    test('cell array uses modelLabel (not raw result.modelName)', () => {
      // 5-dim cells row now wires modelLabel in the model-name slot
      expect(src).toMatch(/cells\s*=\s*\[medal,\s*modelLabel,\s*`\*\*\$\{result\.totalScore\}\*\*`/);
    });
  });

  describe('getDispatchTypeCell helper parity (re-used from reporter-5dim-dispatch-type-cell)', () => {
    // Light re-validation: ensure the helper imported into index.ts behaves identically.
    test('returns " (type=agentic_coding)" round-trip', () => {
      const r = mockScore('gpt-5.4', mockDims(), 85, 'agentic_coding');
      expect(getDispatchTypeCell(r)).toBe(' (type=agentic_coding)');
    });
    test('returns null when dispatchType is undefined (v0.5 backward-compat — printSummary absent path)', () => {
      const r = mockScore('gpt-5.4', mockDims());
      expect(getDispatchTypeCell(r)).toBeNull();
    });
    test('returns null when dispatchType is empty string', () => {
      const r = mockScore('gpt-5.4', mockDims(), 85, '');
      expect(getDispatchTypeCell(r)).toBeNull();
    });
    test('returns " (type=agentic_swe)" for swe_bench_pro subset', () => {
      const r = mockScore('claude-opus', mockDims(), 90, 'agentic_swe');
      expect(getDispatchTypeCell(r)).toBe(' (type=agentic_swe)');
    });
  });

  describe('printSummary 4th call site closes v0.6.0 step-v6.0-4 副标 closure chain', () => {
    test('reporter.ts has exactly 3 getDispatchTypeCell call sites (pre-existing) + index.ts 1 = 4 total', () => {
      const reporterSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'reporter.ts'), 'utf-8');
      const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
      const reporterCalls = reporterSrc.match(/getDispatchTypeCell\s*\(/g) || [];
      // reporter.ts: 1 export declaration + 3 call sites = 4 occurrences (declaration has no () but match includes 'Cell(' so it's 1 export + 3 calls = 4 — wait the regex matches "getDispatchTypeCell(" which excludes export declarations)
      // Re-count strictly: helper invocations (with parentheses after the helper name)
      const reporterCallSites = reporterSrc.match(/getDispatchTypeCell\s*\(\s*result\s*\)/g) || [];
      const indexCallSites = indexSrc.match(/getDispatchTypeCell\s*\(\s*result\s*\)/g) || [];
      // Expected: 3 in reporter.ts (Markdown overall L173, Markdown detail L186, HTML detail-card L347) + 1 in index.ts (printSummary) = 4
      expect(reporterCallSites.length + indexCallSites.length).toBe(4);
      expect(reporterCallSites.length).toBe(3);
      expect(indexCallSites.length).toBe(1);
    });

    test('Reporter.generateMarkdown / generateHTML / printSummary console all consistent: dispatchType round-trip', () => {
      // End-to-end: same EvaluationResult with dispatchType=agentic_coding →
      // Markdown overall row model cell contains "(type=agentic_coding)"
      // Markdown detail 总分 contains "(type=agentic_coding)" + dispatchType: sub-line
      // HTML detail-card <p class="dispatch-type-tag"> contains "(type=agentic_coding)"
      const r = mockScore('claude-opus', mockDims(), 88, 'agentic_coding');
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('(type=agentic_coding)');
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<p class="dispatch-type-tag"> (type=agentic_coding)</p>');
      // CSV unchanged — machine precision, no text contamination
      const csv = Reporter.generateCSV([r]);
      expect(csv).not.toContain('(type=');
    });
  });
});
