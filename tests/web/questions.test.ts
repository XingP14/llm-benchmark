// tests/web/questions.test.ts - 题目路由测试

import express, { Express } from 'express';
import request from 'supertest';
import questionsRoutes from '../../src/web/routes/questions';

describe('Questions Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/questions', questionsRoutes);
  });

  describe('GET /api/questions', () => {
    it('should return all questions', async () => {
      const res = await request(app)
        .get('/api/questions');

      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.dialogue_count).toBeGreaterThan(0);
      expect(res.body.coding_count).toBeGreaterThan(0);
    });

    it('should include dialogue questions', async () => {
      const res = await request(app)
        .get('/api/questions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.dialogue)).toBe(true);
      expect(res.body.dialogue.length).toBe(res.body.dialogue_count);

      // 检查题目结构
      const question = res.body.dialogue[0];
      expect(question.id).toBeDefined();
      expect(question.type).toBe('dialogue');
      expect(question.category).toBeDefined();
      expect(question.content).toBeDefined();
    });

    it('should include coding questions', async () => {
      const res = await request(app)
        .get('/api/questions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.coding)).toBe(true);
      expect(res.body.coding.length).toBe(res.body.coding_count);

      // 检查题目结构
      const question = res.body.coding[0];
      expect(question.id).toBeDefined();
      expect(question.type).toBe('coding');
      expect(question.category).toBeDefined();
      expect(question.content).toBeDefined();
      expect(question.test_cases).toBeDefined();
      expect(Array.isArray(question.test_cases)).toBe(true);
    });

    it('should have reference_answer for dialogue', async () => {
      const res = await request(app)
        .get('/api/questions');

      const dialogueWithRef = res.body.dialogue.find((q: any) => q.reference_answer);
      expect(dialogueWithRef).toBeDefined();
    });

    it('should have test_cases for coding', async () => {
      const res = await request(app)
        .get('/api/questions');

      const codingWithTests = res.body.coding.find((q: any) => q.test_cases && q.test_cases.length > 0);
      expect(codingWithTests).toBeDefined();
      expect(codingWithTests.test_cases[0].input).toBeDefined();
      expect(codingWithTests.test_cases[0].expected_output).toBeDefined();
    });

    it('should have weight for all questions', async () => {
      const res = await request(app)
        .get('/api/questions');

      for (const q of res.body.dialogue) {
        expect(q.weight).toBeDefined();
        expect(q.weight).toBeGreaterThan(0);
      }

      for (const q of res.body.coding) {
        expect(q.weight).toBeDefined();
        expect(q.weight).toBeGreaterThan(0);
      }
    });
  });
});
