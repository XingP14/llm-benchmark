// src/web/routes/questions.ts - 题目路由

import { Router, Request, Response } from 'express';
import { getAllDialogueBenchmarks } from '../../benchmarks/dialogue';
import { getAllCodeBenchmarks } from '../../benchmarks/coding';
import { getAllFunctionCallingBenchmarks } from '../../benchmarks/function-calling';
import { getAllLongContextBenchmarks } from '../../benchmarks/long-context';
import { getAllMultiTurnBenchmarks } from '../../benchmarks/multi-turn';

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

  const functionCalling = getAllFunctionCallingBenchmarks().map(q => ({
    id: q.id,
    type: q.type,
    category: q.category,
    content: q.content,
    available_tools: (q as any).availableTools,
    expected_tool_call: (q as any).expectedToolCall,
    weight: q.weight,
  }));

  const longContext = getAllLongContextBenchmarks().map(q => ({
    id: q.id,
    type: q.type,
    category: q.category,
    content: q.content,
    context_tokens: (q as any).contextTokens,
    key_facts: (q as any).keyFacts,
    weight: q.weight,
  }));

  const multiTurn = getAllMultiTurnBenchmarks().map(q => ({
    id: q.id,
    type: q.type,
    category: q.category,
    content: q.content,
    turns: (q as any).turns,
    consistency_check: (q as any).consistencyCheck,
    weight: q.weight,
  }));

  res.json({
    total: dialogue.length + coding.length + functionCalling.length + longContext.length + multiTurn.length,
    dialogue_count: dialogue.length,
    coding_count: coding.length,
    function_calling_count: functionCalling.length,
    long_context_count: longContext.length,
    multi_turn_count: multiTurn.length,
    dialogue,
    coding,
    function_calling: functionCalling,
    long_context: longContext,
    multi_turn: multiTurn,
  });
});

export default router;
