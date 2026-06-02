// tests/reporter.test.ts

import { Reporter } from '../src/core/reporter';
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
  });

  describe('generateHTML', () => {
    it('should generate HTML report', () => {
      const html = Reporter.generateHTML(mockResults);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Model A');
      expect(html).toContain('Model B');
    });

    it('should generate CSV leaderboard', () => {
      const csv = Reporter.generateCSV(mockResults);
      const lines = csv.trim().split('\n');
      // header + 2 model rows
      expect(lines.length).toBe(3);
      // header check
      expect(lines[0]).toBe(
        'rank,model,total,dialogue,coding,function_calling,long_context,multi_turn,duration_s,questions'
      );
      // rows sorted by total desc, both have totalScore
      expect(lines[1]).toMatch(/^1,Model [AB],\d+,/);
      expect(lines[2]).toMatch(/^2,Model [AB],\d+,/);
      // optional dims (long_context / multi_turn) should be '-'
      expect(lines[1].split(',').slice(6, 8).every((v) => v === '-')).toBe(true);
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
});
