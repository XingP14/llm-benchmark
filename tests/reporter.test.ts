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
      expect(files.length).toBe(3);
      expect(files.some((f: string) => f.endsWith('.json'))).toBe(true);
      expect(files.some((f: string) => f.endsWith('.md'))).toBe(true);
      expect(files.some((f: string) => f.endsWith('.html'))).toBe(true);

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
