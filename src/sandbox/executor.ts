// src/sandbox/executor.ts - 沙盒执行器接口

/**
 * 沙盒执行结果
 */
export interface ExecutionResult {
  /** 执行是否成功 */
  success: boolean;
  /** 标准输出 */
  output: string;
  /** 错误信息 */
  error?: string;
  /** 执行耗时 (ms) */
  duration: number;
}

/**
 * 测试用例
 */
export interface TestCase {
  input: string;
  expectedOutput: string;
  description: string;
}

/**
 * 测试结果
 */
export interface TestResult extends TestCase {
  actual: string;
  passed: boolean;
}

/**
 * 沙盒执行器接口
 */
export interface SandboxExecutor {
  /**
   * 执行代码
   * @param code 代码内容
   * @param input 输入参数
   * @returns 执行结果
   */
  execute(code: string, input: string): Promise<ExecutionResult>;

  /**
   * 获取支持的语言
   */
  getLanguage(): string;
}
