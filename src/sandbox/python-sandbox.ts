// src/sandbox/python-sandbox.ts - Python 沙盒执行器

import { SandboxExecutor, ExecutionResult } from './executor';
import { errorMessage } from '../errors';
import { spawn } from 'child_process';

export class PythonSandbox implements SandboxExecutor {
  private timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  getLanguage(): string {
    return 'python';
  }

  /**
   * 从 markdown 文本中提取 Python 代码
   * 优先提取 ```python ... ``` 块，其次提取 ``` ... ``` 块
   * 如果都没有，直接返回原文
   */
  private extractPythonCode(text: string): string {
    // 1. 尝试匹配 ```python ... ``` 代码块
    const pythonBlockRegex = /```python\s*\n([\s\S]*?)```/;
    const pythonMatch = text.match(pythonBlockRegex);
    if (pythonMatch) {
      return pythonMatch[1].trim();
    }

    // 2. 尝试匹配 ```py ... ``` 代码块
    const pyBlockRegex = /```py\s*\n([\s\S]*?)```/;
    const pyMatch = text.match(pyBlockRegex);
    if (pyMatch) {
      return pyMatch[1].trim();
    }

    // 3. 尝试匹配第一个 ``` ... ``` 代码块（可能是无语言标记的）
    const anyBlockRegex = /```\w*\s*\n([\s\S]*?)```/;
    const anyMatch = text.match(anyBlockRegex);
    if (anyMatch) {
      const code = anyMatch[1].trim();
      // 只有包含 def 的才认为是 Python 代码
      if (code.includes('def ')) {
        return code;
      }
    }

    // 4. 回退：直接返回原文（兼容旧行为）
    return text;
  }

  async execute(code: string, input: string): Promise<ExecutionResult> {
    const start = Date.now();

    try {
      // 先从 markdown 中提取纯 Python 代码
      const cleanCode = this.extractPythonCode(code);

      // 提取函数名
      const funcMatch = cleanCode.match(/def\s+(\w+)\s*\(/);
      if (!funcMatch) {
        return {
          success: false,
          output: '',
          error: '无法提取函数名',
          duration: 0,
        };
      }

      const funcName = funcMatch[1];
      
      // 构建测试代码
      const testCode = `${cleanCode}\n\nresult = ${funcName}(${input})\nprint(result)`;

      return await new Promise((resolve) => {
        const proc = spawn('python3', ['-c', testCode], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timeoutHandle = setTimeout(() => {
          if (settled) return;
          settled = true;
          proc.kill();
          resolve({
            success: false,
            output: stdout.trim(),
            error: '执行超时',
            duration: Date.now() - start,
          });
        }, this.timeout);

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          resolve({
            success: code === 0,
            output: stdout.trim(),
            error: stderr || undefined,
            duration: Date.now() - start,
          });
        });
      });
    } catch (err: unknown) {
      return {
        success: false,
        output: '',
        error: errorMessage(err),
        duration: Date.now() - start,
      };
    }
  }
}
