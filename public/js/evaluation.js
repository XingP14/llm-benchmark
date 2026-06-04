// public/js/evaluation.js - 评测管理

let currentEvaluationId = null;

/**
 * 加载评测历史
 */
async function loadHistory() {
  try {
    const res = await apiRequest('/evaluations');
    const history = await res.json();
    renderHistory(history);
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

/**
 * 渲染历史记录
 */
function renderHistory(history) {
  const container = document.getElementById('historyList');
  if (!container) return;

  if (history.length === 0) {
    container.innerHTML = '<p style="color: #666;">暂无评测记录</p>';
    return;
  }

  container.innerHTML = history.map(h => `
    <div class="history-item" onclick="viewResult('${h.id}')">
      <div>
        <span class="status ${h.status}">${h.status}</span>
        <strong>${h.config_names || '未知'}</strong>
        <span style="color: #666; font-size: 13px; margin-left: 10px;">
          ${h.include_dialogue ? '对话+' : ''}${h.include_coding ? '代码' : ''}
        </span>
      </div>
      <div style="color: #666; font-size: 12px; margin-top: 5px;">
        ${new Date(h.created_at).toLocaleString('zh-CN')}
        ${h.started_at ? `<br>耗时: ${calcDuration(h.started_at, h.completed_at)}` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * 计算耗时
 */
function calcDuration(start, end) {
  if (!start || !end) return '-';
  const ms = new Date(end) - new Date(start);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60}秒`;
}

/**
 * 查看结果
 */
async function viewResult(id) {
  try {
    const res = await apiRequest(`/evaluations/${id}/results`);
    const data = await res.json();
    showResult(data);
  } catch (err) {
    console.error('Failed to load result:', err);
  }
}

/**
 * 显示结果
 */
function showResult(data) {
  document.getElementById('historySection').classList.add('hidden');
  document.getElementById('resultSection').classList.remove('hidden');

  const { evaluation, results } = data;

  let html = `
    <p style="margin-bottom: 20px;">
      <strong>评测状态:</strong> <span class="status ${evaluation.status}">${evaluation.status}</span>
      ${evaluation.started_at ? `<br><strong>开始时间:</strong> ${new Date(evaluation.started_at).toLocaleString('zh-CN')}` : ''}
      ${evaluation.completed_at ? `<br><strong>完成时间:</strong> ${new Date(evaluation.completed_at).toLocaleString('zh-CN')}` : ''}
    </p>
  `;

  if (results.length === 0) {
    html += '<p>暂无结果</p>';
  } else {
    html += `
      <table class="ranking-table">
        <thead>
          <tr>
            <th>排名</th>
            <th>模型</th>
            <th>总分</th>
            <th>对话能力</th>
            <th>代码能力</th>
            <th>工具调用</th>
            <th>长上下文</th>
            <th>多轮对话</th>
          </tr>
        </thead>
        <tbody>
    `;

    results.forEach(r => {
      html += `
        <tr>
          <td class="rank-${r.rank}">${r.rank <= 3 ? ['🥇','🥈','🥉'][r.rank-1] : r.rank}</td>
          <td><strong>${escapeHtml(r.config.name)}</strong></td>
          <td>
            ${r.total_score}
            <div class="score-bar"><div class="fill total" style="width: ${r.total_score}%;">${r.total_score}</div></div>
          </td>
          <td>
            ${r.dialogue_score}
            <div class="score-bar"><div class="fill dialogue" style="width: ${r.dialogue_score}%;">${r.dialogue_score}</div></div>
          </td>
          <td>
            ${r.coding_score}
            <div class="score-bar"><div class="fill coding" style="width: ${r.coding_score}%;">${r.coding_score}</div></div>
          </td>
          <td>
            ${r.function_calling_score}
            <div class="score-bar"><div class="fill function-calling" style="width: ${r.function_calling_score}%;">${r.function_calling_score}</div></div>
          </td>
          <td>
            ${r.long_context_score}
            <div class="score-bar"><div class="fill long-context" style="width: ${r.long_context_score}%;">${r.long_context_score}</div></div>
          </td>
          <td>
            ${r.multi_turn_score}
            <div class="score-bar"><div class="fill multi-turn" style="width: ${r.multi_turn_score}%;">${r.multi_turn_score}</div></div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    // 题目详情
    html += '<h3 style="margin-top: 30px;">题目详情</h3>';
    results.forEach(r => {
      html += `
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4>${escapeHtml(r.config.name)}</h4>
      `;
      r.question_results.forEach(q => {
        html += `
          <div style="margin-top: 15px; padding: 10px; background: white; border-radius: 5px;">
            <div style="display: flex; justify-content: space-between;">
              <strong>${q.question_id}</strong>
              <span>得分: <strong>${q.score}</strong>/100</span>
            </div>
            <div style="font-size: 13px; color: #666; margin-top: 5px;">
              类型: ${q.question_type} | 分类: ${q.category}
            </div>
            <div style="margin-top: 10px;">
              <strong>题目:</strong>
              <div class="model-output">${escapeHtml(q.model_output?.substring(0, 500) || '-')}</div>
            </div>
            ${q.reference_answer ? `
              <div style="margin-top: 10px;">
                <strong>参考答案:</strong>
                <div class="model-output">${escapeHtml(q.reference_answer)}</div>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += '</div>';
    });
  }

  document.getElementById('resultContent').innerHTML = html;
}

/**
 * 返回列表
 */
function backToList() {
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('historySection').classList.remove('hidden');
  loadHistory();
}

/**
 * 开始评测
 */
async function startEvaluation() {
  const checkboxes = document.querySelectorAll('.config-checkbox:checked');
  const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

  if (selectedIds.length === 0) {
    alert('请选择至少一个 LLM 配置');
    return;
  }

  const dialogue = document.getElementById('dialogueCheck').checked;
  const coding = document.getElementById('codingCheck').checked;
  const functionCalling = document.getElementById('functionCallingCheck')?.checked ?? false;
  const longContext = document.getElementById('longContextCheck')?.checked ?? false;
  const multiTurn = document.getElementById('multiTurnCheck')?.checked ?? false;

  if (!dialogue && !coding && !functionCalling && !longContext && !multiTurn) {
    alert('请选择至少一种评测类型');
    return;
  }

  try {
    const res = await apiRequest('/evaluations', {
      method: 'POST',
      body: JSON.stringify({
        config_ids: selectedIds,
        dialogue,
        coding,
        function_calling: functionCalling,
        long_context: longContext,
        multi_turn: multiTurn
      })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || '启动评测失败');
      return;
    }

    currentEvaluationId = data.evaluation_id;
    showProgress();

  } catch (err) {
    console.error('Failed to start evaluation:', err);
    alert('启动评测失败: ' + err.message);
  }
}

/**
 * 显示进度
 */
function showProgress() {
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('startEvalBtn').disabled = true;
  document.getElementById('progressFill').style.width = '0%';
  document.getElementById('progressFill').textContent = '0%';
  document.getElementById('progressText').textContent = '准备开始...';
}

/**
 * 更新进度
 */
function updateProgress(data) {
  document.getElementById('progressFill').style.width = data.progress + '%';
  document.getElementById('progressFill').textContent = data.progress + '%';
  document.getElementById('progressText').textContent = 
    `正在评测 ${data.config_name}: ${data.current}/${data.total} (${data.question_id})`;
}

/**
 * 完成评测
 */
function evaluationCompleted(data) {
  document.getElementById('progressFill').style.width = '100%';
  document.getElementById('progressFill').textContent = '100%';
  document.getElementById('progressText').textContent = '评测完成！';
  document.getElementById('startEvalBtn').disabled = false;

  // 延迟刷新历史
  setTimeout(() => {
    loadHistory();
  }, 2000);
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

  const startBtn = document.getElementById('startEvalBtn');
  if (startBtn) {
    startBtn.addEventListener('click', startEvaluation);
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', backToList);
  }

  // WebSocket 回调
  onWSEvent('start', (data) => {
    currentEvaluationId = data.evaluation_id;
    showProgress();
  });

  onWSEvent('progress', updateProgress);
  onWSEvent('completed', evaluationCompleted);
  onWSEvent('cancelled', (data) => {
    document.getElementById('progressText').textContent = '评测已取消';
    document.getElementById('startEvalBtn').disabled = false;
  });
  onWSEvent('error', (data) => {
    document.getElementById('progressText').textContent = '错误: ' + data.message;
    document.getElementById('startEvalBtn').disabled = false;
  });

  loadHistory();
});
