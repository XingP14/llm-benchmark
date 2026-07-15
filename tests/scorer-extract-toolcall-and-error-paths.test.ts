// tests/scorer-extract-toolcall-and-error-paths.test.ts
//
// Coverage gap closure for src/core/scorer.ts (2026-07-15 23:43 cron tick):
//   - extractToolCall brace-match fallback (lines 374-377): JSON embedded in
//     prose text without ```json fences. Steps 1 (direct JSON.parse) and 2
//     (```json code block) fail, so step 3 (regex brace match) is the only
//     path that can extract the tool call.
//   - FC/LC/MT score method catch blocks (lines 203-204, 261-262, 323-324):
//     when an internal getter throws, the catch must return score=0 with an
//     error detail string.
//   - checkSyntax catch block (line 535): when extractPythonCode throws,
//     checkSyntax must return false.
//
// These paths are exercised by the full test suite's coverage report showing
// uncovered lines: 203-204, 261-262, 323-324, 374-377, 535 in scorer.ts.

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
// extractToolCall brace-match fallback (step 3, lines 374-377)
// ---------------------------------------------------------------------------

describe('Scorer.extractToolCall brace-match fallback (lines 374-377)', () => {
  it('extracts tool call from prose text via brace-match (step 3 success)', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    // Prose text with embedded JSON — not pure JSON (step 1 fails),
    // not in a ```json block (step 2 fails), brace-match (step 3) finds it.
    // arguments is a string (not nested object) so the non-greedy `}` regex
    // captures the full valid JSON object.
    const result = scorer.extractToolCall(
      '调用工具 {"name":"search","arguments":"none"} 完毕'
    );
    expect(result).not.toBeNull();
    expect(result.name).toBe('search');
    // arguments is "none" (truthy) so `obj.arguments || {}` = "none"
    expect(result.arguments).toBe('none');
  });

  it('returns null when brace-match captures invalid JSON (step 3 catch fall-through)', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    // The non-greedy `\}` matches the first `}` inside the nested object,
    // producing `{"name":"x","arguments":{}` which is not valid JSON.
    // JSON.parse throws -> catch falls through -> returns null.
    const result = scorer.extractToolCall(
      'text {"name":"x","arguments":{}} more'
    );
    expect(result).toBeNull();
  });

  it('returns null when text has no brace-matchable JSON at all', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    const result = scorer.extractToolCall('just plain text, no JSON here');
    expect(result).toBeNull();
  });

  it('brace-match succeeds via scoreFunctionCalling integration (name-only match -> score 40)', async () => {
    const q: BenchmarkQuestion = {
      id: 'bm-fc1',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      expectedToolCall: { name: 'search', arguments: { q: 'hello' } },
    } as any;
    // Prose text — only brace-match can extract the tool call.
    // arguments="none" is a string; matchArgs will compare { q: 'hello' }
    // against a non-object actual. nameMatch=true, argMatch.full=false,
    // argMatch.partial=false -> score=40.
    const out = '我来调用 {"name":"search","arguments":"none"} 查询';
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const result = await scorer.scoreFunctionCalling(q, out);
    expect(result.score).toBe(40);
    expect(result.detail).toContain('search');
    expect(result.detail).toContain('✓');
  });
});

// ---------------------------------------------------------------------------
// FC/LC/MT catch block error paths (lines 203-204, 261-262, 323-324)
// ---------------------------------------------------------------------------

describe('Scorer score method catch blocks (error paths)', () => {
  it('FC catch: returns score 0 with error detail when expectedToolCall getter throws', async () => {
    const q: BenchmarkQuestion = {
      id: 'fc-err',
      category: '工具调用',
      content: 'x',
      weight: 1,
      type: 'function_calling',
      get expectedToolCall() {
        throw new Error('expectedToolCall getter explosion');
      },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const result = await scorer.scoreFunctionCalling(q, 'any output');
    expect(result.score).toBe(0);
    expect(result.dimension).toBe('function_calling');
    expect(result.questionId).toBe('fc-err');
    expect(result.detail).toContain('FC 评分错误');
    expect(result.detail).toContain('getter explosion');
  });

  it('LC catch: returns score 0 with error detail when keyFacts getter throws', async () => {
    const q: BenchmarkQuestion = {
      id: 'lc-err',
      category: '长上下文',
      content: 'x',
      weight: 1,
      type: 'long_context',
      get keyFacts() {
        throw new Error('keyFacts getter boom');
      },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const result = await scorer.scoreLongContext(q, 'any output');
    expect(result.score).toBe(0);
    expect(result.dimension).toBe('long_context');
    expect(result.questionId).toBe('lc-err');
    expect(result.detail).toContain('LC 评分错误');
    expect(result.detail).toContain('keyFacts getter boom');
  });

  it('MT catch: returns score 0 with error detail when consistencyCheck getter throws', async () => {
    const q: BenchmarkQuestion = {
      id: 'mt-err',
      category: '多轮一致性',
      content: 'x',
      weight: 1,
      type: 'multi_turn',
      get consistencyCheck() {
        throw new Error('consistencyCheck getter crash');
      },
    } as any;
    const scorer = new Scorer(makeAdapter(), baseConfig);
    const result = await scorer.scoreMultiTurn(q, 'any output');
    expect(result.score).toBe(0);
    expect(result.dimension).toBe('multi_turn');
    expect(result.questionId).toBe('mt-err');
    expect(result.detail).toContain('MT 评分错误');
    expect(result.detail).toContain('consistencyCheck getter crash');
  });
});

// ---------------------------------------------------------------------------
// checkSyntax catch block (line 535)
// ---------------------------------------------------------------------------

describe('Scorer.checkSyntax catch block (line 535)', () => {
  it('returns false when extractPythonCode throws', () => {
    const scorer = new Scorer(makeAdapter(), baseConfig) as any;
    // Force extractPythonCode to throw so the catch block in checkSyntax
    // is exercised.
    jest
      .spyOn(scorer, 'extractPythonCode')
      .mockImplementation(() => {
        throw new Error('extractPythonCode internal error');
      });
    const result = scorer.checkSyntax('def foo():\n    return 1');
    expect(result).toBe(false);
  });
});
