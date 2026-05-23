// public/js/websocket.js - WebSocket 客户端

let ws = null;
let wsCallbacks = {};

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

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    // 自动重连
    setTimeout(connectWS, 3000);
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
