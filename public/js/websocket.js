// public/js/websocket.js - WebSocket 客户端
// 修复 (Bug F): 鉴权失败 (close code 4001/4002) 时不再无限 3s 重连,
// 改为清 token 跳登录; 普通断开走指数退避, 避免断网时刷屏

let ws = null;
let wsCallbacks = {};
let wsReconnectAttempts = 0;
let wsReconnectTimer = null;
const MAX_RECONNECT_ATTEMPTS = 10;   // 累计失败 10 次后停止
const BASE_RECONNECT_DELAY = 3000;    // 起步 3s
const MAX_RECONNECT_DELAY = 30000;    // 封顶 30s
// 服务端定义的鉴权失败关闭码 (src/web/websocket.ts):
//   4001: No token provided
//   4002: Invalid token
const WS_AUTH_CLOSE_CODES = new Set([4001, 4002]);

/**
 * 鉴权失败: 清 token + 跳登录页 (避免循环重连)
 */
function forceLogout(reason) {
  console.warn('WebSocket force logout:', reason);
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
  } catch {}
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  window.location.href = '/';
}

/**
 * 安排指数退避重连
 */
function scheduleReconnect() {
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('WebSocket: max reconnect attempts reached, giving up');
    return;
  }
  wsReconnectAttempts++;
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, wsReconnectAttempts - 1),
    MAX_RECONNECT_DELAY
  );
  console.log(`WebSocket: reconnect attempt ${wsReconnectAttempts} in ${delay}ms`);
  wsReconnectTimer = setTimeout(connectWS, delay);
}

/**
 * 连接 WebSocket
 */
function connectWS() {
  const token = getToken();
  if (!token) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws?token=${token}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected');
    wsReconnectAttempts = 0;  // 连接成功, 重置重试计数
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (wsCallbacks[data.type]) {
        wsCallbacks[data.type](data);
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  };

  ws.onclose = (event) => {
    console.log('WebSocket disconnected', event.code, event.reason || '');

    // 鉴权失败 → 强制登出, 停止重连
    if (WS_AUTH_CLOSE_CODES.has(event.code)) {
      forceLogout(`auth_failed_${event.code}`);
      return;
    }

    // 普通断开 (1000 正常 / 1006 异常) → 指数退避重连
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

/**
 * 注册回调
 */
function onWSEvent(type, callback) {
  wsCallbacks[type] = callback;
}

/**
 * 发送消息
 */
function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * 取消评测
 */
function cancelEvaluation(evaluationId) {
  sendWS({ type: 'cancel', evaluation_id: evaluationId });
}

// 页面加载时连接
document.addEventListener('DOMContentLoaded', connectWS);
