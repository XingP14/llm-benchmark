// tests/scorer-defaults-and-observability-gate.test.ts
//
// Coverage gap closure for src/core/scorer.ts (2026-10-01 00:03 cron tick).
// Fresh full-repo run at HEAD cc52111: 83 suites / 997 tests, branches 406/439,
// scorer.ts is the darkest file at 18/131. These 13 arms had ZERO execution
// and every one of them changes a *score* or *log* verdict, not a cosmetic
// formatting value:
//
//   A. log-gate (L30/L32) — `process.env.NODE_ENV !== 'test' &&
//      !process.env.JEST_WORKER_ID`. Under jest NODE_ENV==='test' always
//      short-circuits the &&, so the documented backstop ("stay quiet when
//      NODE_ENV is not test but we are inside a jest worker") never
//      evaluated. A regression deleting the JEST_WORKER_ID operand would
//      print to console.error in every jest run and no test would fail.
//   B. tool_call name defaults (L172/L192/L356) — an OpenAI tool_calls
//      envelope whose `function` carries no `name`. String(fn.name || '')
//      and `actualName || '(none)'` both fall to their empty-string arms.
//   C. expectedToolCall without `arguments` (L175) — matchArgs' empty-expected
//      early return, so a question that declares no arguments at all must
//      score 100 on a name match, not 40.
//   D. consistencyCheck with missing required/forbidden arrays (L288/L289)
//      and an empty model output (L291). An MT question that ships only
//      `forbidden` is a real fixture shape in multi-turn.ts.
//   E. extractToolCall('') (L340) — the no-text guard behind the
//      "未检测到 tool_call" verdict.
//   F. valueMatches array normalisation (L412) — expected/actual arrays
//      holding NUMBERS. norm() has a typeof-string fast path and a
//      JSON.stringify fallback; every existing FC fixture uses string
//      arrays, so the fallback never ran and `[1,2]` vs `['1','2']` has
//      never been compared.
//   G. extractPythonCode fences (L517/L520/L523) — ```py fences and
//      ```js fences without a `def`, the two shapes checkSyntax and
//      evaluateCodeQuality both branch on.

import { Scorer } from '../src/core/scorer';
import { BenchmarkQuestion, ModelConfig } from '../src/types';
import { LLMAdapter } from '../src/adapters/adapter';

function makeAdapter(reply: string = '85'): LLMAdapter {
  return {
    chat: jest.fn(async () => reply),
    ping: jest.fn(async () => true),
    getName: () => 'mock',
  };
}

const baseConfig: ModelConfig = {
  name: 'test-model',
  endpoint: 'http://localhost',
  apiKey: 'test-key',
  type: 'openai',
};

// ---------------------------------------------------------------------------
// A. log-gate (L30 / L32) — re-import the module with the gate disarmed
// ---------------------------------------------------------------------------

describe('Scorer log-gate (L30/L32)', () => {
  const realNodeEnv = process.env.NODE_ENV;
  const realWorkerId = process.env.JEST_WORKER_ID;

  afterEach(() => {
    if (realNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = realNodeEnv;
    if (realWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = realWorkerId;
    jest.resetModules();
  });

  it('stays quiet when NODE_ENV is not test but we are inside a jest worker', () => {
    process.env.NODE_ENV = 'development';
    process.env.JEST_WORKER_ID = '1';
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let ScorerInGate: typeof Scorer;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ScorerInGate = require('../src/core/scorer').Scorer;
    });
    const gated = new ScorerInGate!(makeAdapter(), baseConfig);
    const q = {
      id: 'gate-1',
      category: 'c',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      get expectedToolCall(): never {
        throw new Error('boom');
      },
    } as unknown as BenchmarkQuestion;
    // The catch is reached, but shouldLog === false -> nothing is printed.
    return gated.scoreFunctionCalling(q, 'any output').then((res: { score: number }) => {
      expect(res.score).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('logs when neither NODE_ENV=test nor a jest worker is present', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let ScorerInGate: typeof Scorer;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ScorerInGate = require('../src/core/scorer').Scorer;
    });
    const gated = new ScorerInGate!(makeAdapter(), baseConfig);
    const q = {
      id: 'gate-2',
      category: 'c',
      content: 'x',
      weight: 1,
      type: 'multi_turn',
      get consistencyCheck(): never {
        throw new Error('gate boom');
      },
    } as unknown as BenchmarkQuestion;
    return gated.scoreMultiTurn(q, 'any output').then((res: { score: number }) => {
      expect(res.score).toBe(0);
      expect(spy).toHaveBeenCalled();
      expect(String(spy.mock.calls[0][0])).toContain('MT 评分失败');
    });
  });
});

// ---------------------------------------------------------------------------
// B. tool_call envelope with no function name (L356 / L172 / L192)
// ---------------------------------------------------------------------------

describe('Scorer tool_call with a nameless function (L356/L172/L192)', () => {
  it('extracts an empty name and reports got=(none)', async () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    const call = scorer.extractToolCall(
      '{"tool_calls":[{"function":{"arguments":"{\\"city\\":\\"北京\\"}"}}]}'
    );
    expect(call).not.toBeNull();
    expect(call.name).toBe('');
    expect(call.arguments).toEqual({ city: '北京' });
  });

  it('scores 0 and prints (none) when the expected name never appears', async () => {
    const q = {
      id: 'fc-noname',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'get_weather', arguments: { city: '北京' } },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const out = '{"tool_calls":[{"function":{"arguments":"{\\"city\\":\\"北京\\"}"}}]}';
    const res = await scorer.scoreFunctionCalling(q, out);
    expect(res.score).toBe(0);
    expect(res.detail).toContain('name=✗');
    expect(res.detail).toContain('got=(none)');
  });

  it('matchArgs still runs against the {} substituted for missing arguments', async () => {
    const q = {
      id: 'fc-noname-args',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'get_weather', arguments: { city: '北京' } },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    // A tool_calls envelope with a name but NO arguments at all: `args || {}`
    // substitutes an empty object, so matchArgs must still run (and score
    // 0/1) rather than short-circuiting the whole verdict.
    const out = '{"tool_calls":[{"function":{"name":"get_weather"}}]}';
    const res = await scorer.scoreFunctionCalling(q, out);
    // nameMatch && !full && !partial -> the 40 "name only" arm.
    expect(res.score).toBe(40);
    expect(res.detail).toContain('name=✓');
    expect(res.detail).toContain('args=✗');
    expect(res.detail).toContain('(0/1)');
  });
});

// ---------------------------------------------------------------------------
// C. expectedToolCall with no arguments key (L175)
// ---------------------------------------------------------------------------

describe('Scorer expectedToolCall without arguments (L175)', () => {
  it('scores 100 on a name-only match when expected declares no arguments', async () => {
    const q = {
      id: 'fc-noargs',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'ping' },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreFunctionCalling(q, '{"name":"ping","arguments":{}}');
    // matchArgs early-returns {full:true,partial:true,matched:0,total:0}
    expect(res.score).toBe(100);
    expect(res.detail).toContain('args=✓ full');
    expect(res.detail).toContain('(0/0)');
  });
});

// ---------------------------------------------------------------------------
// D. consistencyCheck defaults (L288 / L289 / L291)
// ---------------------------------------------------------------------------

describe('Scorer scoreMultiTurn partial consistencyCheck (L288/L289/L291)', () => {
  const mk = (check: unknown): BenchmarkQuestion =>
    ({
      id: 'mt-def',
      category: '多轮一致性',
      content: 'x',
      weight: 1,
      type: 'multi_turn',
      consistencyCheck: check,
    } as any);

  it('treats a missing required array as "nothing required" (score 100 minus forbidden)', async () => {
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreMultiTurn(mk({ forbidden: ['退款'] }), '可以退款');
    expect(res.score).toBe(80);
    expect(res.detail).toContain('required 0/0 [none]');
    expect(res.detail).toContain('forbidden hit: 1 [退款]');
  });

  it('treats a missing forbidden array as "nothing forbidden" (missed required only)', async () => {
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreMultiTurn(mk({ required: ['退款', '工作日'] }), '支持退款');
    expect(res.score).toBe(50);
    expect(res.detail).toContain('required 1/2 [退款]');
    expect(res.detail).toContain('missed: [工作日]');
    expect(res.detail).toContain('forbidden hit: 0 [none]');
  });

  it('an empty model output misses every required keyword without throwing', async () => {
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreMultiTurn(mk({ required: ['退款'] }), '');
    expect(res.score).toBe(0);
    expect(res.detail).toContain('required 0/1 [none]');
    expect(res.detail).toContain('missed: [退款]');
  });

  it('an empty model output with empty required still scores 100', async () => {
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreMultiTurn(mk({}), '');
    expect(res.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// E. extractToolCall on empty text (L340)
// ---------------------------------------------------------------------------

describe('Scorer.extractToolCall empty text (L340)', () => {
  it('returns null for an empty string', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    expect(scorer.extractToolCall('')).toBeNull();
  });

  it('an empty model output is reported as 未检测到 tool_call, not as a name mismatch', async () => {
    const q = {
      id: 'fc-empty',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'get_weather', arguments: { city: '北京' } },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreFunctionCalling(q, '');
    expect(res.score).toBe(0);
    expect(res.detail).toBe('未检测到 tool_call');
  });
});

// ---------------------------------------------------------------------------
// F. valueMatches array normalisation with non-strings (L412)
// ---------------------------------------------------------------------------

describe('Scorer.valueMatches array normalisation (L412)', () => {
  const call = (expected: unknown, actual: unknown): boolean =>
    (new Scorer(makeAdapter(), baseConfig) as any).valueMatches(expected, actual);

  it('compares numeric arrays through the JSON.stringify fallback', () => {
    expect(call([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('is order-insensitive for numeric arrays', () => {
    expect(call([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it('coerces a number and its string form to the same normalised value', () => {
    // norm() stringifies BOTH sides, so JSON.stringify(1) === '1' and the raw
    // '1' side is already a string: they compare equal. This is a real
    // leniency — an FC answer that returns ["1","2"] for an expected [1,2]
    // scores full credit. It was previously invisible because every shipped
    // FC fixture used string arrays on both sides.
    expect(call([1], ['1'])).toBe(true);
  });

  it('rejects numeric arrays of different length before normalising', () => {
    expect(call([1, 2], [1, 2, 3])).toBe(false);
  });

  it('normalises nested object elements via JSON.stringify key order', () => {
    expect(call([{ a: 1, b: 2 }], [{ b: 2, a: 1 }])).toBe(false);
  });

  it('scores 70 (partial) when only some numeric array args match', async () => {
    const q = {
      id: 'fc-num-array',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'plot', arguments: { xs: [1, 2], ys: [3, 4] } },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const res = await scorer.scoreFunctionCalling(
      q,
      '{"name":"plot","arguments":{"xs":[1,9],"ys":[3,4]}}'
    );
    expect(res.score).toBe(70);
    expect(res.detail).toContain('◐ partial');
    expect(res.detail).toContain('(1/2)');
  });
});

// ---------------------------------------------------------------------------
// G. extractPythonCode fence variants (L517 / L520 / L523)
// ---------------------------------------------------------------------------

describe('Scorer.extractPythonCode fence variants (L517/L520/L523)', () => {
  const extract = (text: string): string =>
    (new Scorer(makeAdapter(), baseConfig) as any).extractPythonCode(text);

  it('unwraps a ```py fence', () => {
    expect(extract('```py\ndef f():\n    return 1\n```')).toBe('def f():\n    return 1');
  });

  it('prefers ```python over ```py when both are present', () => {
    const out = extract('```py\ndef pyf():\n    return 0\n```\n```python\ndef pyf():\n    return 1\n```');
    expect(out).toContain('return 1');
  });

  it('takes a generic fence when it contains a def', () => {
    expect(extract('```js\ndef f():\n    return 1\n```')).toBe('def f():\n    return 1');
  });

  it('falls back to the raw text when the only fence has no def', () => {
    const text = '```js\nconsole.log(1)\n```';
    expect(extract(text)).toBe(text);
  });

  it('a ```py fenced solution passes checkSyntax and scores on the testcases path', async () => {
    const q = {
      id: 'code-py-fence',
      category: '代码',
      content: 'x',
      weight: 1,
      type: 'coding',
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    // checkSyntax must see `def ` inside the py fence, otherwise the
    // syntax-invalid short circuit at L98 would return 20.
    expect(scorer.checkSyntax('```py\ndef add(a, b):\n    return a + b\n```')).toBe(true);
    const res = await scorer.scoreCoding(q, '```py\ndef add(a, b):\n    return a + b\n```');
    // No testCases -> LLM scoring path with the mock adapter reply '85'.
    expect(res.score).toBe(85);
  });

  it('a def-less generic fence fails checkSyntax and returns the syntax-error score', async () => {
    const q = {
      id: 'code-js-fence',
      category: '代码',
      content: 'x',
      weight: 1,
      type: 'coding',
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    expect(scorer.checkSyntax('```js\nconsole.log(1)\n```')).toBe(false);
    const res = await scorer.scoreCoding(q, '```js\nconsole.log(1)\n```');
    expect(res.score).toBe(20);
    expect(res.detail).toBe('代码存在语法错误');
  });

  it('evaluateCodeQuality scores a ```py fence with a docstring and a public def', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    const q = (s: string) => scorer.evaluateCodeQuality(s);
    const fenced = '```py\ndef add(a, b):\n    """add"""\n    return a + b\n```';
    // comment(5) + non-underscore def name(5) + identifier(5) + return(5)
    expect(q(fenced)).toBe(20);
    // A private def loses the naming point even inside a py fence.
    const priv = '```py\ndef _add(a, b):\n    """add"""\n    return a + b\n```';
    expect(q(priv)).toBe(15);
  });
});
