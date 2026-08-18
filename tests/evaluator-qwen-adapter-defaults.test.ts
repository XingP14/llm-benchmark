// tests/evaluator-qwen-adapter-defaults.test.ts - 补 QwenAdapter 默认 endpoint + 默认 model 单测
import { QwenAdapter } from '../src/adapters/qwen-adapter';

describe('QwenAdapter defaults (08-18 22:03 cron step-lb-1)', () => {
  const adapter = new QwenAdapter();

  it('should default to DashScope endpoint when endpoint is empty', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
      }),
    };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adapter.chat(
      [{ role: 'user', content: 'Hi' }],
      { name: 'test', endpoint: '', apiKey: 'test-key', type: 'qwen', model: 'qwen-plus' }
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"qwen-plus"'),
      })
    );
    jest.restoreAllMocks();
  });

  it('should default to qwen-turbo when model is empty', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'OK' } }],
      }),
    };
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

    await adapter.chat(
      [{ role: 'user', content: 'Hi' }],
      { name: 'test', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'test-key', type: 'qwen' }
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"model":"qwen-turbo"'),
      })
    );
    jest.restoreAllMocks();
  });
});
