// src/web/websocket.ts - WebSocket 处理

import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { taskManager } from './engine/task';
import { getJwtSecret } from './config';

/**
 * WebSocket 消息 union — 覆盖 5 类推送 (start/cancelled/completed/progress/error).
 * 与 src/web/engine/evaluator.ts 中 `sendWS({...})` 调用点 5 处 (start / progress / completed / error / cancelled) 一一对应.
 * 此前 `data: any` 漏更, 编译期无法拦截 sendWS 多余/缺失字段; 窄化后所有 WS 推送字段在 tsc 阶段校验.
 */
export type WSMessage =
  | { type: 'start'; evaluation_id: string }
  | { type: 'cancelled'; evaluation_id: string }
  | { type: 'completed'; evaluation_id: string }
  | {
      type: 'progress';
      evaluation_id: string;
      progress: number;
      current: number;
      total: number;
      config_name: string;
      question_id: string;
    }
  | { type: 'error'; evaluation_id: string; message: string };

let sendToClient: WSSender | null = null;

export type WSSender = (data: WSMessage) => void;

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
      jwt.verify(token, getJwtSecret());
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
    sendToClient = (msg: WSMessage) => {
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
