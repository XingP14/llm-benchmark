// src/web/routes/evaluations.ts - 评测路由

import { Router, Response } from 'express';
import { getDatabase } from '../db/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { taskManager } from '../engine/task';
import { EvaluatorEngine } from '../engine/evaluator';
import { getWSSender } from '../websocket';

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
    engine.run(evaluationId, getWSSender()).catch(console.error);

    res.json({ evaluation_id: evaluationId, status: 'PENDING' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
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

    const dialogueAvg = dialogueScores.length > 0
      ? Math.round(dialogueScores.reduce((a, b) => a + b, 0) / dialogueScores.length)
      : 0;

    const codingAvg = codingScores.length > 0
      ? Math.round(codingScores.reduce((a, b) => a + b, 0) / codingScores.length)
      : 0;

    const fcAvg = fcScores.length > 0
      ? Math.round(fcScores.reduce((a, b) => a + b, 0) / fcScores.length)
      : 0;

    const lcAvg = lcScores.length > 0
      ? Math.round(lcScores.reduce((a, b) => a + b, 0) / lcScores.length)
      : 0;

    const mtAvg = mtScores.length > 0
      ? Math.round(mtScores.reduce((a, b) => a + b, 0) / mtScores.length)
      : 0;

    const allScores = [...dialogueScores, ...codingScores, ...fcScores, ...lcScores, ...mtScores];
    const totalAvg = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;

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
