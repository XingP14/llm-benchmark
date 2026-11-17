/**
 * R548 -- the completion-metadata plane: the harness throws away the
 * response ENVELOPE and keeps only the text.
 *
 * R519 / R522 / R524 / R526 / R528 / R531 / R532 / R533 / R535 / R537 / R539 /
 * R546 audited the per-dimension SCORERS, the external-benchmark channel,
 * the judge-is-the-subject posture, the failure channel and the published
 * STATISTIC.  R548 steps down to the layer UNDERNEATH all of them: the
 * adapter, i.e. the boundary where a provider's response envelope is turned
 * into the `string` that every scorer then judges.
 *
 * ROUND NUMBER: R548 is free in the GLOBAL, MONOTONIC namespace shared by
 * both repositories (R535 lb -> R536 wc -> ... -> R546 lb -> R547 wc).  The
 * two `R548` entries in LEARNING_PLAN.md are CANDIDATES for future rounds
 * (547.20 / 547.21), not consumed round numbers.  This round's subject --
 * the llm-benchmark adapter envelope -- is distinct from both of them.
 *
 * WHAT WAS MEASURED (through the REAL production classes -- the real
 * `OpenAIAdapter`, the real `AnthropicAdapter`, the real `Scorer`; nothing
 * re-implements the parsing, the scoring or the extraction):
 *
 *   F1  THE ADAPTER DISCARDS THE ENVELOPE; ONLY THE TEXT SURVIVES.
 *       `LLMAdapter.chat()` returns `Promise<string>`.  The provider's
 *       response object carries `id`, `model`, `finish_reason`, `usage`,
 *       `tool_calls` -- and the adapter extracts `choices[0].message.content`
 *       and throws the rest of the object away.  There is no field on
 *       `QuestionScore` that could hold it either.
 *       MEASURED: the outbound request body carries exactly
 *       `model, messages, temperature, max_tokens` and the inbound envelope
 *       is reduced to a bare string.
 *
 *   F2  `finish_reason: 'length'` IS INDISTINGUISHABLE FROM A COMPLETE
 *       ANSWER.  A response truncated at the token cap and a response that
 *       stopped normally produce the SAME adapter output, the SAME score and
 *       the SAME `detail` -- the report publishes no trace of the truncation.
 *       MEASURED: complete -> `"Paris"`, truncated -> `"Paris"`, byte-identical.
 *
 *   F3  A NATIVE `tool_calls` PAYLOAD IS DROPPED, AND THE SCORE INVERTS.
 *       This is the sharpest arm.  When a model actually calls a tool, OpenAI
 *       returns `choices[0].message.content = null` plus
 *       `message.tool_calls[]`.  The adapter extracts `content`, which is
 *       null -> `''`.  The scorer's `extractToolCall` then finds no JSON and
 *       reports "未检测到 tool_call" -> score 0.  The SAME call, hand-typed
 *       as JSON inside the TEXT, scores 100.
 *       MEASURED: native tool_call -> 0 ("未检测到 tool_call");
 *       byte-identical payload as JSON-in-text -> 100 ("name=✓; args=✓ full").
 *       A benchmark harness that scores the WIRE FORMAT rather than the
 *       CONTENT rewards a model that hallucinates JSON text over a model
 *       that correctly used the API.
 *
 *   F4  THE SAME HOLE EXISTS ON THE ANTHROPIC WIRE, WITH A DIFFERENT FIELD
 *       NAME.  `stop_reason: 'max_tokens'` + `usage.output_tokens` are
 *       dropped exactly like OpenAI's `finish_reason` + `usage`.
 *       MEASURED: the adapter returned `"Paris"` from a response whose
 *       envelope said `stop_reason: 'max_tokens'`.
 *
 *   F5  THERE IS NO TOKEN / COST ACCOUNTING SURFACE ANYWHERE.  A census of
 *       the LIVE code of all 33 files under `src/` (comments stripped, so
 *       prose documenting the gap cannot inflate the count) finds ZERO
 *       files containing `usage`, `prompt_tokens`, `completion_tokens`,
 *       `total_tokens`, `finish_reason` or `stop_reason`.  The harness
 *       measures model QUALITY and never model COST.
 *
 * WHY THIS IS A MIGRATION GAP, NOT GREENFIELD
 *
 * The mechanism -- "the completion envelope carries the facts that decide
 * whether an answer is usable" -- is solved in adjacent work:
 *   * lm-evaluation-harness (EleutherAI/lm-evaluation-harness,
 *     `lm_eval/models/api_models.py`) ships a dedicated
 *     `LMEVAL_MODEL_NONE_ANSWER_PLACEHOLDER` for exactly this failure: "the
 *     model runs out of tokens during the thinking process and returns an
 *     empty answer but no error".  It substitutes a MARKER so the empty
 *     answer cannot be mistaken for a real one.
 *   * Its truncation handling is a first-class concern across the repo
 *     (issue #3382 "Truncation before think_end_token causes incomplete
 *     reasoning to be parsed as the final response"; #3044 "Reasoning models
 *     and token limits"; #4496 token-budget alias resolution).
 *   * OpenAI's own chat-completions schema documents `usage` as a first-class
 *     response field (`prompt_tokens`, `completion_tokens`, `total_tokens`),
 *     and Anthropic's Messages API documents `stop_reason` with
 *     `max_tokens` as a distinct terminal reason.
 * So the mechanism is mature; THIS harness implements the pre-abstraction
 * version, where the envelope is dropped at the boundary.
 *
 * WHAT THIS SUITE DOES AND DOES NOT DO
 *
 * Ships: a test-only suite that PINS the observed (defective) behaviour, so
 * that when a repair is decided, each candidate arm turns RED and the
 * decision stays visible.
 *
 * Does NOT ship: any production change.  Every repair is a product decision:
 *   - should `LLMAdapter.chat()` return an envelope (`{text, finishReason,
 *     usage, toolCalls}`) instead of a bare `string`, and what is the
 *     migration cost for the 6 adapters + 2 call paths + every scorer?
 *   - should a `finish_reason: 'length'` answer be scored, or FLAGGED (and
 *     what flag -- a separate score bucket, or a `QuestionScore` field)?
 *   - should a native `tool_calls` payload be parsed by the adapter (so the
 *     scorer sees the same JSON it accepts today), or should the scorer be
 *     taught the native shape (and then the JSON-in-text path become a
 *     fallback rather than the ONLY path)?
 *   - should token usage be collected and published (and if so, per model,
 *     per question, and as a cost estimate)?
 * All four are father-gated.  This round delivers THE MEASUREMENT ONLY.
 *
 * METHOD NOTES
 *
 * - **R548-1 the subject is the PRODUCTION adapter, not a copy.**  Arms
 *   drive the real `OpenAIAdapter.chat()` / `AnthropicAdapter.chat()` /
 *   `Scorer.scoreFunctionCalling()` with `globalThis.fetch` stubbed at the
 *   module boundary.  A probe that re-implemented the extraction would
 *   measure its own copy (the R496/R506/R511 failure mode).
 * - **R548-2 assert the INVERSION, not the equality.**  The sharp claim is
 *   not "native != text" but "native scores 0 AND text scores 100".  An
 *   ordering assertion survives a future change that lowers both.
 * - **R548-3 the census must strip COMMENTS.**  A grep that counts
 *   `finish_reason` in a file whose only mention is a JSDoc paragraph
 *   documenting the gap would report a false positive.  The census strips
 *   block and line comments first, and an arm asserts the stripper works.
 * - **R548-4 the defect is PINNED, in this repo's house style.**  Every arm
 *   asserts the OBSERVED (defective) behaviour and is GREEN on the defective
 *   tree; a REPAIR flips the corresponding arm RED, and the mutation matrix
 *   reads that flip as the kill.  This is the convention the sibling rounds
 *   use (R535 / R537 / R539 / R546 all pin the defect in the green state),
 *   and it is the only shape this repository can carry: `npm test` runs the
 *   WHOLE jest suite, so a suite that is RED on the defective tree turns the
 *   repository's CI RED -- the defect detector would BREAK the release
 *   gate.  A CI gate and a defect detector are different instruments.
 *   (`it.failing` was measured as an alternative: jest reports an
 *   `it.failing` arm whose body fails as `passed`, and the arm whose body
 *   PASSES as `failed` with "Failing test passed even though it was
 *   supposed to fail".  That INVERTS the polarity, so the driver can no
 *   longer read a defect-presence arm and a defect-absence arm off the same
 *   status field -- one of the two would have to be special-cased on jest's
 *   own message text.  The house style needs no such special case.)
 * - **R548-5 the family, not the adapter.**  FIVE OpenAI-compatible adapters
 *   (openai / qwen / deepseek / glm / ollama) funnel their response through
 *   the SAME shared helper `extractOpenAIChatContent` in
 *   `src/adapters/adapter.ts`, so the envelope is dropped at exactly ONE
 *   place; the Anthropic adapter has its own inline copy of the same shape.
 *   A one-adapter fix would leave four of them still dropping it, so the
 *   family is measured explicitly by ARM F.
 */
import * as fs from 'fs';
import * as path from 'path';

import { OpenAIAdapter } from '../src/adapters/openai-adapter';
import { QwenAdapter } from '../src/adapters/qwen-adapter';
import { DeepSeekAdapter } from '../src/adapters/deepseek-adapter';
import { GLMAdapter } from '../src/adapters/glm-adapter';
import { OllamaAdapter } from '../src/adapters/ollama-adapter';
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';
import { Scorer } from '../src/core/scorer';
import type { LLMAdapter } from '../src/adapters/adapter';
import type { BenchmarkQuestion, ModelConfig } from '../src/types';

const REPO_ROOT = path.join(__dirname, '..');

const cfg = (over: Partial<ModelConfig> = {}): ModelConfig => ({
  name: 'probe-model',
  type: 'openai',
  endpoint: 'https://api.openai.com/v1',
  apiKey: 'sk-probe',
  model: 'gpt-4o-mini',
  ...over,
});

/** A response envelope as OpenAI actually returns it. */
const openAIEnvelope = (over: Record<string, unknown> = {}) => ({
  id: 'chatcmpl-probe',
  object: 'chat.completion',
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: 'Paris' },
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  ...over,
});

/** The SAME answer, truncated at the token cap. */
const openAITruncatedEnvelope = () =>
  openAIEnvelope({
    id: 'chatcmpl-probe-trunc',
    choices: [
      {
        index: 0,
        finish_reason: 'length',
        message: { role: 'assistant', content: 'Paris' },
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 4096, total_tokens: 4108 },
  });

/** A native tool call, exactly as OpenAI returns it. */
const openAIToolCallEnvelope = () =>
  openAIEnvelope({
    id: 'chatcmpl-probe-tool',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42 },
  });

function stubFetch(payload: unknown) {
  (globalThis as any).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('R548 -- the completion-metadata plane (defective tree)', () => {
  /**
   * ARM A (pins the defect -> GREEN on the defective tree).
   * A truncated answer IS indistinguishable from a complete one.
   * A REPAIR flips this arm RED.
   */
  it('A: a finish_reason:"length" answer is indistinguishable from a complete answer', async () => {
    const adapter = new OpenAIAdapter();

    stubFetch(openAIEnvelope());
    const complete = await adapter.chat(
      [{ role: 'user', content: 'Capital of France?' }],
      cfg()
    );

    stubFetch(openAITruncatedEnvelope());
    const truncated = await adapter.chat(
      [{ role: 'user', content: 'Capital of France?' }],
      cfg()
    );

    // The DEFECT, pinned: the two are byte-identical.
    // The REQUIREMENT (a repair): they must differ.
    expect(complete).toEqual(truncated);
    expect(complete).toBe('Paris');
  });

  /**
   * ARM A2 (pins the defect -> GREEN on the defective tree).
   * The truncation leaves NO trace in what the SCORER publishes -- the
   * published record for a truncated answer is BYTE-IDENTICAL to the record
   * for a complete one.
   * A REPAIR that carries `finish_reason` flips this arm RED.
   */
  it('A2: a truncated answer leaves no trace in the published score detail', async () => {
    const adapter = new OpenAIAdapter();
    const scorer = new Scorer(adapter, cfg());
    const question: BenchmarkQuestion = {
      id: 'q-trunc',
      category: 'test',
      content: 'Capital of France?',
      weight: 1,
      type: 'dialogue',
    };

    // The TRUNCATED answer, scored through the REAL scorer.
    stubFetch(openAITruncatedEnvelope());
    const truncatedText = await adapter.chat(
      [{ role: 'user', content: 'Capital of France?' }],
      cfg()
    );
    const truncatedScore = await scorer.scoreDialogue(question, truncatedText);

    // The COMPLETE answer, scored the same way.
    stubFetch(openAIEnvelope());
    const completeText = await adapter.chat(
      [{ role: 'user', content: 'Capital of France?' }],
      cfg()
    );
    const completeScore = await scorer.scoreDialogue(question, completeText);

    const truncatedPublished = `${truncatedScore.modelOutput ?? ''} ${truncatedScore.detail ?? ''}`;
    const completePublished = `${completeScore.modelOutput ?? ''} ${completeScore.detail ?? ''}`;

    // The DEFECT, pinned: the published record says NOTHING about the cut,
    // and the truncated record is byte-identical to the complete one.
    expect(truncatedPublished).not.toMatch(/truncat|finish_reason|length|max_token/i);
    expect(truncatedPublished).toBe(completePublished);
  });

  /**
   * ARM A3 (pins the defect -> GREEN on the defective tree).
   * The harness CANNOT see a native tool call.
   * A REPAIR that carries `tool_calls` flips this arm RED.
   *
   * NOTE: the pin is the INVISIBILITY of the tool call, NOT the emptiness of
   * the string.  Pinning emptiness would be a stricter claim than the
   * defect: a PARTIAL repair that carries `finish_reason` (and therefore
   * returns a non-empty string) but still drops `tool_calls` is exactly the
   * arm that must stay GREEN here -- that is what proves A2 and A3 are not
   * the same arm.  The matrix caught this over-tight pin (M4 flipped A3
   * RED when A3 was supposed to stay GREEN).
   */
  it('A3: a native tool_calls payload is invisible to the scorer', async () => {
    const adapter = new OpenAIAdapter();
    stubFetch(openAIToolCallEnvelope());

    const text = await adapter.chat(
      [{ role: 'user', content: 'Weather in Paris?' }],
      cfg()
    );

    // The DEFECT, pinned: the tool call does NOT survive the boundary.
    expect(text).not.toMatch(/get_weather/);
  });

  /**
   * ARM B (pins the defect -> GREEN on the defective tree).
   * The outbound request carries exactly the 4 body fields -- i.e. the
   * adapter speaks a request/response contract with no metadata channel.
   */
  it('B: the outbound body carries only model/messages/temperature/max_tokens', async () => {
    const fetchSpy = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => openAIEnvelope(),
      text: async () => '',
    }));
    (globalThis as any).fetch = fetchSpy;

    const adapter = new OpenAIAdapter();
    await adapter.chat([{ role: 'user', content: 'Hi' }], cfg());

    const body = JSON.parse((fetchSpy.mock.calls[0] as any)[1].body);
    expect(Object.keys(body).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'temperature',
    ]);
    // The adapter's contract is a bare string -- there is no envelope field.
    expect(typeof (await adapter.chat([{ role: 'user', content: 'Hi' }], cfg()))).toBe(
      'string'
    );
  });

  /**
   * ARM C (pins the defect -> GREEN on the defective tree).
   * The sharpest measurement: the SAME tool call scores 0 natively and 100
   * when hand-typed as JSON inside the text.
   */
  it('C: a native tool_call scores 0 while the identical JSON-in-text scores 100', async () => {
    const adapter = new OpenAIAdapter();

    const fcQuestion = {
      id: 'fc-basic-001',
      category: 'function_calling',
      content: '北京今天天气怎么样？',
      weight: 1,
      type: 'function_calling',
      availableTools: [
        {
          name: 'get_weather',
          description: 'Get the weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
      expectedToolCall: { name: 'get_weather', arguments: { city: 'Paris' } },
    } as unknown as BenchmarkQuestion;

    // The native path: the provider returns a tool_calls envelope.
    stubFetch(openAIToolCallEnvelope());
    const nativeText = await adapter.chat(
      [{ role: 'user', content: 'Weather in Paris?' }],
      cfg()
    );
    const scorer = new Scorer(adapter, cfg());
    const nativeScore = await scorer.scoreFunctionCalling(fcQuestion, nativeText);

    // The control: the SAME call, JSON inside the text.
    const textScore = await scorer.scoreFunctionCalling(
      fcQuestion,
      JSON.stringify({ name: 'get_weather', arguments: { city: 'Paris' } })
    );

    // The DEFECT, asserted as an ORDERING (not a mere inequality).
    expect(nativeScore.score).toBe(0);
    expect(textScore.score).toBe(100);
    expect(nativeScore.score).toBeLessThan(textScore.score);
    expect(nativeScore.detail).toMatch(/未检测到 tool_call/);
  });

  /**
   * ARM D (pins the defect -> GREEN on the defective tree).
   * The Anthropic wire drops `stop_reason` + `usage` the same way.
   */
  it('D: the Anthropic wire drops stop_reason and usage the same way', async () => {
    stubFetch({
      id: 'msg_probe',
      type: 'message',
      role: 'assistant',
      model: 'claude-3-haiku-20240307',
      stop_reason: 'max_tokens',
      stop_sequence: null,
      content: [{ type: 'text', text: 'Paris' }],
      usage: { input_tokens: 12, output_tokens: 2048 },
    });

    const adapter = new AnthropicAdapter();
    const text = await adapter.chat(
      [{ role: 'user', content: 'Capital of France?' }],
      cfg({ type: 'anthropic', endpoint: 'https://api.anthropic.com' })
    );

    // The DEFECT: `stop_reason: 'max_tokens'` leaves no trace.
    expect(text).toBe('Paris');
    expect(text).not.toMatch(/max_tokens|stop_reason/i);
  });

  /**
   * ARM E (pins the defect -> GREEN on the defective tree).
   * The census: NO live code anywhere in src/ reads the envelope metadata.
   */
  it('E: no live code in src/ reads usage/finish_reason/stop_reason', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(path.join(REPO_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(20);

    const stripComments = (text: string): string =>
      text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // The stripper must actually work, or the census below is vacuous.
    const commentOnly = '/** usage finish_reason */\n// stop_reason\nconst x = 1;\n';
    expect(stripComments(commentOnly)).not.toMatch(/usage|finish_reason|stop_reason/);

    const needles = [
      'usage',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'finish_reason',
      'stop_reason',
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const live = stripComments(fs.readFileSync(file, 'utf8'));
      for (const needle of needles) {
        if (live.includes(needle)) offenders.push(`${path.relative(REPO_ROOT, file)}:${needle}`);
      }
    }

    // The DEFECT: zero live readers.
    expect(offenders).toEqual([]);
  });

  /**
   * ARM F (pins the defect -> GREEN on the defective tree).
   * THE FAMILY: the five OpenAI-compatible adapters drop the envelope at ONE
   * shared boundary, so they behave IDENTICALLY -- and a one-adapter repair
   * (which is what the envelope repair would be if it were written per
   * adapter) breaks that agreement and leaves four of them still dropping it.
   *
   * The pin is therefore TWO claims: (1) the five return the SAME string for
   * the same envelope, and (2) that string carries no trace of the native
   * tool call.  Claim (1) is what makes the arm about the FAMILY rather
   * than about one adapter.
   */
  it('F: the drop is a FAMILY -- all five OpenAI-compatible adapters lose the envelope', async () => {
    const adapters: Array<[string, LLMAdapter, ModelConfig]> = [
      ['openai', new OpenAIAdapter(), cfg()],
      [
        'qwen',
        new QwenAdapter(),
        cfg({ type: 'qwen', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }),
      ],
      [
        'deepseek',
        new DeepSeekAdapter(),
        cfg({ type: 'deepseek', endpoint: 'https://api.deepseek.com/v1' }),
      ],
      [
        'glm',
        new GLMAdapter(),
        cfg({ type: 'glm', endpoint: 'https://open.bigmodel.cn/api/paas/v4' }),
      ],
      ['ollama', new OllamaAdapter(), cfg({ type: 'ollama', endpoint: 'http://localhost:11434' })],
    ];

    const results: Array<[string, string]> = [];
    for (const [name, adapter, modelCfg] of adapters) {
      stubFetch(openAIToolCallEnvelope());
      const text = await adapter.chat(
        [{ role: 'user', content: 'Weather in Paris?' }],
        modelCfg
      );
      results.push([name, text]);
    }

    const distinct = new Set(results.map(([, t]) => t));

    // The DEFECT, pinned: the family agrees on the SAME string, and that
    // string carries no trace of the native tool call.
    expect(distinct.size).toBe(1);
    for (const [, text] of results) {
      expect(text).not.toMatch(/get_weather/);
    }
  });
});
