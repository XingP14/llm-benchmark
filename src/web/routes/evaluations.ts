// src/web/routes/evaluations.ts - 评测路由

import { Router, Response } from 'express';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { taskManager } from '../engine/task';
import { EvaluatorEngine, logEvaluationError } from '../engine/evaluator';
import { getWSSender } from '../websocket';
import { errorMessage } from '../../errors';

// Row interfaces mirroring SQLite schemas (src/web/db/database.ts)
interface ConfigRow {
  id: number;
  name: string;
  type: string;
}

interface ResultRow {
  evaluation_id: string;
  config_id: number;
  question_id: string;
  question_type: 'dialogue' | 'coding' | 'function_calling' | 'long_context' | 'multi_turn';
  category: string;
  model_output: string | null;
  score: number | null;
  reference_answer: string | null;
}

interface EvaluationResultEntry {
  config: { id: number; name: string; type: string };
  total_score: number;
  dialogue_score: number;
  coding_score: number;
  function_calling_score: number;
  long_context_score: number;
  multi_turn_score: number;
  question_results: Array<{
    question_id: string;
    question_type: ResultRow['question_type'];
    category: string;
    model_output: string | null;
    score: number | null;
    reference_answer: string | null;
  }>;
}

// Pull numeric scores for a given question type; drops nulls (parallels the
// previous untyped behavior where null + number reduced to number via coercion).
function scoresOf(results: ResultRow[], type: ResultRow['question_type']): number[] {
  return results
    .filter(r => r.question_type === type)
    .map(r => r.score)
    .filter((s): s is number => s !== null);
}

// Average of a numeric score list, rounded to nearest integer (0 for empty list).
// Used by the 5 question-type fields (dialogue / coding / function_calling /
// long_context / multi_turn) + 1 totalAvg field on the per-config results
// block in /:id/results; all 6 call sites are byte-identical so the inline
// ternary + reduce/length + Math.round pattern was hoisted here (parallels
// woclaw f622f24 sendJsonError / 59753ba logEvaluationError / 845c4ba
// printBenchmarkSection 5-dim 漏更 cleanup). 07-07 01:23 cron: comment-only
// stale drift fix (5 → 6 call sites) — 6af9f47 mode; avgOf totalAvg call site
// at L207 was added at 2bb18e4 commit time but JSDoc claim was not refreshed
// (was: "5 question-type fields ... all 5 call sites"; is: 5 dim + 1 totalAvg
// = 6 calls). 0 functional code change.
function avgOf(scores: number[]): number {
  return scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
}

const router = Router();
router.use(authMiddleware);

const engine = new EvaluatorEngine();

// GET /api/evaluations - 获取评测历史
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const evals = db.prepare(`
    SELECT e.*, GROUP_CONCAT(c.name) as config_names
    FROM evaluations e
    LEFT JOIN evaluation_configs ec ON e.id = ec.evaluation_id
    LEFT JOIN configs c ON ec.config_id = c.id
    WHERE e.user_id = ?
    GROUP BY e.id
    ORDER BY e.created_at DESC
    LIMIT 50
  `).all(req.userId);
  res.json(evals);
});

// POST /api/evaluations - 触发新评测
router.post('/', async (req: AuthRequest, res: Response) => {
  const {
    config_ids,
    dialogue = true,
    coding = true,
    function_calling = false,
    long_context = false,
    multi_turn = false,
  } = req.body;

  if (!config_ids || !Array.isArray(config_ids) || config_ids.length === 0) {
    res.status(400).json({ error: 'config_ids required and must be non-empty array' });
    return;
  }

  if (!dialogue && !coding && !function_calling && !long_context && !multi_turn) {
    res.status(400).json({ error: 'at least one of dialogue/coding/function_calling/long_context/multi_turn must be true' });
    return;
  }

  try {
    const evaluationId = taskManager.startTask(
      req.userId!,
      config_ids,
      dialogue,
      coding,
      function_calling,
      long_context,
      multi_turn
    );

    const db = getDatabase();

    // 创建评测记录
    db.prepare(`
      INSERT INTO evaluations (id, user_id, status, include_dialogue, include_coding, include_function_calling, include_long_context, include_multi_turn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evaluationId,
      req.userId,
      'PENDING',
      dialogue ? 1 : 0,
      coding ? 1 : 0,
      function_calling ? 1 : 0,
      long_context ? 1 : 0,
      multi_turn ? 1 : 0
    );

    // 关联配置
    for (const configId of config_ids) {
      db.prepare('INSERT INTO evaluation_configs (evaluation_id, config_id) VALUES (?, ?)')
        .run(evaluationId, configId);
    }

    // 异步执行
    engine.run(evaluationId, getWSSender()).catch((err: unknown) => logEvaluationError('Engine run failed for evaluation ' + evaluationId + ':', err));

    res.json({ evaluation_id: evaluationId, status: 'PENDING' });
  } catch (err: unknown) {
    res.status(400).json({ error: errorMessage(err) });
  }
});

// GET /api/evaluations/:id - 获取评测详情
router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=? AND user_id=?')
    .get(req.params.id, req.userId);
  if (!evaluation) {
    res.status(404).json({ error: 'Evaluation not found' });
    return;
  }
  res.json(evaluation);
});

// GET /api/evaluations/:id/results - 获取评测结果
router.get('/:id/results', (req: AuthRequest, res: Response) => {
  const db = getDatabase();
  const evaluation = db.prepare('SELECT * FROM evaluations WHERE id=? AND user_id=?')
    .get(req.params.id, req.userId);

  if (!evaluation) {
    res.status(404).json({ error: 'Evaluation not found' });
    return;
  }

  // 获取关联的配置
  const configs = db.prepare(`
    SELECT c.id, c.name, c.type
    FROM configs c
    JOIN evaluation_configs ec ON c.id = ec.config_id
    WHERE ec.evaluation_id = ?
  `).all(req.params.id) as ConfigRow[];

  const results: EvaluationResultEntry[] = [];

  for (const config of configs) {
    const configResults = db.prepare('SELECT * FROM results WHERE evaluation_id=? AND config_id=?')
      .all(req.params.id, config.id) as ResultRow[];

    const dialogueScores = scoresOf(configResults, 'dialogue');

    const codingScores = scoresOf(configResults, 'coding');

    const fcScores = scoresOf(configResults, 'function_calling');

    const lcScores = scoresOf(configResults, 'long_context');

    const mtScores = scoresOf(configResults, 'multi_turn');

    const dialogueAvg = avgOf(dialogueScores);
    const codingAvg = avgOf(codingScores);
    const fcAvg = avgOf(fcScores);
    const lcAvg = avgOf(lcScores);
    const mtAvg = avgOf(mtScores);

    const allScores = [...dialogueScores, ...codingScores, ...fcScores, ...lcScores, ...mtScores];
    const totalAvg = avgOf(allScores);

    results.push({
      config: { id: config.id, name: config.name, type: config.type },
      total_score: totalAvg,
      dialogue_score: dialogueAvg,
      coding_score: codingAvg,
      function_calling_score: fcAvg,
      long_context_score: lcAvg,
      multi_turn_score: mtAvg,
      question_results: configResults.map(r => ({
        question_id: r.question_id,
        question_type: r.question_type,
        category: r.category,
        model_output: r.model_output,
        score: r.score,
        reference_answer: r.reference_answer,
      })),
    });
  }

  // 按总分排序
  results.sort((a, b) => b.total_score - a.total_score);

  // 添加排名
  const rankedResults = results.map((r, i) => ({
    rank: i + 1,
    ...r,
  }));

  res.json({
    evaluation,
    results: rankedResults,
  });
});

export default router;
