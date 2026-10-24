// src/sandbox/python-sandbox.ts - Python 沙盒执行器

import { SandboxExecutor, ExecutionResult } from './executor';
import { errorMessage } from '../errors';
import { spawn } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The environment a sandbox child is allowed to see.
 *
 * R501 安全修复: the code executed by this sandbox is MODEL-GENERATED — it is
 * the `model_output` of a coding benchmark, submitted by whoever configured
 * the model under test. `spawn()` inherits the parent's environment by
 * default, so every one of those children used to see the FULL environment of
 * the process that launched it. Measured over the real production class
 * (`PythonSandbox.execute`, no mock, no re-implementation):
 *
 *   - `os.environ['JWT_SECRET']`      -> the live JWT signing secret
 *   - `os.environ['ADMIN_PASSWORD']`  -> the live admin password
 *
 * Both are the credentials the web server authenticates with
 * (src/web/config.ts), and both are the ones docker-compose injects
 * (docker-compose.yml). A model that produced a coding answer containing
 * `import os; print(os.environ)` therefore exfiltrated them into the
 * `results` table's `model_output` column, which GET /api/evaluations/:id/
 * results hands back to any authenticated caller.
 *
 * Worse, the child also inherited the parent's CWD, so `sqlite3.connect(
 * 'data/llm-bench.db')` opened the LIVE benchmark database — measured: the
 * child read the `configs` table (where every model API key is stored) and
 * successfully INSERTed a row into it.
 *
 * So the fix has two halves, and both are load-bearing:
 *
 *   1. ENV: the child gets an EXPLICIT allow-list, never the inherited
 *      environment. Anything not named here is absent, so a future secret
 *      added to the parent process does not leak by default.
 *   2. CWD: the child runs in a fresh, empty temporary directory, so a
 *      relative path cannot reach the server's data directory.
 *
 * PATH is kept because the child is `python3`; the interpreter itself is
 * resolved by the OS through PATH. HOME is deliberately NOT passed: it points
 * at the server user's home, where credential files (e.g. ~/.npmrc,
 * ~/.git-credentials, ~/.aws) live.
 *
 * The allow-list is the point; the denylist is not. A denylist of "known
 * secret names" fails the moment a new secret is introduced, and this
 * repository has an INTERNAL_JWT_SECRET-style family of env vars that grow.
 */
export const SANDBOX_ENV_ALLOWLIST = ['PATH', 'LANG', 'LC_ALL', 'TZ'] as const;

/**
 * Build the environment for a sandbox child.
 *
 * Exported so the contract is testable without spawning anything: the
 * security property is "the child's environment contains no value that the
 * parent had, except the allow-listed names", and that is a statement about
 * a plain object.
 */
export function buildSandboxEnv(
  parentEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of SANDBOX_ENV_ALLOWLIST) {
    const value = parentEnv[name];
    if (typeof value === 'string') env[name] = value;
  }
  return env;
}

export class PythonSandbox implements SandboxExecutor {
  private timeout: number;
  /**
   * The CWD every sandbox child runs in.
   *
   * R501 安全修复: it must be a directory that contains NOTHING the server
   * owns. The inherited CWD (the repo root in dev, /app in Docker) holds
   * `data/llm-bench.db` — the live database whose `configs` table stores every
   * model provider API key. A relative `sqlite3.connect('data/llm-bench.db')`
   * from that CWD opens it. Measured before this fix: the child read the
   * `configs` table and INSERTed a row into the live DB.
   *
   * The directory is created lazily and is intentionally EMPTY — it is not a
   * scratch dir the code can persist state between runs into, and it is not
   * under the server's data directory, so nothing written there can be
   * confused with server state.
   */
  private workDir: string | null = null;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  /**
   * Create (once) and return the isolated working directory.
   *
   * `mkdtempSync` gives a directory that is unique to this process, so two
   * concurrently running evaluations cannot see each other's files. A failure
   * here (read-only tmp, quota) must NOT silently fall back to the inherited
   * CWD — that fallback is exactly the vulnerability, so it fails closed: the
   * child is spawned with the temp root instead, which at least is not the
   * server's working directory.
   */
  private getWorkDir(): string {
    if (this.workDir === null) {
      try {
        this.workDir = mkdtempSync(join(tmpdir(), 'llm-bench-sandbox-'));
      } catch {
        // Fail closed: never fall back to the inherited CWD (that IS the
        // vulnerability). The temp ROOT is not the server's working
        // directory, so it is a strictly safer fallback than cwd-less.
        this.workDir = tmpdir();
      }
    }
    return this.workDir;
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
        // R501 安全修复: `env` is an EXPLICIT allow-list and `cwd` is a fresh
        // empty temp dir, so a model-generated child sees neither the
        // server's secrets (JWT_SECRET / ADMIN_PASSWORD / ...) nor the
        // server's data directory (data/llm-bench.db). See the JSDoc on
        // buildSandboxEnv for the measurement that motivated this.
        const proc = spawn('python3', ['-c', testCode], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: buildSandboxEnv(),
          cwd: this.getWorkDir(),
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

        // spawn() does NOT throw when the binary is missing -- it emits an
        // 'error' event on the next tick. Without this listener Node re-throws
        // it as an uncaught exception and takes down the caller (the CLI or the
        // web server) instead of surfacing a failure verdict. A missing optional
        // interpreter is a user-facing error message, not a crash.
        proc.on('error', (err: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          resolve({
            success: false,
            output: stdout.trim(),
            error: errorMessage(err),
            duration: Date.now() - start,
          });
        });

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
