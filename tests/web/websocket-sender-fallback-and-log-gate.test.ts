// tests/web/websocket-sender-fallback-and-log-gate.test.ts
//
// Closes 3 of the 4 dark branch arms in src/web/websocket.ts that no existing
// suite reaches (all were hits=0 in coverage/coverage-final.json @ 595e7f6):
//
//   line  9  `process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID`
//            -> the SECOND operand never evaluated under jest, because
//               NODE_ENV === 'test' short-circuits it. The documented backstop
//               ("stay quiet even when NODE_ENV is not test but we are inside a
//               jest worker") is therefore completely unverified.
//   line 11  `if (shouldLog) console.log(...)` -> never true in any test, so the
//               log emission path has zero execution; a regression that inverted
//               or deleted the gate would not turn anything red.
//   line 95  `sendToClient || (() => {})` -> the no-client fallback never runs,
//               because every existing test calls getWSSender() while a socket
//               is live. This is a REAL production path: src/web/routes/
//               evaluations.ts:150 hands getWSSender() to engine.run() with no
//               browser attached, so the no-op is what keeps a start request
//               from dereferencing null and taking the whole POST down.
//
// The 4th dark arm (`req.url || ''` at line 48) is not closable here: the
// http/ws parser rejects a request with no target before the connection
// handler runs, so the operand is structurally unreachable from a real client.

import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';

const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

interface TestServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

// One http.Server PER test. initWebSocket() attaches a WebSocketServer to the
// http server, and attaching two of them to the same server for the same path
// makes `ws` reject the second registration's close frames
// (WS_ERR_INVALID_CLOSE_CODE), so a shared server would make these cases
// interfere with each other.
async function startServer(): Promise<TestServer> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  return {
    server,
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// A fresh module instance guarantees sendToClient === null on entry, so the
// assertions below are order-independent and immune to module state that other
// suites leave behind.
function freshModule(): typeof import('../../src/web/websocket') {
  let mod!: typeof import('../../src/web/websocket');
  jest.isolateModules(() => {
    mod = require('../../src/web/websocket') as typeof import('../../src/web/websocket');
  });
  return mod;
}

const envBackup = {
  NODE_ENV: process.env.NODE_ENV,
  JEST_WORKER_ID: process.env.JEST_WORKER_ID,
};

afterEach(() => {
  if (envBackup.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = envBackup.NODE_ENV;
  if (envBackup.JEST_WORKER_ID === undefined) delete process.env.JEST_WORKER_ID;
  else process.env.JEST_WORKER_ID = envBackup.JEST_WORKER_ID;
  jest.restoreAllMocks();
});

describe('getWSSender no-client fallback', () => {
  let t: TestServer;

  beforeEach(async () => {
    t = await startServer();
  });

  afterEach(async () => {
    await t.close();
  });

  it('returns a callable no-op when no client has ever connected', () => {
    const { getWSSender } = freshModule();
    const sender = getWSSender();

    expect(typeof sender).toBe('function');
    // The whole point of the fallback: evaluations.ts:150 hands this straight to
    // engine.run(). Throwing here would 500 a legitimate start request.
    expect(() => sender({ type: 'start', evaluation_id: 'eval-no-client' })).not.toThrow();
  });

  it('sends to the live client once one connects, then reverts to the no-op on disconnect', async () => {
    const { initWebSocket, getWSSender } = freshModule();
    initWebSocket(t.server);
    await flush();

    const token = jwt.sign({ userId: 1 }, JWT_SECRET);
    const ws = new WebSocket(`ws://localhost:${t.port}/ws?token=${token}`);
    const received = new Promise<{ type: string; evaluation_id: string }>((resolve, reject) => {
      ws.on('message', (raw) => {
        try {
          resolve(JSON.parse(raw.toString()) as { type: string; evaluation_id: string });
        } catch (e) {
          reject(e);
        }
      });
      ws.on('error', reject);
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // The sender while a client is attached is the per-connection closure.
    const senderWhileConnected = getWSSender();
    senderWhileConnected({ type: 'start', evaluation_id: 'eval-live' });
    await expect(received).resolves.toEqual({ type: 'start', evaluation_id: 'eval-live' });

    await new Promise<void>((resolve, reject) => {
      ws.on('close', () => resolve());
      ws.on('error', reject);
      ws.close();
    });
    await flush();

    // Guards the `sendToClient = null` reset in the close handler. A
    // `not.toThrow()` assertion is NOT enough here: ws.send() on a CLOSED
    // socket returns silently and reports the error asynchronously, so a stale
    // sender looks harmless. What actually breaks in production is that the
    // dead socket stays registered as the process-wide sender FOREVER, so every
    // later start() pushes into a socket no client is attached to and no live
    // client ever receives the progress/completed frames. So assert on the send
    // call itself: after a disconnect the sender must be the no-op, and must not
    // reach WebSocket#send at all.
    const sendSpy = jest.spyOn(WebSocket.prototype, 'send').mockImplementation(() => undefined);
    const senderAfterClose = getWSSender();

    // Identity is the load-bearing invariant, not the no-throw behaviour: the
    // close handler must swap the process-wide sender back to the module-level
    // no-op, so getWSSender() must stop returning the per-connection closure.
    expect(senderAfterClose).not.toBe(senderWhileConnected);

    senderAfterClose({ type: 'start', evaluation_id: 'eval-after-close' });

    expect(sendSpy).not.toHaveBeenCalled();
    expect(() => getWSSender()({ type: 'start', evaluation_id: 'eval-after-close-2' })).not.toThrow();
  });
});

describe('websocket log gate', () => {
  let t: TestServer;

  beforeEach(async () => {
    t = await startServer();
  });

  afterEach(async () => {
    await t.close();
  });

  it('emits through the log gate when NODE_ENV is not test and no jest worker id is set', async () => {
    process.env.NODE_ENV = 'production';
    // Falsy rather than deleted: exercises the second operand of the line-9
    // `&&` without removing a key other modules may read.
    process.env.JEST_WORKER_ID = '';

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { initWebSocket } = freshModule();
    initWebSocket(t.server);
    await flush();

    expect(spy).toHaveBeenCalledWith('WebSocket server initialized');
  });

  it('suppresses the log gate when a jest worker id is present despite NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JEST_WORKER_ID = '3';

    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { initWebSocket } = freshModule();
    initWebSocket(t.server);
    await flush();

    expect(spy).not.toHaveBeenCalledWith('WebSocket server initialized');
  });
});
