// src/web/routes/questions.ts - 题目路由

import { Router, Request, Response } from 'express';
import { getAllDialogueBenchmarks } from '../../benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../../benchmarks/coding';

const router = Router();

// GET /api/questions
router.get('/', (_req: Request, res: Response) => {
  const dialogue = getAllDialogueBenchmarks().map(q => ({
    id: q.id,
    type: q.type,
    category: q.category,
    content: q.content,
    reference_answer: q.referenceAnswer,
    weight: q.weight,
  }));

  const coding = getAllCodeBenchmarks().map(q => ({
    id: q.id,
    type: q.type,
    category: q.category,
    content: q.content,
    test_cases: (q as any).testCases?.map((tc: any) => ({
      input: tc.input,
      expected_output: tc.expectedOutput,
      description: tc.description,
    })),
    weight: q.weight,
  }));

  res.json({
    total: dialogue.length + coding.length,
    dialogue_count: dialogue.length,
    coding_count: coding.length,
    dialogue,
    coding,
  });
});

export default router;
