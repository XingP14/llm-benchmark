// tests/web/r488-unauthenticated-questions-answers-leak.test.ts
//
// WHY THIS FILE EXISTS (2026-10-19 22:03 cron, llm-benchmark rotation).
//
// GET /api/questions is the ONLY data route in the web app with no
// authentication, and it is the only one that hands out the ANSWER KEY.
//
// The app has four routers (src/web/server.ts:44-47):
//
//   app.use('/api/auth',       authRoutes);        // login + /me
//   app.use('/api/configs',    configsRoutes);     // router.use(authMiddleware)
//   app.use('/api/evaluations',evaluationsRoutes); // router.use(authMiddleware)
//   app.use('/api/questions',  questionsRoutes);   // <-- NO authMiddleware
//
// Three of the four carry `router.use(authMiddleware)` (configs.ts:8,
// evaluations.ts:74, auth.ts:67 for /me). questions.ts has no auth import at
// all -- measured: `grep -c authMiddleware src/web/routes/questions.ts` = 0, and
// the file has never had one (git log -p --follow shows no such line in any
// revision). It is not a regression; it is the original shape.
//
// What the route then serves is the scoring rubric of the whole benchmark:
//
//   F1  THE ROUTE ANSWERS 200 WITH NO CREDENTIAL AT ALL. No Authorization
//       header, no token, no cookie. Measured against the real Express app.
//
//   F2  EVERY FAMILY'S ANSWER KEY IS ON THE WIRE. Not the questions -- the
//       KEYS the scorer compares the model against:
//         dialogue        reference_answer   (13/13)
//         coding          test_cases[].expected_output (11/11)
//         function_calling expected_tool_call  (5/5)
//         long_context    key_facts          (3/3)
//         multi_turn      consistency_check.required / .forbidden (3/3)
//       All five families leak. The scorer reads exactly these fields
//       (src/core/scorer.ts:147 expectedToolCall, :228 keyFacts,
//       :110 testCases, core/evaluator.ts:1799 codeQuestion.testCases) and
//       src/core/scorer.ts:438 builds the LLM-scoring prompt from
//       `question.referenceAnswer`. So this is not "metadata" -- it is the
//       grader.
//
//   F3  THE PRODUCT'S OWN SCORING PATH MAKES IT A SCORE, NOT A SIDE-QUOTE.
//       src/core/scorer.ts:243-251 scores long_context by checking whether the
//       model's answer CONTAINS each key fact, and :283-290 scores multi_turn
//       the same way over `required`. A caller who has read the response body
//       can answer every long_context and multi_turn question by echoing the
//       key facts back, with no model in the loop at all. Measured below: the
//       rubric-derived answer scores 100 on both.
//
//   F4  THE ROUTE IS REACHABLE IN THE SHIPPED ARTIFACT. The Docker image runs
//       `node dist/web/server.js` (docker/Dockerfile:29) on EXPOSE 3033
//       (docker/Dockerfile:27), and server.ts:50 mounts this router. The
//       public/ SPA does not call /api/questions (measured: no fetch to it in
//       public/js/*.js), so the route is a DEAD ENDPOINT for the product and a
//       LIVE ENDPOINT for anyone who can reach the port.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It asserts no correct behaviour, because every repair is a product decision:
//   F1/F2 -- add `router.use(authMiddleware)` to questions.ts? Then an
//            unauthenticated caller gets 401 and the rubric stops leaking.
//            But the shipped UI never calls this route, so that costs nothing
//            and closes the hole -- OR the route should stop projecting the
//            answer keys at all (reference_answer, test_cases, key_facts,
//            expected_tool_call, consistency_check are not "question" fields,
//            they are grader fields) and answer with question content only.
//   F3 -- if the keys stay on the wire, the scorer is measuring "did the model
//         echo the answer", and the benchmark's own numbers are inflated for
//         any client that reads the rubric first. Whether that is a bug in
//         the scorer or a design choice about who may see the rubric is the
//         maintainer's call.
//   F4 -- is an unauthenticated route on a benchmark tool a disclosure
//         (answers leak) or a non-issue (the benchmark set is public by
//         design, like a public exam)? THAT is the real question, and it is
//         the one the arms below are built to make visible.
//
// All of it is recorded father-gated. Pinning the CURRENT behaviour makes the
// decision visible and stops it drifting silently; the moment a policy lands,
// the matching arm below is the RED that has to be updated.
//
// HARNESS NOTES
//
// 1. NO CREDENTIAL IS EVER PRINTED. There is no credential in play on this
//    route at all -- that is the finding. The arms assert on the RESPONSE BODY
//    (which contains only benchmark data) and never on any secret.
//
// 2. THE SCORE IS COMPUTED WITH THE REAL SCORER, NOT A LOOKALIKE. Arm (5)
//    imports Scorer from src/core/scorer.ts and calls the real
//    scoreLongContext / scoreMultiTurn, so "the rubric is the grader" is
//    measured, not inferred. The scorer is constructed with a dummy adapter
//    (the same shape the web engine uses at src/web/engine/evaluator.ts:264)
//    because these two dimensions never call the adapter.
//
// 3. THE ROUTE IS MOUNTED EXACTLY AS server.ts MOUNTS IT. The whole app is
//    NOT booted (it calls initAdmin/validateRuntimeConfig and binds a port);
//    the router is mounted on a bare express app, which is what the sibling
//    tests/web/questions.test.ts already does.

import express, { Express } from 'express';
import request from 'supertest';
import { Scorer } from '../../src/core/scorer';
import type { ModelConfig } from '../../src/types';
import questionsRoutes from '../../src/web/routes/questions';
import {
  getAllDialogueBenchmarks,
} from '../../src/benchmarks/dialogue';
import {
  getAllCodeBenchmarks,
} from '../../src/benchmarks/coding';
import {
  getAllFunctionCallingBenchmarks,
} from '../../src/benchmarks/function-calling';
import {
  getAllLongContextBenchmarks,
} from '../../src/benchmarks/long-context';
import {
  getAllMultiTurnBenchmarks,
} from '../../src/benchmarks/multi-turn';

interface AnyRow {
  id: string;
  type: string;
  category: string;
  content: string;
  weight: number;
  reference_answer?: string | null;
  test_cases?: Array<{ input: string; expected_output: string; description: string }>;
  available_tools?: unknown;
  expected_tool_call?: { name: string; arguments: Record<string, unknown> };
  context_tokens?: number;
  key_facts?: string[];
  turns?: unknown;
  consistency_check?: { required: string[]; forbidden: string[] };
}

describe('r488 — GET /api/questions is unauthenticated and serves the answer key', () => {
  let app: Express;
  let unauth: { total: number; dialogue: AnyRow[]; coding: AnyRow[]; function_calling: AnyRow[]; long_context: AnyRow[]; multi_turn: AnyRow[] };
  let body: Record<string, AnyRow[]>;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/questions', questionsRoutes);

    // No Authorization header anywhere in this file's requests.
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(200);
    unauth = res.body as never;
    body = res.body as never;
  });

  // (0) THE PREMISE. Every other data route has auth and this one does not.
  // If a future change adds authMiddleware to questions.ts, arms (1)-(5) all
  // fail for the right reason -- but this arm is what says WHY, and it is the
  // arm that fails FIRST and most legibly.
  it('(0) premise: questions.ts is the only data route without authMiddleware', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const dir = path.join(__dirname, '../../src/web/routes');

    const routesWithAuth = (file: string): number => {
      const src = fs.readFileSync(path.join(dir, file), 'utf8') as string;
      return (src.match(/router\.use\(authMiddleware\)/g) ?? []).length;
    };

    expect(routesWithAuth('configs.ts')).toBe(1);
    expect(routesWithAuth('evaluations.ts')).toBe(1);
    // The one that does not.
    expect(routesWithAuth('questions.ts')).toBe(0);

    // And the auth middleware itself REJECTS a missing header, so the other
    // three really are gated -- this is the control half of the premise.
    const mw = fs.readFileSync(
      path.join(__dirname, '../../src/web/middleware/auth.ts'), 'utf8',
    ) as string;
    expect(mw).toMatch(/authHeader\?\.startsWith\('Bearer '\)/);
    expect(mw).toMatch(/res\.status\(401\)/);
  });

  // (1) F1. The route answers a completely anonymous caller.
  it('(1) F1: an anonymous request is answered 200 with the full question set', () => {
    expect(unauth.total).toBe(35);
    expect(unauth.dialogue.length).toBeGreaterThan(0);
    expect(unauth.coding.length).toBeGreaterThan(0);
    expect(unauth.function_calling.length).toBeGreaterThan(0);
    expect(unauth.long_context.length).toBeGreaterThan(0);
    expect(unauth.multi_turn.length).toBeGreaterThan(0);
  });

  // (2) F2. The answer key of EVERY family is on the wire. This is the
  // census -- the shape of the leak, per family, measured off the response.
  it('(2) F2: all five families ship their grader fields to an anonymous caller', () => {
    // dialogue -> reference_answer
    expect(body.dialogue.length).toBeGreaterThan(0);
    for (const q of body.dialogue) {
      expect(q.reference_answer).toBeTruthy(); // dialogue: reference_answer present
    }
    // coding -> test_cases[].expected_output
    expect(body.coding.length).toBeGreaterThan(0);
    for (const q of body.coding) {
      expect(q.test_cases).toBeDefined(); // coding: test_cases present
      expect(q.test_cases!.length).toBeGreaterThan(0);
      for (const tc of q.test_cases!) {
        expect(tc.expected_output).toBeTruthy(); // coding: every tc carries expected_output
      }
    }
    // function_calling -> expected_tool_call
    expect(body.function_calling.length).toBeGreaterThan(0);
    for (const q of body.function_calling) {
      expect(q.expected_tool_call).toBeDefined(); // fc: expected_tool_call present
      expect(q.expected_tool_call!.name).toBeTruthy();
    }
    // long_context -> key_facts
    expect(body.long_context.length).toBeGreaterThan(0);
    for (const q of body.long_context) {
      expect(q.key_facts).toBeDefined(); // lc: key_facts present
      expect(q.key_facts!.length).toBeGreaterThan(0);
    }
    // multi_turn -> consistency_check.required / .forbidden
    expect(body.multi_turn.length).toBeGreaterThan(0);
    for (const q of body.multi_turn) {
      expect(q.consistency_check).toBeDefined(); // mt: consistency_check present
      expect(q.consistency_check!.required.length).toBeGreaterThan(0);
      expect(q.consistency_check!.forbidden.length).toBeGreaterThan(0);
    }
  });

  // (3) F2 REACH, half 1: the scorer reads EXACTLY these fields. A field on
  // the wire that nothing reads is not a leak of anything; this is the half
  // that says the wire and the grader are the same fields.
  it('(3) F2 reach: the scorer reads the same fields the route projects', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const scorer = fs.readFileSync(
      path.join(__dirname, '../../src/core/scorer.ts'), 'utf8',
    ) as string;

    // The five grader fields, by their production read sites.
    expect(scorer).toMatch(/expectedToolCall/);
    expect(scorer).toMatch(/keyFacts/);
    expect(scorer).toMatch(/testCases/);
    expect(scorer).toMatch(/referenceAnswer/);

    // And the route projects the same five, by their production read sites.
    const route = fs.readFileSync(
      path.join(__dirname, '../../src/web/routes/questions.ts'), 'utf8',
    ) as string;
    expect(route).toMatch(/reference_answer:\s*q\.referenceAnswer/);
    expect(route).toMatch(/test_cases:\s*q\.testCases/);
    expect(route).toMatch(/expected_tool_call:\s*q\.expectedToolCall/);
    expect(route).toMatch(/key_facts:\s*q\.keyFacts/);
    expect(route).toMatch(/consistency_check:\s*q\.consistencyCheck/);
  });

  // (4) F3, measured with the REAL scorer. The key facts are not decoration:
  // src/core/scorer.ts:243 checks whether the model output CONTAINS each key
  // fact, so an answer assembled from the leaked rubric scores 100.
  it('(4) F3: an answer assembled from the leaked key_facts scores 100 on the real scorer', async () => {
    const dummy: ModelConfig = {
      name: 'probe', type: 'openai' as const, endpoint: '', apiKey: '',
    };
    const scorer = new Scorer(
      { chat: async () => '' } as never,
      dummy,
    );

    const lc = getAllLongContextBenchmarks()[0];
    const leaked = body.long_context.find((q) => q.id === lc.id);
    expect(leaked).toBeDefined(); // the probed long_context question is on the wire
    expect(leaked!.key_facts).toEqual(lc.keyFacts);

    // The rubric-derived "model output": every key fact, echoed.
    const answer = (leaked!.key_facts ?? []).join(' and ');

    const scored = await scorer.scoreLongContext(lc, answer);
    expect(scored.score).toBe(100);

    // The control half: an answer with NONE of the key facts scores 0. Without
    // it, "score 100" could be a scorer that always returns 100.
    const blind = await scorer.scoreLongContext(lc, 'I do not know.');
    expect(blind.score).toBe(0);
  });

  // (5) F3, the second family. multi_turn scores on `required` presence and
  // subtracts 20 per `forbidden` hit -- so the leaked forbidden list is a
  // NEGATIVE key: it tells the caller what to avoid saying.
  it('(5) F3: the leaked required/forbidden lists decide the multi_turn score', async () => {
    const dummy: ModelConfig = {
      name: 'probe', type: 'openai' as const, endpoint: '', apiKey: '',
    };
    const scorer = new Scorer(
      { chat: async () => '' } as never,
      dummy,
    );

    const mt = getAllMultiTurnBenchmarks()[0];
    const leaked = body.multi_turn.find((q) => q.id === mt.id);
    expect(leaked).toBeDefined();
    expect(leaked!.consistency_check).toEqual(mt.consistencyCheck);

    // All required, none of the forbidden -> 100.
    const good = (mt.consistencyCheck?.required ?? []).join(' ');
    const goodScore = await scorer.scoreMultiTurn(mt, good);
    expect(goodScore.score).toBe(100);

    // The SAME text plus one forbidden phrase -> 100 - 20 = 80. The forbidden
    // list is not inert: knowing it is worth 20 points.
    const bad = `${good} ${(mt.consistencyCheck?.forbidden ?? [])[0]}`;
    const badScore = await scorer.scoreMultiTurn(mt, bad);
    expect(badScore.score).toBe(80);
  });

  // (6) F4. The route is mounted by the shipped server and the shipped image
  // runs that server. This arm is a SOURCE-TEXT pin, and it is pinned BY
  // DESIGN -- see harness note 4.
  it('(6) F4: the shipped server mounts this route and the image runs that server', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const repo = path.join(__dirname, '../..');

    const server = fs.readFileSync(
      path.join(repo, 'src/web/server.ts'), 'utf8',
    ) as string;
    expect(server).toMatch(/app\.use\('\/api\/questions',\s*questionsRoutes\)/);

    const dockerfile = fs.readFileSync(
      path.join(repo, 'docker/Dockerfile'), 'utf8',
    ) as string;
    expect(dockerfile).toMatch(/EXPOSE\s+3033/);
    expect(dockerfile).toMatch(/CMD\s+\["node",\s*"dist\/web\/server\.js"\]/);
  });

  // (7) F4, the other half. The public SPA does not call the route, so the
  // endpoint is dead for the product and live for the network. This is the
  // measurement that makes the disclosure question concrete: there is no
  // product reason for the route to be anonymous, because no product code
  // uses it.
  it('(7) F4: the shipped SPA never calls /api/questions', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const jsDir = path.join(__dirname, '../../public/js');
    const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')) as string[];

    const hits: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(jsDir, f), 'utf8') as string;
      if (src.includes('/api/questions') || src.includes("'/questions'")) {
        hits.push(f);
      }
    }
    expect(hits).toEqual([]);
  });
});
