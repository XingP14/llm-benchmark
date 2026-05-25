// tests/web/mocks.ts - Mock 设置

// Mock adapters for testing
export const mockOpenAIAdapter = {
  chat: jest.fn().mockResolvedValue('Mock response from OpenAI'),
};

export const mockAnthropicAdapter = {
  chat: jest.fn().mockResolvedValue('Mock response from Anthropic'),
};

export const mockGLMAdapter = {
  chat: jest.fn().mockResolvedValue('Mock response from GLM'),
};

export const mockSandbox = {
  execute: jest.fn().mockResolvedValue({ success: true, output: 'Test output' }),
};

export function resetMocks(): void {
  mockOpenAIAdapter.chat.mockClear();
  mockAnthropicAdapter.chat.mockClear();
  mockGLMAdapter.chat.mockClear();
  mockSandbox.execute.mockClear();
}
