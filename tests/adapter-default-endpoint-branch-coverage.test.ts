// tests/adapter-default-endpoint-branch-coverage.test.ts
// 补 AnthropicAdapter / DeepSeekAdapter 未覆盖分支:
//   - anthropic-adapter.ts:42 custom endpoint 覆盖默认 endpoint 短路分支
//   - anthropic-adapter.ts:66 content[] 无 text 元素时回落到空字符串
//   - deepseek-adapter.ts:42 custom endpoint 覆盖默认 endpoint 短路分支
import { AnthropicAdapter } from '../src/adapters/anthropic-adapter';
import { DeepSeekAdapter } from '../src/adapters/deepseek-adapter';

const okResponse = (payload: unknown) => ({
  ok: true,
  json: jest.fn().mockResolvedValue(payload),
});

describe('AnthropicAdapter uncovered branches', () => {
  const adapter = new AnthropicAdapter();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use the default endpoint when config.endpoint is empty', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: '',
      apiKey: 'sk-test-key',
      type: 'anthropic',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'sk-test-key' }),
      })
    );
  });

  it('should default to claude-3-haiku when model is empty', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: 'https://proxy.example.com',
      apiKey: 'sk-test-key',
      type: 'anthropic',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://proxy.example.com/v1/messages',
      expect.objectContaining({
        body: expect.stringContaining('"model":"claude-3-haiku-20240307"'),
      })
    );
  });

  it('should respect a user-supplied custom endpoint', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'Hi' }] }) as any);

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: 'https://proxy.example.com',
      apiKey: 'sk-test-key',
      type: 'anthropic',
      model: 'claude-sonnet-4-5',
    });

    expect(fetchSpy.mock.calls[0][0]).toBe('https://proxy.example.com/v1/messages');
    expect(fetchSpy.mock.calls[0][1]?.body).toContain('"model":"claude-sonnet-4-5"');
  });

  it('should return an empty string when content[] has no text element', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ content: [{ type: 'tool_use', id: 't1' }] }) as any);

    const out = await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: 'https://api.anthropic.com',
      apiKey: 'sk-test-key',
      type: 'anthropic',
    });

    expect(out).toBe('');
  });
});

describe('DeepSeekAdapter uncovered branches', () => {
  const adapter = new DeepSeekAdapter();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use the default endpoint when config.endpoint is empty', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        okResponse({ choices: [{ message: { content: 'OK' } }] }) as any
      );

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: '',
      apiKey: 'sk-test-key',
      type: 'deepseek',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"deepseek-chat"'),
      })
    );
  });

  it('should respect a user-supplied custom endpoint and strip the trailing slash', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        okResponse({ choices: [{ message: { content: 'OK' } }] }) as any
      );

    await adapter.chat([{ role: 'user', content: 'Hi' }], {
      name: 'test',
      endpoint: 'https://proxy.example.com/v1/',
      apiKey: 'sk-test-key',
      type: 'deepseek',
      model: 'deepseek-reasoner',
    });

    expect(fetchSpy.mock.calls[0][0]).toBe('https://proxy.example.com/v1/chat/completions');
    expect(fetchSpy.mock.calls[0][1]?.body).toContain('"model":"deepseek-reasoner"');
  });
});
