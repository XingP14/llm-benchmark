// public/js/configs.js - 配置管理

let configs = [];

/**
 * 加载配置列表
 */
async function loadConfigs() {
  try {
    const res = await apiRequest('/configs');
    configs = await res.json();
    renderConfigs();
    renderConfigSelector();
  } catch (err) {
    console.error('Failed to load configs:', err);
  }
}

/**
 * 渲染配置卡片
 */
function renderConfigs() {
  const container = document.getElementById('configsList');
  if (!container) return;

  if (configs.length === 0) {
    container.innerHTML = '<p style="color: #666;">暂无配置，请点击"新增配置"添加</p>';
    return;
  }

  container.innerHTML = configs.map(c => `
    <div class="config-card">
      <div class="info">
        <div class="name">${escapeHtml(c.name)}</div>
        <div class="details">
          类型: ${c.type} | 模型: ${c.model || '-'} | 
          端点: ${c.endpoint.replace(/\/[^/]+$/, '/...')}
        </div>
      </div>
      <div class="actions">
        <button class="secondary" onclick="editConfig(${c.id})">编辑</button>
        <button class="danger" onclick="deleteConfig(${c.id})">删除</button>
      </div>
    </div>
  `).join('');
}

/**
 * 渲染配置选择器
 */
function renderConfigSelector() {
  const container = document.getElementById('configSelector');
  if (!container) return;

  if (configs.length === 0) {
    container.innerHTML = '<p style="color: #666;">请先添加 LLM 配置</p>';
    return;
  }

  container.innerHTML = configs.map(c => `
    <label>
      <input type="checkbox" class="config-checkbox" value="${c.id}">
      ${escapeHtml(c.name)} (${c.type}${c.model ? ' - ' + c.model : ''})
    </label>
  `).join('');
}

/**
 * 打开模态框
 */
function openModal(editId = null) {
  const modal = document.getElementById('configModal');
  const form = document.getElementById('configForm');
  const title = document.getElementById('modalTitle');

  form.reset();
  document.getElementById('configId').value = '';

  if (editId) {
    const config = configs.find(c => c.id === editId);
    if (config) {
      title.textContent = '编辑配置';
      document.getElementById('configId').value = config.id;
      document.getElementById('configName').value = config.name;
      document.getElementById('configType').value = config.type;
      document.getElementById('configEndpoint').value = config.endpoint;
      document.getElementById('configApiKey').value = '';
      document.getElementById('configModel').value = config.model || '';
    }
  } else {
    title.textContent = '新增配置';
    // 设置默认 endpoint
    document.getElementById('configEndpoint').value = 'https://api.openai.com/v1';
    document.getElementById('configType').addEventListener('change', updateDefaultEndpoint);
    updateDefaultEndpoint();
  }

  modal.classList.remove('hidden');
}

/**
 * 更新默认 endpoint
 */
function updateDefaultEndpoint() {
  const type = document.getElementById('configType').value;
  const endpointInput = document.getElementById('configEndpoint');
  
  const defaults = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    glm: 'https://open.bigmodel.cn/api/paas/v4',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ollama: 'http://localhost:11434/v1'
  };
  
  if (!endpointInput.value || Object.values(defaults).includes(endpointInput.value)) {
    endpointInput.value = defaults[type] || defaults.openai;
  }
}

/**
 * 关闭模态框
 */
function closeModal() {
  document.getElementById('configModal').classList.add('hidden');
}

/**
 * 编辑配置
 */
function editConfig(id) {
  openModal(id);
}

/**
 * 删除配置
 */
async function deleteConfig(id) {
  if (!confirm('确定要删除这个配置吗？')) return;

  try {
    const res = await apiRequest(`/configs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadConfigs();
    }
  } catch (err) {
    console.error('Failed to delete config:', err);
  }
}

/**
 * 保存配置
 */
async function saveConfig(e) {
  e.preventDefault();

  const id = document.getElementById('configId').value;
  const data = {
    name: document.getElementById('configName').value,
    type: document.getElementById('configType').value,
    endpoint: document.getElementById('configEndpoint').value,
    api_key: document.getElementById('configApiKey').value || undefined,
    model: document.getElementById('configModel').value || undefined
  };

  // 移除空 API key（编辑时）
  if (!data.api_key) delete data.api_key;
  if (!data.model) delete data.model;

  try {
    let res;
    if (id) {
      // 更新时如果没填 API key，保留原值
      if (!data.api_key) {
        const existing = configs.find(c => c.id === parseInt(id));
        data.api_key = 'placeholder'; // 后端应该忽略
      }
      res = await apiRequest(`/configs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      res = await apiRequest('/configs', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    if (res.ok) {
      closeModal();
      loadConfigs();
    }
  } catch (err) {
    console.error('Failed to save config:', err);
  }
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

  const addBtn = document.getElementById('addConfigBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openModal());
  }

  const form = document.getElementById('configForm');
  if (form) {
    form.addEventListener('submit', saveConfig);
  }

  loadConfigs();
});
