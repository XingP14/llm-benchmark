// tests/reporter-sub-label-wiring.test.ts
// v0.6.0 step-v6.0-5 closure step2 regression: pin getSubLabel() helper 引入但调用点未迁移
// 漏更闭合 (parallels step-v6.0-4 7265ec0 dispatchType 4-site chain). getSubLabel helper
// 已在 35ad667 (07-04 22:23 cron) 立; 本轮 07-05 02:03 cron 闭合 4 sites:
//   - Markdown overall-ranking 行 model cell 拼 subCell 在 dtCell 之后
//   - Markdown detail block dispatchType 后附 sub-line "**subset/mode/risk**: [...]"
//   - HTML detail-card dispatch-type-tag 后附 <p class="sub-label-tag">
//   - src/index.ts printSummary console 同 Markdown overall 视觉拼接
//
// 测试范围: (a) helper parity (subLabel 返回值形状, 沿 step-v6.0-5 已有 12 tests)
//           (b) 4-site call-site count + 视觉副标 round-trip end-to-end
//           (c) 跨层聚合 result.scores.find() 模式 (subset/mode/risk 在 QuestionScore 层,
//              dispatchType 在 EvaluationResult 层 — 跨层聚合沿 6d71bef 同模式)
// CSV unchanged — machine precision, 不污染 (parallels dispatchType CSV 守).

import * as fs from 'fs';
import * as path from 'path';
import { Reporter, getSubLabel, getDispatchTypeCell, findSubLabelScore } from '../src/core/reporter';
import { EvaluationResult, DimensionScore, QuestionScore, ExternalDispatchType } from '../src/types';

const baseDim = (avg: number) => ({
  total: avg,
  count: 1,
  average: avg,
  details: { test: avg },
});

const mockDims = (dialogue = 85, coding = 75): DimensionScore => ({
  dialogue: baseDim(dialogue) as DimensionScore['dialogue'],
  coding: baseDim(coding) as DimensionScore['coding'],
});

const mockQs = (
  subset?: string,
  mode?: string,
  riskCategories?: string[],
): QuestionScore => ({
  questionId: 'q1',
  category: 'terminal_bench',
  dimension: 'coding',
  score: 90,
  modelOutput: 'mock output',
  ...(subset !== undefined ? { subset } : {}),
  ...(mode !== undefined ? { mode } : {}),
  ...(riskCategories !== undefined ? { riskCategories } : {}),
});

const mockScore = (
  modelName: string,
  dimensions: DimensionScore,
  scores: QuestionScore[] = [],
  dispatchType?: ExternalDispatchType | '',
  // 07-15 05:03 cron: ExternalDispatchType union is strict; legacy "empty string" probe
  // case uses `''` to test the helper's tolerant contract. Allow this probe string
  // through the fixture only — production callers are gated to the typed union.
  total = 85,
): EvaluationResult => ({
  modelName,
  model: { name: modelName, model: modelName } as any,
  totalScore: total,
  duration: 10000,
  scores,
  dimensions,
  timestamp: new Date('2026-07-05T02:03:00+08:00'),
  ...(dispatchType !== undefined ? { dispatchType: dispatchType as ExternalDispatchType } : {}),
});

describe('getSubLabel 4-site closure (v0.6.0 step-v6.0-5 step2, chain #7 helper-extraction)', () => {
  describe('src/core/reporter.ts call-site count parity gate', () => {
    const reporterPath = path.join(__dirname, '..', 'src', 'core', 'reporter.ts');
    let src: string;
    beforeAll(() => {
      src = fs.readFileSync(reporterPath, 'utf-8');
    });

    test('exports findSubLabelScore as the single cross-layer lookup helper', () => {
      expect(src).toMatch(/export function findSubLabelScore\(scores: QuestionScore\[\] \| undefined\): QuestionScore \| undefined/);
    });

    test('reporter.ts has exactly 3 getSubLabel call sites across Markdown and HTML', () => {
      // reporter.ts contains 1 export declaration plus 3 runtime calls:
      // Markdown overall, Markdown detail, and HTML detail-card.
      const totalMatches = (src.match(/getSubLabel\s*\(/g) || []).length;
      const callSiteCount = totalMatches - 1; // -1 for export declaration
      expect(callSiteCount).toBe(3);
    });

    test('src/index.ts has exactly 1 getSubLabel call site (printSummary console — chain #7 4th site)', () => {
      const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
      const invocations = indexSrc.match(/getSubLabel\s*\(\s*[a-zA-Z_]/g) || [];
      expect(invocations.length).toBe(1);
    });

    test('all 4 report call sites use findSubLabelScore before getSubLabel', () => {
      const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
      const reporterCalls = src.match(/getSubLabel\(\s*findSubLabelScore\(result\.scores\)\s*\)/g) || [];
      const indexCalls = indexSrc.match(/getSubLabel\(\s*findSubLabelScore\(result\.scores\)\s*\)/g) || [];
      expect(reporterCalls).toHaveLength(3);
      expect(indexCalls).toHaveLength(1);
    });
  });

  describe('Markdown overall-ranking sub-label 副标 round-trip', () => {
    test('model cell has subLabel suffix after dispatchType (subCell absent → only dtCell rendered)', () => {
      const r = mockScore('claude-opus', mockDims(), [mockQs()], 'agentic_coding', 88);
      const md = Reporter.generateMarkdown([r]);
      // 1st row of overall ranking: 包含 "claude-opus (type=agentic_coding)" (no subCell when all absent)
      expect(md).toContain('claude-opus (type=agentic_coding)');
      expect(md).not.toContain('claude-opus (type=agentic_coding) [subset=');
    });

    test('model cell has subLabel suffix after dispatchType (subCell present → dtCell + subCell concatenated)', () => {
      const r = mockScore(
        'claude-opus',
        mockDims(),
        [mockQs('verified')],
        'agentic_swe',
        88,
      );
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('claude-opus (type=agentic_swe) [subset=verified]');
    });

    test('model cell subCell-only when dispatchType absent (subLabel rendering without dtCell)', () => {
      // v0.5 backward-compat: dispatchType 缺失时 dtCell === null, subCell 仍渲染
      const r = mockScore(
        'gpt-5.4',
        mockDims(),
        [mockQs('full')],
        undefined,
        80,
      );
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('gpt-5.4 [subset=full]');
    });
  });

  describe('Markdown detail block sub-line round-trip', () => {
    test('Markdown detail 总分后附 **subset/mode/risk**: [subset=verified] sub-line when subCell present', () => {
      const r = mockScore(
        'claude-opus',
        mockDims(),
        [mockQs('verified', 'commit_count')],
        'agentic_swe',
        88,
      );
      const md = Reporter.generateMarkdown([r]);
      // 总分 → dispatchType → subset/mode/risk 三段 line 在 detail block 中
      expect(md).toContain('- **dispatchType**: (type=agentic_swe)');
      expect(md).toContain('- **subset/mode/risk**: [subset=verified|mode=commit_count]');
    });

    test('Markdown detail 不出现 subset/mode/risk sub-line when all absent (helper null parity)', () => {
      const r = mockScore(
        'gpt-5.4',
        mockDims(),
        [mockQs()],
        'agentic_coding',
        80,
      );
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('- **dispatchType**: (type=agentic_coding)');
      expect(md).not.toContain('- **subset/mode/risk**:');
    });
  });

  describe('HTML detail-card sub-label-tag round-trip', () => {
    test('HTML detail-card <p class="sub-label-tag">[subset=verified] 后附在 dispatchType 后', () => {
      const r = mockScore(
        'claude-opus',
        mockDims(),
        [mockQs('verified')],
        'agentic_swe',
        88,
      );
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<p class="dispatch-type-tag"> (type=agentic_swe)</p>');
      expect(html).toContain('<p class="sub-label-tag"> [subset=verified]</p>');
    });

    test('HTML detail-card 不出现 sub-label-tag when subCell absent', () => {
      const r = mockScore(
        'gpt-5.4',
        mockDims(),
        [mockQs()],
        'agentic_coding',
        80,
      );
      const html = Reporter.generateHTML([r]);
      expect(html).toContain('<p class="dispatch-type-tag"> (type=agentic_coding)</p>');
      expect(html).not.toContain('sub-label-tag');
    });
  });

  describe('CSV machine-precision unchanged (subLabel 不污染 CSV)', () => {
    test('CSV 不含 [subset= / [mode= / [risk= 任何副标字符串', () => {
      const r = mockScore(
        'claude-opus',
        mockDims(),
        [mockQs('verified', 'commit_count', ['fuzzing'])],
        'agentic_swe',
        88,
      );
      const csv = Reporter.generateCSV([r]);
      expect(csv).not.toContain('[subset=');
      expect(csv).not.toContain('[mode=');
      expect(csv).not.toContain('[risk=');
    });
  });

  describe('跨层聚合 findSubLabelScore() 模式', () => {
    test('findSubLabelScore returns undefined when scores are absent or all labels are empty', () => {
      expect(findSubLabelScore(undefined)).toBeUndefined();
      expect(findSubLabelScore([])).toBeUndefined();
      expect(findSubLabelScore([mockQs(), mockQs('', '', ['', ''])])).toBeUndefined();
    });

    test('findSubLabelScore chooses the first labeled score', () => {
      const first = mockQs('verified');
      const second = mockQs('full');
      expect(findSubLabelScore([mockQs(), first, second])).toBe(first);
    });

    test('findSubLabelScore considers mode and non-empty risk categories as labels', () => {
      const modeOnly = mockQs(undefined, 'commit_count');
      const riskOnly = mockQs(undefined, undefined, ['', 'fuzzing']);
      expect(findSubLabelScore([mockQs(), modeOnly, riskOnly])).toBe(modeOnly);
      expect(findSubLabelScore([mockQs(), riskOnly])).toBe(riskOnly);
    });

    test('findSubLabelScore returns first QuestionScore with any subset/mode/risk 非空', () => {
      // 5 fetcher 注入 QuestionScore 时, 每条 score 含 subset / mode / riskCategories.
      // reporter 跨层聚合: findSubLabelScore() 取首个含任一副标字段的 QuestionScore.
      const scores = [
        mockQs(), // 空 — 跳过
        mockQs('verified'), // 首个非空 — 选这个
        mockQs('full'), // 跳过 (find() 不再迭代)
      ];
      const r = mockScore('claude-opus', mockDims(), scores, 'agentic_swe', 88);
      const md = Reporter.generateMarkdown([r]);
      expect(md).toContain('[subset=verified]'); // 首个非空
      expect(md).not.toContain('[subset=full]'); // 后续 skip
    });

    test('find() 在 scores 全空时返回 undefined, subCell null parity (CSV + Markdown + HTML 一致 absent)', () => {
      const r = mockScore(
        'gpt-5.4',
        mockDims(),
        [mockQs(), mockQs(), mockQs()],
        'agentic_coding',
        80,
      );
      const md = Reporter.generateMarkdown([r]);
      const html = Reporter.generateHTML([r]);
      const csv = Reporter.generateCSV([r]);
      expect(md).not.toContain('[subset=');
      expect(html).not.toContain('sub-label-tag');
      expect(csv).not.toContain('[subset=');
    });
  });

  describe('printSummary console 4th site (src/index.ts)', () => {
    test('printSummary modelLabel 拼 `${result.modelName}${dtCell ?? ""}${subCell ?? ""}` 三段', () => {
      const indexSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf-8');
      // 验证 printSummary 内 modelLabel 模板字符串同时含 dtCell ?? '' 和 subCell ?? ''
      expect(indexSrc).toMatch(/modelLabel\s*=\s*`\$\{result\.modelName\}\$\{dtCell\s*\?\?\s*''\}\$\{subCell\s*\?\?\s*''\}`/);
    });
  });
});
