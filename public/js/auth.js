// public/js/auth.js - 认证相关

const API_BASE = '/api';

/**
 * 获取认证 token
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * 检查是否已登录
 */
function checkAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/';
    return false;
  }
  return true;
}

/**
 * 获取请求头
 */
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
}

/**
 * API 请求
 */
async function apiRequest(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    window.location.href = '/';
    throw new Error('Unauthorized');
  }

  return res;
}

/**
 * 登出
 */
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.href = '/';
}

// 登出按钮
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  const userDisplay = document.getElementById('userDisplay');
  if (userDisplay) {
    const username = localStorage.getItem('username');
    if (username) {
      userDisplay.textContent = `欢迎, ${username}`;
    }
  }
});
