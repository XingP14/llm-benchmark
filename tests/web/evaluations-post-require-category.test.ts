// tests/web/evaluations-post-require-category.test.ts
//
// 分支缺口: src/web/routes/evaluations.ts:110 的
//   if (!dialogue && !coding && !function_calling && !long_context && !multi_turn)
// 其 400 拒绝分支从未被执行过 —— tests/web/evaluations-post.test.ts 只覆盖了
// config_ids 的 3 个校验分支, 每个成功用例都至少打开一个 category 开关
// (dialogue:true / dialogue-only / coding-only)。该分支是唯一一个
// "config_ids 合法但所有评测类型都被关掉" 的入口, 它守卫着 taskManager.startTask
// 是否会被传入一个全 false 的 flags 组合, 若该 400 消失, 任务会被创建却什么都不跑。
//
// 本文件钉死:
//   1. 全部 5 个开关显式 false -> 400 + 精确错误串, 且不写入 evaluations 行
//   2. 开关字段完全省略时走默认值 (dialogue/coding=true) -> 200, 证明默认臂是活的
//   3. 逐一打开 fc / long_context / multi_turn 三个"默认关闭"的开关 -> 200,
//      证明只有"全 false"才被拒, 单开任一非默认开关都能建任务
//   4. 拒绝发生在 taskManager 之前 (400 响应体内不含 evaluation_id)

import express, { Express } from 'express';
import request from 'supertest';
import configsRoutes from '../../src/web/routes/configs';
import evaluationsRoutes from '../../src/web/routes/evaluations';
import authRoutes from '../../src/web/routes/auth';
import { resetDatabase, getDatabase, initAdminUser, resetSingleton } from '../../src/web/db/database';

// Mock the evaluator engine
jest.mock('../../src/web/engine/evaluator', () => {
  return {
    EvaluatorEngine: jest.fn().mockImplementation(() => ({
      run: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock websocket
jest.mock('../../src/web/websocket', () => ({
  getWSSender: jest.fn().mockReturnValue(() => {}),
}));

describe('POST /api/evaluations - category-flag validation', () => {
  let app: Express;
  let adminToken: string;
  let configId: number;

  beforeAll(() => {
    resetSingleton();
    initAdminUser();

    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/configs', configsRoutes);
    app.use('/api/evaluations', evaluationsRoutes);
  });

  beforeEach(async () => {
    resetDatabase();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    adminToken = loginRes.body.token;

    const configRes = await request(app)
      .post('/api/configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Category Model',
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        api_key: 'sk-test',
      });
    configId = configRes.body.id;
  });

  it('rejects when all five category flags are explicitly false', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        config_ids: [configId],
        dialogue: false,
        coding: false,
        function_calling: false,
        long_context: false,
        multi_turn: false,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('at least one of');
    // 拒绝发生在 taskManager.startTask 之前, 不得返回任务 id
    expect(res.body.evaluation_id).toBeUndefined();

    // 不得落库
    const row = getDatabase()
      .prepare('SELECT COUNT(*) AS c FROM evaluations')
      .get() as { c: number };
    expect(row.c).toBe(0);
  });

  it('accepts when the flag fields are omitted entirely (defaults open dialogue/coding)', async () => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ config_ids: [configId] });

    expect(res.status).toBe(200);
    expect(res.body.evaluation_id).toBeDefined();
    expect(res.body.status).toBe('PENDING');
  });

  it.each([
    ['function_calling', 'function_calling'],
    ['long_context', 'long_context'],
    ['multi_turn', 'multi_turn'],
  ])('accepts a run with only %s enabled', async (_label, flag) => {
    const res = await request(app)
      .post('/api/evaluations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        config_ids: [configId],
        dialogue: false,
        coding: false,
        [flag]: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.evaluation_id).toBeDefined();
  });
});
