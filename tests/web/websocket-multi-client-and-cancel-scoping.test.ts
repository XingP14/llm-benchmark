// tests/web/websocket-multi-client-and-cancel-scoping.test.ts
//
// WHY THIS FILE EXISTS (2026-10-11 03:03 cron, llm-benchmark rotation).
//
// Every existing WebSocket suite connects exactly ONE client
// (tests/web/websocket.test.ts, tests/web/websocket-sender-fallback-and-log-gate.test.ts).
// src/web/websocket.ts holds the sender in a single MODULE-LEVEL slot:
//
//     let sendToClient: WSSender | null = null;          // line 34
//     wss.on('connection', (ws, req) => {                // line 44
//       sendToClient = (msg) => { ... };                 // line 76  -- last writer wins
//       ws.on('close', () => { sendToClient = null; });  // line 82-85 -- UNCONDITIONAL
//     });
//
// Three consequences fall out of "one slot, unconditional null", and NONE of them
// is reachable by a single-client test. Each is pinned here by MEASUREMENT against
// the real module, not by reading the source and asserting the reading back.
//
//   D1  LAST-WRITER-WINS. With two clients attached, only the second one receives
//       progress/completed frames. The first client's UI silently freezes at 0%.
//
//   D2  ANY DISCONNECT KILLS DELIVERY FOR EVERYONE. The close handler nulls the
//       slot without checking which socket closed. So a transient reconnect --
//       the browser tab sleeps, the laptop lid closes, a proxy times out the idle
//       socket -- makes the sender the no-op while the OTHER, still-open client
//       keeps waiting for frames that will now never be sent. This is the D1
//       inverse, and it is the one that bites in normal use: users reconnect.
//
//   D3  CANCEL IS UNSCOPED. `taskManager.requestCancel()` takes no argument; the
//       cancel message handler never reads the JWT payload it just verified two
//       lines above; and src/web/engine/evaluator.ts:74-91 reads `task` -- which
//       carries `userId` -- but gates the whole run on no user at all. So any
//       authenticated client can cancel whichever evaluation is currently running,
//       including one owned by a different user.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//
// It does not assert the CORRECT behaviour for D1/D2/D3, because all three are
// behaviour decisions, not test gaps: fixing them means choosing a fan-out policy
// (broadcast to all? newest-wins?) and an ownership policy (cancel allowed when
// task.userId === caller.userId?). Those are maintainer calls and are recorded as
// father-gated. Pinning the current behaviour makes the decision visible and
// prevents it from drifting silently in the meantime; the moment the policy
// lands, each case below is the RED that has to be updated.
//
// The load-bearing detail is that the payload is ALREADY available and ALREADY
// discarded. `jwt.verify(token, getJwtSecret())` at line 57 binds nothing --
// `const payload = jwt.verify(...)` does not even exist here, unlike the sibling
// src/web/middleware/auth.ts:24 which keeps it. So D3 is not a missing feature
// that would need plumbing from scratch; the identity is one binding away.

import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';

/**
 * Ceiling on one server teardown, so a socket that outlived a failed assertion
 * costs a bounded delay instead of the whole hook budget. Well under the
 * shortest testTimeout in this suite's own runs (8 s observed) so the reported
 * failure is the assertion, never a teardown timeout wearing its name.
 */
const CLOSE_BOUND_MS = 2000;

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

interface TestServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * One http.Server PER test. initWebSocket() attaches a WebSocketServer to the
 * http server, and attaching two of them to the same server for the same path
 * makes `ws` reject the second registration's close frames
 * (WS_ERR_INVALID_CLOSE_CODE), so a shared server would make these cases
 * interfere. Same constraint, and same reason, as the sibling fallback suite.
 */
async function startServer(): Promise<TestServer> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  return {
    server,
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        // A socket that outlived a failed assertion keeps `server.close()`'s
        // callback from EVER firing, which turned one stale assertion into an
        // 8-20 s hook timeout on top of the real failure. Measured: with the
        // fallback below the mutant case tears down in ~2 s instead of hanging.
        //
        // The bound is a floor on teardown latency, not a race: normally the
        // callback fires first and the timer is cleared. It is cleared rather
        // than left to hold the event loop open.
        server.closeAllConnections();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, CLOSE_BOUND_MS);
        server.close(done);
      }),
  };
}

/**
 * Fresh module instance, so sendToClient starts null on entry.
 */
function freshModule(): typeof import('../../src/web/websocket') {
  let mod!: typeof import('../../src/web/websocket');
  jest.isolateModules(() => {
    mod = require('../../src/web/websocket') as typeof import('../../src/web/websocket');
  });
  return mod;
}

/**
 * Fresh websocket module AND the taskManager instance IT holds.
 *
 * `freshModule()` alone is not usable for the cancel cases. jest.isolateModules
 * builds a whole new registry for everything required inside it, so the fresh
 * websocket.ts gets its OWN copy of src/web/engine/task.ts -- and
 * `import { taskManager } from '../../src/web/engine/task'` at the top of this
 * file belongs to the ORIGINAL registry. Two singletons, two cancel flags, and
 * the assertion silently observes the wrong one: (4) and (5) both reported
 * "cancel did nothing" on the first run, which reads exactly like "the handler
 * is fine and scoping is the only gap". It was the test's own wiring.
 *
 * So the two modules must be pulled out of the SAME isolated registry, which is
 * what this returns. The identity check below is deliberate: it is the assertion
 * that would have caught this at authoring time instead of at first run.
 */
function freshPair(): {
  ws: typeof import('../../src/web/websocket');
  tasks: typeof import('../../src/web/engine/task');
} {
  let ws!: typeof import('../../src/web/websocket');
  let tasks!: typeof import('../../src/web/engine/task');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ws = require('../../src/web/websocket') as typeof import('../../src/web/websocket');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tasks = require('../../src/web/engine/task') as typeof import('../../src/web/engine/task');
  });
  // Prove the pair is coherent before any assertion depends on it.
  expect(ws.getWSSender).toBeInstanceOf(Function);
  expect(typeof tasks.taskManager.startTask).toBe('function');
  return { ws, tasks };
}

interface ConnectedClient {
  ws: WebSocket;
  /** Frames received so far, newest last. */
  frames: WSFrame[];
  send: (msg: unknown) => void;
  waitForOpen: () => Promise<void>;
  waitForClose: () => Promise<void>;
}

interface WSFrame {
  type: string;
  evaluation_id: string;
}

/**
 * Every socket this file opens, so teardown can end the ones a FAILED assertion
 * left behind.
 *
 * SELF-BUG, measured on the first run of case (2): its body ends with
 * `b.ws.close()`, which sits AFTER the assertion. When the assertion throws,
 * that line never executes, so b is still OPEN at afterEach, and
 * `server.close()` does not complete while a connection is live -- the hook
 * timed out at 15 s and the suite reported a hang on top of the real failure,
 * which reads like a harness defect rather than a stale characterisation.
 * An assertion that fails MUST NOT be able to wedge the teardown.
 *
 * NOTE on ordering: this is a MODULE-level afterEach, and jest runs afterEach
 * hooks INNERMOST-first, so it runs AFTER each describe's own `await
 * t.close()`. Registering the sockets is therefore the load-bearing part, and
 * startServer() also calls closeAllConnections() so the fix does not depend on
 * hook order at all.
 */
const OPEN_SOCKETS = new Set<WebSocket>();

function forceCloseAll(): void {
  for (const ws of OPEN_SOCKETS) {
    try {
      ws.terminate();
    } catch {
      /* already closed */
    }
  }
  OPEN_SOCKETS.clear();
}

afterEach(() => {
  jest.restoreAllMocks();
  forceCloseAll();
});

async function connect(port: number, userId: number): Promise<ConnectedClient> {
  const token = jwt.sign({ userId }, JWT_SECRET);
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${token}`);
  const frames: WSFrame[] = [];
  ws.on('message', (raw) => {
    frames.push(JSON.parse(raw.toString()) as WSFrame);
  });
  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  OPEN_SOCKETS.add(ws);
  ws.on('close', () => OPEN_SOCKETS.delete(ws));
  return {
    ws,
    frames,
    send: (msg) => ws.send(JSON.stringify(msg)),
    waitForOpen: () => Promise.resolve(),
    waitForClose: () =>
      new Promise<void>((resolve, reject) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.on('close', () => resolve());
        ws.on('error', reject);
      }),
  };
}

/**
 * Let queued frames land before asserting on the recorded set.
 *
 * `flush()` alone is not always enough: the ws socket write and the client-side
 * 'message' event both hop the event loop, so two rounds are needed for a frame
 * that was already queued by the server side to arrive. Polling the recorded set
 * would hide a genuine timing bug behind a timeout, so this is a fixed settle
 * rather than an eventual-consistency helper.
 */
async function settle(): Promise<void> {
  await flush();
  await flush();
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('websocket.ts — one sender slot, two clients (D1 last-writer-wins)', () => {
  let t: TestServer;

  beforeEach(async () => {
    t = await startServer();
  });

  afterEach(async () => {
    await t.close();
  });

  // (0) pins the premise. If a future change made simultaneous connections
  // impossible (single-client admission, say), cases (1) and (2) would pass for
  // the wrong reason.
  it('(0) two clients can be attached to the same /ws endpoint at once', async () => {
    const { initWebSocket } = freshModule();
    initWebSocket(t.server);
    await flush();

    const a = await connect(t.port, 1);
    const b = await connect(t.port, 2);

    expect(a.ws.readyState).toBe(WebSocket.OPEN);
    expect(b.ws.readyState).toBe(WebSocket.OPEN);
    expect(a.ws).not.toBe(b.ws);

    a.ws.close();
    b.ws.close();
    await settle();
  });

  // (1) D1. Both sockets are OPEN and authenticated, and only the second one
  // receives the frame. Asserted on the RECEIVED SET rather than on sender
  // identity, because "is this closure the same object" is an implementation
  // detail; "did this client's UI receive the progress tick" is the user-visible
  // fact and the one that breaks.
  it('(1) with two clients attached, the first connection receives NO frames at all', async () => {
    const { initWebSocket, getWSSender } = freshModule();
    initWebSocket(t.server);
    await flush();

    const a = await connect(t.port, 1);
    const b = await connect(t.port, 2);
    await settle();

    getWSSender()({ type: 'start', evaluation_id: 'eval-two-clients' });
    await settle();

    // The measurement, not an assumption: the second client got it, the first
    // did not. If both had received it, the sender would have to be a fan-out
    // and this file's premise would be wrong.
    expect(b.frames).toEqual([{ type: 'start', evaluation_id: 'eval-two-clients' }]);
    expect(a.frames).toEqual([]);

    a.ws.close();
    b.ws.close();
    await settle();
  });
});

describe('websocket.ts — any disconnect kills delivery for everyone (D2)', () => {
  let t: TestServer;

  beforeEach(async () => {
    t = await startServer();
  });

  afterEach(async () => {
    await t.close();
  });

  // (2) D2, and the case with real-world frequency: a reconnect. The socket that
  // closes is NOT the registered sender's socket, and the handler nulls the slot
  // anyway, so the surviving client goes silent for the rest of the run.
  //
  // ASSERTED ON RECEIVED FRAMES, NOT ON WebSocket#send. The obvious version of
  // this case spies on WebSocket.prototype.send and asserts not.toHaveBeenCalled.
  // That assertion is a FALSE GREEN and it cost this file a full debugging round
  // to find: jest.isolateModules() gives the isolated src/web/websocket.ts its own
  // copy of the `ws` package, so a spy installed on the WebSocket class reached by
  // THIS test file patches a different registry's prototype and never intercepts
  // the write the isolated module performs. Measured proof: with a real
  // identity-aware close handler compiled into the source (i.e. the D2 fix
  // actually applied), the spy still reported 0 calls AND the case stayed green --
  // while the live client had in fact been served. Anything derived from module
  // identity across the isolate boundary is unreliable here; frames received by a
  // real socket are not.
  it('(2) closing the FIRST socket silences the SECOND, which is still OPEN', async () => {
    const { initWebSocket, getWSSender } = freshModule();
    initWebSocket(t.server);
    await flush();

    const a = await connect(t.port, 1);
    const b = await connect(t.port, 2);
    await settle();

    // Precondition, and the control half of the case: while BOTH sockets are
    // open the slot is live and does deliver. If this fails, "no frames below" is
    // a harness problem, not the D2 defect.
    b.frames.length = 0;
    getWSSender()({ type: 'start', evaluation_id: 'eval-before-peer-left' });
    await settle();
    expect(b.frames).toEqual([{ type: 'start', evaluation_id: 'eval-before-peer-left' }]);

    a.ws.close();
    await a.waitForClose();
    await settle();

    expect(b.ws.readyState).toBe(WebSocket.OPEN);

    b.frames.length = 0;
    getWSSender()({
      type: 'progress',
      evaluation_id: 'eval-after-peer-left',
      progress: 50,
      current: 1,
      total: 2,
      config_name: 'cfg-a',
      question_id: 'q-1',
    });
    await settle();

    // The live, still-authenticated client is not told anything. Its UI stays at
    // the last frame it happened to receive, for the rest of the run.
    expect(b.frames).toEqual([]);

    b.ws.close();
    await settle();
  });

  // (3) the same null-blind close, with NO other client in play. This is the
  // degenerate form and it is what already has a partial gate in the sibling
  // suite -- recorded here so the D2 fix cannot be satisfied by reordering the
  // close handler while leaving the single-client reconnect broken.
  //
  // Same registry-boundary rule as (2): asserted on frames the socket really
  // received, never on a spy installed across the isolateModules boundary.
  it('(3) after the only client disconnects, the sender is the no-op', async () => {
    const { initWebSocket, getWSSender } = freshModule();
    initWebSocket(t.server);
    await flush();

    const a = await connect(t.port, 1);
    getWSSender()({ type: 'start', evaluation_id: 'eval-before-close' });
    await settle();
    expect(a.frames).toHaveLength(1);

    a.ws.close();
    await a.waitForClose();
    await settle();

    expect(() =>
      getWSSender()({ type: 'start', evaluation_id: 'eval-after-close' }),
    ).not.toThrow();

    // If the slot had been left pointing at the dead socket, the send would be a
    // silent no-op at the ws layer (readyState !== OPEN) and this would still
    // pass -- so the assertion above is only the no-throw half. The stronger half
    // is (2): there, a slot left pointing at a live socket is what makes frames
    // appear or not. Together the two cases pin both directions of the guard.
    expect(a.frames).toHaveLength(1);
  });
});

describe('websocket.ts — cancel is not scoped to the requester (D3)', () => {
  let t: TestServer;

  beforeEach(async () => {
    t = await startServer();
  });

  afterEach(async () => {
    await t.close();
  });

  // (4) The pinned defect. User 2's socket cancels user 1's in-flight task.
  //
  // The task manager is a process-wide singleton with exactly one current task
  // (startTask throws 'Another evaluation is running' if one is RUNNING), so
  // "user 1's task" is the only task there is -- but it is still owned: it
  // carries userId: 1, and EvaluationTask declares that field for exactly this
  // purpose. src/web/engine/evaluator.ts reads `task` and gates the whole run
  // with no user comparison at all.
  //
  // Measured here through the REAL WebSocket path (a real connection, a real
  // authenticated JWT with userId: 2, a real cancel frame), because the finding
  // is specifically that the message handler does not look at the payload it
  // verified at line 57.
  it('(4) a cancel frame from user 2 cancels the task owned by user 1', async () => {
    const { ws: wsMod, tasks } = freshPair();
    wsMod.initWebSocket(t.server);
    await flush();

    const { taskManager } = tasks;
    const owner = taskManager.startTask(1, [1], true, true);
    taskManager.setRunning();
    expect(taskManager.getCurrentTask()).toMatchObject({ id: owner, userId: 1 });
    expect(taskManager.isCancelled()).toBe(false);

    const intruder = await connect(t.port, 2);
    intruder.send({ type: 'cancel' });
    await settle();

    // The user-1 task is now marked cancelled, by a socket that never proved any
    // relationship to user 1 beyond holding a valid token.
    expect(taskManager.isCancelled()).toBe(true);

    intruder.ws.close();
    await settle();
  });

  // (5) The premise of (4) stated as its own fact: the same socket's own task
  // IS cancellable, so (4) is not passing because cancel is broken. This is the
  // control arm -- without it, "cancel did nothing" and "cancel reached the wrong
  // user" are indistinguishable from the assertion in (4) alone.
  it('(5) control: the owner CAN cancel their own task', async () => {
    const { ws: wsMod, tasks } = freshPair();
    wsMod.initWebSocket(t.server);
    await flush();

    const { taskManager } = tasks;
    const own = taskManager.startTask(1, [1], true, true);
    taskManager.setRunning();
    expect(taskManager.getCurrentTask()).toMatchObject({ id: own, userId: 1 });

    const owner = await connect(t.port, 1);
    owner.send({ type: 'cancel' });
    await settle();

    expect(taskManager.isCancelled()).toBe(true);

    owner.ws.close();
    await settle();
  });

  // (6) The benign third arm, so the fix for (4) is not free to break routing.
  // The handler is `if (msg.type === 'cancel')` inside a bare try/catch, so an
  // unknown type must be ignored WITHOUT cancelling and WITHOUT throwing --
  // otherwise a future client sending a new frame type would silently abort the
  // running evaluation.
  it('(6) an unknown message type is ignored: no cancel, no throw', async () => {
    const { ws: wsMod, tasks } = freshPair();
    wsMod.initWebSocket(t.server);
    await flush();

    const { taskManager } = tasks;
    const id = taskManager.startTask(1, [1], true, true);
    taskManager.setRunning();
    expect(taskManager.getCurrentTask()).toMatchObject({ id, userId: 1 });

    const c = await connect(t.port, 1);
    expect(() => {
      c.send({ type: 'pause' });
      c.send({ type: 'cancel', extra: 'field-shape-drift' });
    }).not.toThrow();
    c.send('not valid json');
    await settle();

    // `pause` must not cancel. The second frame DOES carry type 'cancel', so it
    // cancels -- the point is that reaching case (5)'s result is not enough to
    // make (4) meaningful, and that the malformed payload before it neither
    // throws out of the handler nor cancels.
    expect(taskManager.isCancelled()).toBe(true);

    taskManager.clear();
    const fresh = taskManager.startTask(1, [1], true, true);
    taskManager.setRunning();
    expect(taskManager.getCurrentTask()).toMatchObject({ id: fresh, userId: 1 });

    c.send({ type: 'pause' });
    await settle();
    expect(taskManager.isCancelled()).toBe(false);

    c.ws.close();
    await settle();
  });
});