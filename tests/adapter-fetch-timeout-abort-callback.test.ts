// tests/adapter-fetch-timeout-abort-callback.test.ts
// 覆盖 src/adapters/adapter.ts 中 `fetchWithTimeout` 的最后一个未覆盖路径:
//   - adapter.ts:63 `setTimeout(() => controller.abort(), timeoutMs)` 的回调本体
//
// 既有 tests/adapter.test.ts 的 "fetchWithTimeout (shared helper)" 只覆盖三条路径:
//   1. fetch resolve → 原样透传 Response
//   2. fetch reject AbortError → 'API 请求超时 (300s)'   (回调本体未执行)
//   3. fetch reject 其他错误 → 原样上抛                  (回调本体未执行)
// 因此 `() => controller.abort()` 箭头函数体从未被调用过, 造成 adapter.ts
// % Funcs 停在 91.66% (13/14), % Stmts 97.95%。本文件补上该路径:
//   - fetch 挂起不 resolve/reject, 直到传入的 init.signal 触发 abort 才 reject AbortError,
//     与真实超时行为 1:1, 从而真正执行 setTimeout 回调本体。
import { fetchWithTimeout } from '../src/adapters/adapter';

describe('fetchWithTimeout real-timeout abort callback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should abort the in-flight request via the setTimeout callback and surface the timeout error', async () => {
    let capturedSignal: AbortSignal | undefined;

    jest.spyOn(globalThis, 'fetch').mockImplementation((_url: any, init: any) => {
      capturedSignal = init?.signal;
      // 永不 settle, 直到 signal abort —— 模拟真实请求挂起直到超时
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError: any = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    });

    await expect(
      fetchWithTimeout('https://api.example.com/hang', { method: 'POST' }, 20)
    ).rejects.toThrow('API 请求超时 (300s)');

    // 回调本体确实执行了: signal 已被置为 aborted
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
  });

  it('should not abort when the request settles before the timeout elapses', async () => {
    const mockResponse = { ok: true, status: 200 };
    let capturedSignal: AbortSignal | undefined;

    jest.spyOn(globalThis, 'fetch').mockImplementation((_url: any, init: any) => {
      capturedSignal = init?.signal;
      return Promise.resolve(mockResponse) as any;
    });

    const result = await fetchWithTimeout(
      'https://api.example.com/fast',
      { method: 'POST' },
      5000
    );

    expect(result).toBe(mockResponse);
    expect(capturedSignal!.aborted).toBe(false);
  });
});
