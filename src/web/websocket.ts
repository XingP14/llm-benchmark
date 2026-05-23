// src/web/websocket.ts - WebSocket 处理

import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { taskManager } from './engine/task';

const JWT_SECRET = process.env.JWT_SECRET || 'llm-bench-secret';

let sendToClient: WSSender | null = null;

export type WSSender = (data: any) => void;

/**
 * 初始化 WebSocket
 */
export function initWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection attempt');

    // 从 URL 参数获取 token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'No token provided');
      return;
    }

    try {
      jwt.verify(token, JWT_SECRET);
      console.log('WebSocket authenticated');
    } catch {
      ws.close(4002, 'Invalid token');
      return;
    }

    // 处理客户端消息
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'cancel') {
          taskManager.requestCancel();
          console.log('Cancel requested');
        }
      } catch {}
    });

    // 设置发送器
    sendToClient = (msg: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.on('close', () => {
      sendToClient = null;
      console.log('WebSocket disconnected');
    });
  });

  console.log('WebSocket server initialized');
}

/**
 * 获取 WebSocket 发送器
 */
export function getWSSender(): WSSender {
  return sendToClient || (() => {});
}
