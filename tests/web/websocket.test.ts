// tests/web/websocket.test.ts - WebSocket 测试

import { initWebSocket, getWSSender } from '../../src/web/websocket';
import { createServer, Server } from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';

describe('WebSocket', () => {
  let server: Server;
  let serverPort: number;
  let initialized = false;

  beforeAll((done) => {
    server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      if (!initialized) {
        initWebSocket(server);
        initialized = true;
      }
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  describe('initWebSocket', () => {
    it('should initialize websocket server', () => {
      expect(typeof initWebSocket).toBe('function');
    });

    it('should reject connection without token', (done) => {
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws`);

      ws.on('close', (code) => {
        expect(code).toBe(4001);
        done();
      });

      ws.on('error', () => {
        // Expected error
      });
    });

    it('should reject connection with invalid token', (done) => {
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=invalid`);

      ws.on('close', (code) => {
        expect(code).toBe(4002);
        done();
      });

      ws.on('error', () => {
        // Expected error
      });
    });

    it('should accept connection with valid token', (done) => {
      const token = jwt.sign({ userId: 1 }, JWT_SECRET);
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should handle cancel message', (done) => {
      const token = jwt.sign({ userId: 1 }, JWT_SECRET);
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'cancel' }));
        setTimeout(() => {
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should handle malformed message gracefully', (done) => {
      const token = jwt.sign({ userId: 1 }, JWT_SECRET);
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      ws.on('open', () => {
        ws.send('not valid json');
        setTimeout(() => {
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', (err) => {
        done(err);
      });
    });

    it('should get WSSender function', () => {
      const sender = getWSSender();
      expect(typeof sender).toBe('function');
    });

    it('should handle client disconnect', (done) => {
      const token = jwt.sign({ userId: 1 }, JWT_SECRET);
      const ws = new WebSocket(`ws://localhost:${serverPort}/ws?token=${token}`);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        done();
      });
    });
  });
});
