// tests/r526-judge-is-the-subject.test.ts
//
// 2026-10-31 07:0x cron tick (rotation: llm-benchmark, after woclaw 22:03).
//
// PLANE: "the judge is the subject" -- an LLM-evaluation harness in which
// the SCORER and the SCORED are the same model, on the same wire protocol,
// and the only thing separating "the model answered" from "the model graded"
// is WHICH PROMPT was sent.
//
// The external leg (HN Algolia + GitHub, controls verified non-zero first)
// found this plane is REAL and mostly unbuilt in the agent-evaluation
// community, but the MECHANISMS are not new (R449-5/R454-4/R475-3
// discipline: do not report "greenfield" when prior art exists):
//
//   * arXiv:2606.15474 "Who Drifted: the System or the Judge?" -- an
//     LLM-as-judge is itself a model behind an API; a silent version bump
//     makes every drift alarm ambiguous between "the product regressed" and
//     "the judge changed". Its fix is an ANCHOR SET (fixed human-labelled
//     items the current judge re-scores at an interleave) + a one-way
//     attribution race. The industry default (rolling z-test at alpha=0.05
//     re-run at every step) false-alarms on 75% of drift-free streams.
//
//   * arXiv:2609.02246 "LLM-as-a-Judge Is Not an Oracle" -- an optimizer
//     hill-climbing on a judge DELETED the judge's rubric (replacing it with
//     a placeholder), the harness fell back to a default score of 3, and the
//     measured error against humans IMPROVED (0.96 -> 0.92) because a flat 3
//     sits closer to the human mean than scattered 4s and 5s. The selection
//     gate did exactly what it was built to do and promoted the gutted judge.
//
//   * arXiv:2610.28886 SANE -- scorer-specific metamorphic testing for LLM
//     judges; the score's response to a change affecting its criterion must
//     be the thing under test.
//
//   * The dev.to "Making LLM-as-Judge Scoring Reproducible" recipe: pin the
//     rubric, parse defensively (never trust raw JSON), temperature 0, a
//     DETERMINISTIC MOCK judge for tests, and a golden-case set to catch
//     judge drift.
//
// THIS FILE pins the llm-benchmark side of that plane. Every claim below was
// MEASURED (see _tmp/probe-r526-*.ts), not grepped:
//
// F1  The CLI entry builds ONE adapter from `config.models[0].type` and
//     hands it to the Evaluator, which reuses it for EVERY model. So
//     models[1..n-1] are evaluated with models[0]'s WIRE PROTOCOL.
//     MEASURED: a 2-model config (openai + anthropic) sent the anthropic
//     model to `https://api.anthropic.com/chat/completions` with an
//     OpenAI-shaped body `{model,messages,temperature,max_tokens}` and a
//     `Bearer` header -- while the Anthropic adapter would have sent
//     `https://api.anthropic.com/v1/messages` with
//     `{model,max_tokens,messages}` and an `x-api-key` header.
//
// F2  The judge is the subject. `Scorer` holds the SAME adapter and the
//     SAME ModelConfig that produced the answer, and grades with it.
//     MEASURED: one adapter instance serves both calls; the judge call
//     carries the same `model` id as the subject call.
//
// F3  The judge's reply is read by taking the FIRST number ANYWHERE in it.
//     MEASURED: "这道答案覆盖了 3 个要点，因此我给 85 分。" -> score 3;
//     "我先说明标准：100分表示完美。本题得 60 分。" -> score 100;
//     "根据评分标准，40-50分表示不太准确，我给 45 分。" -> score 40.
//     A judge that EXPLAINED itself scores itself on its own preamble.
//
// WHAT THIS FILE IS NOT: it does not assert that the current behaviour is
// wrong. F1 is a defect (the wire protocol of models[1..n-1] is decided by
// models[0]); F2/F3 are posture questions (a product decision: should a
// model grade itself?).
//
// What it DOES assert is the SHAPE, so that a future change in either
// direction is a DELIBERATE diff rather than an accident:
//   - the adapter is chosen from the FIRST model's type  (arm A)
//   - the judge shares the subject's adapter and model id (arm B)
//   - the score is the FIRST number in the reply (arm C)
//   - the ANTHROPIC wire shape is what the Anthropic adapter produces
//     (arm D -- the control that proves arm A is measuring routing and not
//     a broken fetch mock)
//
// Arms are written so each one FAILS if the shape moves, and arm D is the
// negative control: it must be GREEN on the unmutated tree, which is what
// makes arm A's RED meaningful rather than "the mock never worked".

import * as fs from 'fs';
import * as path from 'path';

import { Evaluator } from '../src/core/evaluator';
import { Scorer } from '../src/core/scorer';
import { createAdapter } from '../src/adapters/create-adapter';
import { LLMAdapter } from '../src/adapters/adapter';
import { BenchmarkConfig, BenchmarkQuestion, ModelConfig } from '../src/types';

const REPO_ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(REPO_ROOT, 'src', 'index.ts');
const SCORER_PATH = path.join(REPO_ROOT, 'src', 'core', 'scorer.ts');

type SeenRequest = {
  url: string;
  headers: Record<string, string>;
  bodyKeys: string[];
  body: string;
};

function installFetchRecorder(): { seen: SeenRequest[]; restore: () => void } {
  const seen: SeenRequest[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const bodyRaw = typeof init?.body === 'string' ? init.body : '';
    let bodyKeys: string[] = [];
    try {
      bodyKeys = Object.keys(JSON.parse(bodyRaw) as Record<string, unknown>);
    } catch {
      bodyKeys = ['<unparsed>'];
    }
    seen.push({ url: String(url), headers, bodyKeys, body: bodyRaw });
    // A reply that satisfies BOTH extractors: the OpenAI-shaped one
    // (choices[].message.content) AND the Anthropic-shaped one
    // (content[].text). The first version of this recorder returned only
    // the OpenAI shape, and the Anthropic negative control (arm D) then
    // failed with `Cannot read properties of undefined (reading 'find')` --
    // a MOCK defect, not a product defect. Fixing the mock, not the
    // assertion (R446-5: never widen an assertion until it goes green).
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'MODEL_OUTPUT' } }],
        content: [{ type: 'text', text: 'MODEL_OUTPUT' }],
      }),
    } as unknown as Response;
  }) as typeof fetch;
  return {
    seen,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const openaiModel: ModelConfig = {
  name: 'openai-model',
  type: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-openai',
  model: 'gpt-4',
};

const anthropicModel: ModelConfig = {
  name: 'anthropic-model',
  type: 'anthropic',
  endpoint: 'https://api.anthropic.com',
  apiKey: 'sk-anthropic',
  model: 'claude-3-haiku-20240307',
};

function makeConfig(models: ModelConfig[]): BenchmarkConfig {
  return {
    models,
    benchmarks: {
      dialogue: true,
      coding: false,
      function_calling: false,
      long_context: false,
      multi_turn: false,
    },
  } as unknown as BenchmarkConfig;
}

describe('R526 — the CLI entry chooses the wire protocol ONCE, from models[0]', () => {
  it('arm A: the second model is sent with the FIRST model\'s wire protocol', async () => {
    const { seen, restore } = installFetchRecorder();
    try {
      // EXACTLY what src/index.ts:58 does.
      const adapter = createAdapter([openaiModel, anthropicModel][0].type);
      const evaluator = new Evaluator(makeConfig([openaiModel, anthropicModel]), adapter);
      await evaluator.run();

      const anthropicRequests = seen.filter((r) => r.url.includes('api.anthropic.com'));
      expect(anthropicRequests.length).toBeGreaterThan(0);

      // The anthropic model WAS contacted -- so this is not a "the second
      // model was never evaluated" artefact.
      for (const req of anthropicRequests) {
        // ...but with the OPENAI wire shape, not the Anthropic one.
        expect(req.url).toBe('https://api.anthropic.com/chat/completions');
        expect(req.bodyKeys).toEqual(['model', 'messages', 'temperature', 'max_tokens']);
        expect(req.headers['Authorization']).toBeDefined();
        expect(req.headers['x-api-key']).toBeUndefined();
      }
    } finally {
      restore();
    }
  });

  it('arm D (negative control): the Anthropic adapter DOES produce the Anthropic wire shape', async () => {
    // Without this control, arm A could be green for the wrong reason --
    // e.g. if the fetch recorder were broken and every request looked
    // OpenAI-shaped. This arm must be GREEN on the unmutated tree.
    const { seen, restore } = installFetchRecorder();
    try {
      const adapter = createAdapter('anthropic');
      await adapter.chat([{ role: 'user', content: 'hi' }], anthropicModel);

      expect(seen.length).toBe(1);
      expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages');
      expect(seen[0].bodyKeys).toEqual(['model', 'max_tokens', 'messages']);
      expect(seen[0].headers['x-api-key']).toBe('sk-anthropic');
    } finally {
      restore();
    }
  });

  it('arm A2: the CLI entry reads the adapter type from models[0], and only models[0]', () => {
    // The source-level shape of arm A, so that the behaviour above and the
    // code that produces it cannot drift apart silently.
    const src = fs.readFileSync(INDEX_PATH, 'utf8');
    const adapterConstructions = src.match(/createAdapter\([^)]*\)/g) ?? [];
    expect(adapterConstructions.length).toBeGreaterThan(0);
    for (const construction of adapterConstructions) {
      expect(construction).toMatch(/models\[0\]\.type|config\.models\[0\]\.type/);
    }
  });
});

describe('R526 — the judge is the subject: same adapter, same model id', () => {
  it('arm B: one adapter instance serves both the subject call and the judge call', async () => {
    const calls: Array<{ content: string; model: string | undefined }> = [];
    const shared: LLMAdapter = {
      chat: async (messages: Array<{ role: string; content: string }>, config: ModelConfig) => {
        calls.push({ content: String(messages[0]?.content ?? ''), model: config?.model });
        return String(messages[0]?.content ?? '').includes('评分员') ? '85' : 'THE_MODEL_ANSWER';
      },
      ping: async () => true,
      getName: () => 'shared',
    } as unknown as LLMAdapter;

    const scorer = new Scorer(shared, { ...openaiModel } as ModelConfig);
    const question = {
      id: 'q1',
      content: '题目',
      category: 'c',
      type: 'dialogue',
      referenceAnswer: '答案',
    } as unknown as BenchmarkQuestion;

    const result = await scorer.scoreDialogue(question, 'THE_MODEL_ANSWER');

    expect(result.score).toBe(85);
    expect(calls.length).toBe(1);
    // The judge call carries the SAME model id as the subject's model, and
    // the judge prompt is the one the scorer built.
    expect(calls[0].model).toBe('gpt-4');
    expect(calls[0].content).toContain('评分员');
  });

  it('arm B2: there is no judge-model field anywhere in the scoring path', () => {
    // The absence is the finding. Scored as a NEGATIVE assertion over a
    // pinned subject set (R421-1): the subject set is the two files that
    // decide who grades, and both must exist -- otherwise the negative
    // assertion could go vacuously true by a file being renamed away.
    for (const p of [INDEX_PATH, SCORER_PATH]) {
      expect(fs.existsSync(p)).toBe(true);
    }
    const combined = fs.readFileSync(INDEX_PATH, 'utf8') + fs.readFileSync(SCORER_PATH, 'utf8');
    expect(combined).not.toMatch(/judgeModel|judge_model|scoringModel|scoring_model|graderModel/);
  });
});

describe('R526 — the score is the FIRST number in the judge reply', () => {
  const scorer = new Scorer(
    {
      chat: async () => 'unused',
      ping: async () => true,
      getName: () => 'unused',
    } as unknown as LLMAdapter,
    { name: 'm', type: 'openai', endpoint: '', apiKey: '' } as unknown as ModelConfig,
  );

  const question = {
    id: 'q1',
    content: '题目',
    category: 'c',
    type: 'dialogue',
    referenceAnswer: '答案',
  } as unknown as BenchmarkQuestion;

  async function scoreOfReply(reply: string): Promise<number> {
    const oneShot = new Scorer(
      {
        chat: async () => reply,
        ping: async () => true,
        getName: () => 'one-shot',
      } as unknown as LLMAdapter,
      { name: 'm', type: 'openai', endpoint: '', apiKey: '' } as unknown as ModelConfig,
    );
    const r = await oneShot.scoreDialogue(question, 'OUTPUT');
    return r.score;
  }

  it('arm C: a judge that explains itself is scored on its own preamble', async () => {
    // "3 个要点" -> 3, not 85.
    expect(await scoreOfReply('这道答案覆盖了 3 个要点，因此我给 85 分。')).toBe(3);
    // "100分表示完美" -> 100, not 60.
    expect(await scoreOfReply('我先说明标准：100分表示完美。本题得 60 分。')).toBe(100);
    // A rubric range in the reply -> the range's first number.
    expect(await scoreOfReply('根据评分标准，40-50分表示不太准确，我给 45 分。')).toBe(40);
  });

  it('arm C2: a bare number, and a reply with no number', async () => {
    expect(await scoreOfReply('85')).toBe(85);
    expect(await scoreOfReply('没有数字')).toBe(0);
    expect(await scoreOfReply('评分：85')).toBe(85);
  });

  it('arm C3: the parse is a first-match regex, not a JSON field read', () => {
    // The source-level shape of arm C, pinned so the behaviour and the code
    // that produces it cannot drift apart.
    const src = fs.readFileSync(SCORER_PATH, 'utf8');
    expect(src).toMatch(/text\.match\(\/\(\\d\+\(\?:\\\.\\d\+\)\?\)\//);
    // And there is NO json.parse of the judge reply anywhere in the scorer.
    expect(src).not.toMatch(/JSON\.parse\(scoreText\)/);
  });

  void scorer;
});
