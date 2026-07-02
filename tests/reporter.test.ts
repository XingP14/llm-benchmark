// tests/reporter.test.ts

import { Reporter, DIM_HEADERS, getDimCell, getDimValue } from '../src/core/reporter';
import { EvaluationResult } from '../src/types';

const mockResults: EvaluationResult[] = [
  {
    modelName: 'Model A',
    model: {
      name: 'Model A',
      endpoint: 'https://api.a.com',
      apiKey: 'key',
      type: 'openai',
    },
    scores: [
      {
        questionId: 'q1',
        category: 'test',
        score: 85,
        dimension: 'dialogue',
        modelOutput: 'output',
      },
    ],
    totalScore: 85,
    dimensions: {
      dialogue: {
        total: 85,
        count: 1,
        average: 85,
        details: { test: 85 },
      },
      coding: {
        total: 75,
        count: 1,
        average: 75,
        details: { test: 75 },
      },
      function_calling: {
        total: 65,
        count: 1,
        average: 65,
        details: { test: 65 },
      },
    },
    timestamp: new Date(),
    duration: 5000,
  },
  {
    modelName: 'Model B',
    model: {
      name: 'Model B',
      endpoint: 'https://api.b.com',
      apiKey: 'key',
      type: 'openai',
    },
    scores: [
      {
        questionId: 'q1',
        category: 'test',
        score: 90,
        dimension: 'dialogue',
        modelOutput: 'output',
      },
    ],
    totalScore: 90,
    dimensions: {
      dialogue: {
        total: 90,
        count: 1,
        average: 90,
        details: { test: 90 },
      },
      coding: {
        total: 80,
        count: 1,
        average: 80,
        details: { test: 80 },
      },
      function_calling: {
        total: 70,
        count: 1,
        average: 70,
        details: { test: 70 },
      },
    },
    timestamp: new Date(),
    duration: 6000,
  },
];

describe('Reporter', () => {
  describe('generateJSON', () => {
    it('should generate JSON report', () => {
      const report = Reporter.generateJSON(mockResults);
      expect(report.results).toHaveLength(2);
      expect(report.stats.totalModels).toBe(2);
      expect(report.generatedAt).toBeDefined();
    });
  });

  describe('generateMarkdown', () => {
    it('should generate markdown report', () => {
      const md = Reporter.generateMarkdown(mockResults);
      expect(md).toContain('# LLM Benchmark 报告');
      expect(md).toContain('Model A');
      expect(md).toContain('Model B');
      expect(md).toContain('总体排名');
    });

    it('should include all 5 dimensions in v0.4.0 markdown (regression: 漏更)', () => {
      // 之前 reporter 只在 CSV 修了 5 维度，md/html 仍只展示 2 维度
      const md = Reporter.generateMarkdown(mockResults);
      // 表头含 5 维度
      expect(md).toContain('对话能力');
      expect(md).toContain('代码能力');
      expect(md).toContain('工具调用');
      expect(md).toContain('长上下文');
      expect(md).toContain('多轮对话');
      // 启用的维度有值（function_calling 在 mockResults 里: 65 / 70）
      // 表格中 dimension 行类似: | 85.0 | 75.0 | 65.0 | - | - | 5.0s |
      expect(md).toMatch(/\b(65|70)\.0\b/);
      // 未启用的维度在表格行中以 `-` 出现
      expect(md).toMatch(/\|\s+-\s+\|\s+-\s+\|/);
      // 详情段：function_calling 分类
      expect(md).toContain('**工具调用分类:**');
      expect(md).toMatch(/\| test \| (65|70) \|/);
    });
  });

  describe('generateHTML', () => {
    it('should generate HTML report', () => {
      const html = Reporter.generateHTML(mockResults);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Model A');
      expect(html).toContain('Model B');
    });

    it('should include all 5 dimensions in v0.4.0 HTML (regression: 漏更)', () => {
      // 同上 — HTML 报告也应该 5 维度
      const html = Reporter.generateHTML(mockResults);
      // 表头含 5 维度
      expect(html).toContain('>对话能力<');
      expect(html).toContain('>代码能力<');
      expect(html).toContain('>工具调用<');
      expect(html).toContain('>长上下文<');
      expect(html).toContain('>多轮对话<');
      // 启用的维度有值
      expect(html).toContain('65.0');
      // 未启用的维度有 dim-na 标记
      expect(html).toContain('class="dim-na">-</span>');
    });

    it('should generate CSV leaderboard (v0.6.0 step-v6.0-4 07-02 06:43 cron: +10 ci_lower/ci_upper cols)', () => {
      const csv = Reporter.generateCSV(mockResults);
      const lines = csv.trim().split('\n');
      // header + 2 model rows
      expect(lines.length).toBe(3);
      // header check (flatMap interleave: dim_ci_lower, dim_ci_upper per dim)
      expect(lines[0]).toBe(
        'rank,model,total,dialogue,coding,function_calling,long_context,multi_turn,dialogue_ci_lower,dialogue_ci_upper,coding_ci_lower,coding_ci_upper,function_calling_ci_lower,function_calling_ci_upper,long_context_ci_lower,long_context_ci_upper,multi_turn_ci_lower,multi_turn_ci_upper,duration_s,questions'
      );
      // rows sorted by total desc, both have totalScore
      expect(lines[1]).toMatch(/^1,Model [AB],\d+,/);
      expect(lines[2]).toMatch(/^2,Model [AB],\d+,/);
      // optional dims (long_context / multi_turn) should be '-' in 主列 + '-' in ci 列
      expect(lines[1].split(',').slice(6, 8).every((v) => v === '-')).toBe(true);
      // long_context / multi_turn ci 列 idx 14..17 应为 '-' (mockResults 无 ci 字段)
      const cols1 = lines[1].split(',');
      expect(cols1[14]).toBe('-');  // long_context_ci_lower
      expect(cols1[15]).toBe('-');  // long_context_ci_upper
      expect(cols1[16]).toBe('-');  // multi_turn_ci_lower
      expect(cols1[17]).toBe('-');  // multi_turn_ci_upper
      // dialogue / coding / function_calling ci 列同样为 '-' (mockResults 无 ci)
      expect(cols1[8]).toBe('-');   // dialogue_ci_lower
      expect(cols1[9]).toBe('-');   // dialogue_ci_upper
      expect(cols1[10]).toBe('-');  // coding_ci_lower
      expect(cols1[11]).toBe('-');  // coding_ci_upper
      expect(cols1[12]).toBe('-');  // function_calling_ci_lower
      expect(cols1[13]).toBe('-');  // function_calling_ci_upper
    });

    it('should escape commas/quotes/newlines in CSV model name', () => {
      const tricky: EvaluationResult = {
        ...mockResults[0],
        modelName: 'Model, with "quote" and\nnewline',
      };
      const csv = Reporter.generateCSV([tricky]);
      // 模型名含特殊字符 → 应被引号包裹 + 内部引号转义
      expect(csv).toContain('"Model, with ""quote"" and\nnewline"');
    });
  });

  describe('saveReport', () => {
    it('should save report files to output directory', () => {
      const fs = require('fs');
      const path = require('path');
      const outputDir = './test-report-output';

      // 确保输出目录不存在
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true });
      }

      Reporter.saveReport(mockResults, outputDir);

      // 验证文件已创建
      expect(fs.existsSync(outputDir)).toBe(true);

      const files = fs.readdirSync(outputDir);
      expect(files.length).toBe(4);
      expect(files.some((f: string) => f.endsWith('.json'))).toBe(true);
      expect(files.some((f: string) => f.endsWith('.md'))).toBe(true);
      expect(files.some((f: string) => f.endsWith('.html'))).toBe(true);
      expect(files.some((f: string) => f.endsWith('.csv'))).toBe(true);

      // 清理
      fs.rmSync(outputDir, { recursive: true });
    });

    it('should create output directory if it does not exist', () => {
      const fs = require('fs');
      const outputDir = './test-report-output-new';

      // 确保输出目录不存在
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true });
      }

      Reporter.saveReport(mockResults, outputDir);

      expect(fs.existsSync(outputDir)).toBe(true);

      // 清理
      fs.rmSync(outputDir, { recursive: true });
    });
  });

  // 06-20 cron refactor: DIM_HEADERS + getDimCell 从 Reporter 私有 static
  // 提为 module-level export，与 src/index.ts printSummary 共享。
  // 下述 test 锁定导出行为，避免后续谁又把它在两处拷贝。
  describe('shared exports (DIM_HEADERS + getDimCell)', () => {
    it('DIM_HEADERS has 5 entries with consistent key/label/cn', () => {
      expect(DIM_HEADERS).toHaveLength(5);
      const keys = DIM_HEADERS.map((d) => d.key);
      expect(keys).toEqual(['dialogue', 'coding', 'function_calling', 'long_context', 'multi_turn']);
      for (const d of DIM_HEADERS) {
        expect(d.label.length).toBeGreaterThan(0);
        expect(d.cn.length).toBeGreaterThan(0);
      }
    });

    it('getDimCell returns "-" for missing/undefined dimension', () => {
      expect(getDimCell(undefined, 'dialogue')).toBe('-');
      const dims = { dialogue: undefined } as any;
      expect(getDimCell(dims, 'dialogue')).toBe('-');
    });

    it('getDimCell returns "-" for dimension without numeric average', () => {
      const dims = { dialogue: { total: 100, count: 1 } } as any;
      expect(getDimCell(dims, 'dialogue')).toBe('-');
    });

    it('getDimCell formats average to 1 decimal place', () => {
      expect(getDimCell({ dialogue: { average: 90, total: 90, count: 1 } } as any, 'dialogue')).toBe('90.0');
      expect(getDimCell({ coding: { average: 92.456, total: 92, count: 1 } } as any, 'coding')).toBe('92.5');
      expect(getDimCell({ coding: { average: 0, total: 0, count: 0 } } as any, 'coding')).toBe('0.0');
    });
  });

  // 06-29 03:23 cron: regression test gating 5-dim helper extraction (parallels the
  // getDimCell 漏更续集 mode in reporter.ts generateHTML × 2 + generateCSV × 1).
  // Asserts:
  //   (1) getDimValue exists as module-level export, returns null for missing/invalid
  //   (2) getDimValue returns the raw number for valid dimensions (used for HTML bar
  //       width and CSV raw-cell, must NOT be toFixed(1))
  //   (3) reporter.ts source contains zero inline `typeof dim.average !== 'number'`
  //       副本 (would be 漏更 signal — only allowed sites are inside getDimValue +
  //       getDimCell module-level helpers).
  describe('getDimValue (raw number helper, 5-dim 漏更续集)', () => {
    it('is exported as module-level function (parallels getDimCell export)', () => {
      expect(typeof getDimValue).toBe('function');
      // Same module, must be the helper, not a Reporter method
      const reporterProto = Reporter as unknown as Record<string, unknown>;
      expect(reporterProto.getDimValue).toBeUndefined();
    });

    it('returns null for missing/undefined dimension', () => {
      expect(getDimValue(undefined, 'dialogue')).toBeNull();
      const dims = { dialogue: undefined } as any;
      expect(getDimValue(dims, 'dialogue')).toBeNull();
    });

    it('returns null for dimension without numeric average', () => {
      const dims = { dialogue: { total: 100, count: 1 } } as any;
      expect(getDimValue(dims, 'dialogue')).toBeNull();
      // average 存在但非 number (e.g. string) 也要 null
      const dims2 = { coding: { average: '90' as any, total: 90, count: 1 } } as any;
      expect(getDimValue(dims2, 'coding')).toBeNull();
    });

    it('returns the raw numeric average (NOT toFixed(1))', () => {
      // raw number 供 HTML bar width (style="width: 92.456%") 与 CSV 原始 cell 用,
      // 不能跟 getDimCell 一样 toFixed(1) — 否则 CSV Excel 二次分析会丢精度
      expect(getDimValue({ dialogue: { average: 90, total: 90, count: 1 } } as any, 'dialogue')).toBe(90);
      expect(getDimValue({ coding: { average: 92.456, total: 92, count: 1 } } as any, 'coding')).toBe(92.456);
      expect(getDimValue({ coding: { average: 0, total: 0, count: 0 } } as any, 'coding')).toBe(0);
    });
  });

  describe('reporter.ts 5-dim 漏更 regression gate', () => {
    it('zero inline `typeof dim.average` 副本 outside getDimValue/getDimCell helpers', () => {
      // Read the source file at test time, assert all 4 inline sites in generateHTML
      // (td) + generateHTML (detail-card) + generateCSV (row) have been routed through
      // the helpers. Only getDimValue + getDimCell may reference the gate in actual code
      // (comments mentioning the pattern are fine). Strategy: strip JSDoc /* ... */ blocks
      // and // line comments, THEN strip the 2 helper bodies via brace-counting, THEN assert.
      const fs = require('fs');
      const path = require('path');
      const raw = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'reporter.ts'),
        'utf-8'
      );
      // Strip /* ... */ block comments (non-greedy, multiline)
      let src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
      // Strip // ... line comments
      src = src.replace(/^\s*\/\/.*$/gm, '');
      const stripFunction = (s: string, signature: string): string => {
        const idx = s.indexOf(signature);
        if (idx === -1) return s;
        const open = s.indexOf('{', idx);
        if (open === -1) return s;
        let depth = 1;
        let i = open + 1;
        while (i < s.length && depth > 0) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}') depth--;
          i++;
        }
        return s.slice(0, idx) + s.slice(i);
      };
      const stripped = stripFunction(
        stripFunction(src, 'export function getDimValue'),
        'export function getDimCell'
      );
      // The actual `if (!dim || typeof dim.average !== 'number')` form is the gate that
      // was inlined 3 times (now routed through getDimValue). Zero 副本 after refactor.
      expect(stripped).not.toMatch(/typeof\s+dim\.average\s+!==?\s+['"]number['"]/);
      // The inverse `dim && typeof dim.average === 'number'` form was in generateCSV
      // (now routed through getDimValue too).
      expect(stripped).not.toMatch(/dim\s*&&\s*typeof\s+dim\.average\s+===\s+['"]number['"]/);
    });
  });

  // 07-02 02:03 cron: 5-dim attribution-comment parity gate.
  // Every helper call site for 5-dim tables (Reporter + index.ts printSummary) must
  // carry a `06-29 03:23 cron` (or newer 06-29/06-30) attribution comment within
  // the 6 lines preceding the helper call. Otherwise a future refactor could
  // accidentally drop the refactor attribution from some sites while keeping it
  // in others (parallels 5b0cc3a / 6af9f47 / 9fa8bb5 / 9e8f7ff «documented-but-
  // partially-stale-attribution-comment» bug class). Strategy: read source files,
  // find every `getDimCell(...dimensions` / `getDimValue(...dimensions` call, then
  // assert each call site has a `06-29 03:23 cron` (or `06-29 02:04 cron`,
  // 06-30 etc.) comment marker within 6 lines above the call.
  describe('5-dim helper call site attribution parity (07-02 02:03 cron regression gate)', () => {
    it('every getDimCell/getDimValue 5-dim call site has 06-29 cron attribution comment', () => {
      const fs = require('fs');
      const path = require('path');
      const reporterSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'reporter.ts'),
        'utf-8'
      );
      const indexSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'index.ts'),
        'utf-8'
      );

      // Find all `getDimCell(..., dimensions` and `getDimValue(..., dimensions` calls.
      // Match the helper name + open-paren + lookbehind-style: scan all lines,
      // collect (lineNumber, helperName, lineText) tuples.
      const sites: { file: string; line: number; helper: string; text: string }[] = [];
      const scanFile = (filePath: string, src: string): void => {
        const lines = src.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i];
          const m = t.match(/\b(getDimCell|getDimValue)\s*\(/);
          if (!m) continue;
          // Skip helper definitions themselves (export function getDimCell/getDimValue)
          if (/^export\s+function\s+/.test(t)) continue;
          // Skip the import line (import { ... getDimCell ... } from ...)
          if (/^import\s+\{/.test(t)) continue;
          sites.push({
            file: filePath,
            line: i + 1,
            helper: m[1],
            text: t.trim(),
          });
        }
      };
      scanFile('src/core/reporter.ts', reporterSrc);
      scanFile('src/index.ts', indexSrc);

      const lines_by_file = new Map<string, string[]>();
      lines_by_file.set('src/core/reporter.ts', reporterSrc.split('\n'));
      lines_by_file.set('src/index.ts', indexSrc.split('\n'));

      // Exclude calls that live INSIDE the helper bodies themselves (e.g.
      // getDimCell body calls getDimValue). Those are internal helper composition,
      // not 5-dim table call sites. Strategy: for each site, walk back to find
      // the enclosing `export function <name>` (or `function <name>`) header;
      // if the enclosing function is `getDimCell` or `getDimValue`, skip the site.
      const filteredSites = sites.filter((site) => {
        const lines = lines_by_file.get(site.file)!;
        for (let i = site.line - 1; i >= 0; i--) {
          const t = lines[i];
          // Match top-level `export function <name>(...)` 
          const fm = t.match(/^(export\s+)?function\s+(\w+)\s*\(/);
          if (fm) {
            return fm[2] !== 'getDimCell' && fm[2] !== 'getDimValue';
          }
          // Match class-static-method `static <name>(...)` — inside Reporter class
          const sm = t.match(/^\s*static\s+(\w+)\s*\(/);
          if (sm) {
            return sm[1] !== 'getDimCell' && sm[1] !== 'getDimValue';
          }
        }
        // No enclosing function/method found before file start — assume it's top-level
        return true;
      });

      // We expect >= 6 5-dim helper call sites (5 in reporter.ts + >=1 in src/index.ts printSummary).
      expect(filteredSites.length).toBeGreaterThanOrEqual(6);

      // For each site, look at the 6 lines above and assert at least one contains
      // a `06-29 03:23 cron` or `06-29 02:04 cron` or `06-29` attribution marker.
      // We accept any `06-29 ... cron` because the refactor series ran on 06-29
      // across multiple cron ticks (02:04 printBenchmarkSection, 03:23 reporter
      // helpers). If we ever re-touch the helpers, future crons can update the
      // attribution inline; the gate is about preventing silent drift.
      const failures: string[] = [];
      for (const site of filteredSites) {
        const lines = lines_by_file.get(site.file)!;
        const start = Math.max(0, site.line - 7); // 6 lines above + 1 buffer
        const window = lines.slice(start, site.line).join('\n');
        if (!/06-29[\s\S]*cron/i.test(window)) {
          failures.push(
            site.file + ':' + site.line + ' ' + site.helper + ' call has no 06-29 cron attribution in 6 lines above:\n' +
              '    line: ' + site.text + '\n' +
              '    window:\n' + window.split('\n').map((l) => '      ' + l).join('\n')
          );
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
