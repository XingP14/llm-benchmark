// tests/sandbox.test.ts - 沙盒执行器测试

import { PythonSandbox } from '../src/sandbox/python-sandbox';

describe('PythonSandbox', () => {
  const sandbox = new PythonSandbox();

  it('should have correct language', () => {
    expect(sandbox.getLanguage()).toBe('python');
  });

  it('should execute simple add function', async () => {
    const code = 'def add(a, b):\n    return a + b';
    const result = await sandbox.execute(code, '1, 2');
    expect(result.success).toBe(true);
    expect(result.output).toBe('3');
  });

  it('should execute string reverse', async () => {
    const code = 'def reverse_string(s):\n    return s[::-1]';
    const result = await sandbox.execute(code, '"hello"');
    expect(result.success).toBe(true);
    // Python print 输出不带引号
    expect(result.output).toBe('olleh');
  });

  it('should handle syntax errors', async () => {
    const code = 'def broken(:\n    invalid';
    const result = await sandbox.execute(code, '');
    expect(result.success).toBe(false);
  });

  it('should handle function not found', async () => {
    const code = 'x = 1';
    const result = await sandbox.execute(code, '');
    expect(result.success).toBe(false);
  });
});
