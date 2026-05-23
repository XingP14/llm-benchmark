// src/sandbox/python-sandbox.ts - Python 沙盒执行器

import { SandboxExecutor, ExecutionResult } from './executor';
import { spawn } from 'child_process';

export class PythonSandbox implements SandboxExecutor {
  private timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  getLanguage(): string {
    return 'python';
  }

  async execute(code: string, input: string): Promise<ExecutionResult> {
    const start = Date.now();

    try {
      // 提取函数名
      const funcMatch = code.match(/def\s+(\w+)\s*\(/);
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
      const testCode = `${code}\n\nresult = ${funcName}(${input})\nprint(result)`;

      return await new Promise((resolve) => {
        const proc = spawn('python3', ['-c', testCode], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          resolve({
            success: code === 0,
            output: stdout.trim(),
            error: stderr || undefined,
            duration: Date.now() - start,
          });
        });

        // 超时处理
        setTimeout(() => {
          proc.kill();
          resolve({
            success: false,
            output: stdout.trim(),
            error: '执行超时',
            duration: Date.now() - start,
          });
        }, this.timeout);
      });
    } catch (err) {
      return {
        success: false,
        output: '',
        error: String(err),
        duration: Date.now() - start,
      };
    }
  }
}
