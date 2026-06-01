// src/benchmarks/function-calling.ts - 工具调用 / Function Calling 评测集

import { BenchmarkQuestion } from '../types';

/**
 * 工具调用评测题扩展接口
 * 描述模型应输出的工具调用形式 (OpenAI tool_calls 格式)
 */
export interface FunctionCallingQuestion extends BenchmarkQuestion {
  /** 题目类型 - 固定 'function_calling' */
  type: 'function_calling';
  /** 可用工具列表 (OpenAI tools schema 简化版) */
  availableTools: Array<{
    name: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  /** 期望的工具调用 (与 availableTools 中 name 对应) */
  expectedToolCall: {
    name: string;
    arguments: Record<string, any>;
  };
  /** 评分时的容差选项 (如日期/时间允许 ±N 秒等) */
  tolerance?: Record<string, number>;
}

/**
 * 工具调用能力评测集 (5 题)
 * 涵盖: 简单参数 / 多工具选择 / 必填参数校验 / 嵌套对象 / 数组参数
 */
export const functionCallingBenchmarks: FunctionCallingQuestion[] = [
  // ========== 1. 简单参数工具调用 ==========
  {
    id: 'fc-basic-001',
    category: 'simple_invocation',
    type: 'function_calling',
    content: '北京今天天气怎么样？',
    availableTools: [
      {
        name: 'get_weather',
        description: '获取指定城市的当前天气',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: '城市名称，例如"北京"' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: '温度单位' },
          },
          required: ['city'],
        },
      },
    ],
    expectedToolCall: {
      name: 'get_weather',
      arguments: { city: '北京' },
    },
    weight: 1.5,
  },

  // ========== 2. 多工具选择 ==========
  {
    id: 'fc-multi-001',
    category: 'tool_selection',
    type: 'function_calling',
    content: '帮我算一下 123 乘以 456 等于多少。',
    availableTools: [
      {
        name: 'get_weather',
        description: '获取天气',
        parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      },
      {
        name: 'calculate',
        description: '执行数学计算（加减乘除）',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: '数学表达式，如 "2 + 3"' },
          },
          required: ['expression'],
        },
      },
      {
        name: 'search_web',
        description: '网页搜索',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ],
    expectedToolCall: {
      name: 'calculate',
      arguments: { expression: '123 * 456' },
    },
    weight: 1.5,
  },

  // ========== 3. 必填参数校验 ==========
  {
    id: 'fc-required-001',
    category: 'parameter_validation',
    type: 'function_calling',
    content: '请给 alice@example.com 发一封邮件，主题是"会议提醒"，内容是"明天上午 10 点开会"。',
    availableTools: [
      {
        name: 'send_email',
        description: '发送邮件',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: '收件人邮箱' },
            subject: { type: 'string', description: '邮件主题' },
            body: { type: 'string', description: '邮件正文' },
            cc: { type: 'string', description: '抄送邮箱（可选）' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
    expectedToolCall: {
      name: 'send_email',
      arguments: {
        to: 'alice@example.com',
        subject: '会议提醒',
        body: '明天上午 10 点开会',
      },
    },
    weight: 2,
  },

  // ========== 4. 嵌套对象参数 ==========
  {
    id: 'fc-nested-001',
    category: 'nested_parameters',
    type: 'function_calling',
    content: '在东京预订一家餐厅：寿司店，2 个人，今晚 7 点。',
    availableTools: [
      {
        name: 'book_restaurant',
        description: '预订餐厅',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            cuisine: { type: 'string' },
            party_size: { type: 'integer' },
            reservation: {
              type: 'object',
              properties: {
                date: { type: 'string', description: 'YYYY-MM-DD' },
                time: { type: 'string', description: 'HH:MM (24h)' },
              },
              required: ['date', 'time'],
            },
          },
          required: ['city', 'cuisine', 'party_size', 'reservation'],
        },
      },
    ],
    expectedToolCall: {
      name: 'book_restaurant',
      arguments: {
        city: '东京',
        cuisine: '寿司',
        party_size: 2,
        reservation: { time: '19:00' },
      },
    },
    weight: 2.5,
  },

  // ========== 5. 数组参数 ==========
  {
    id: 'fc-array-001',
    category: 'array_parameters',
    type: 'function_calling',
    content: '把"项目周报.pdf"和"财务表.xlsx"这两个附件加到名为"Q2 总结"的草稿邮件中。',
    availableTools: [
      {
        name: 'create_draft_email',
        description: '创建草稿邮件',
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            attachments: {
              type: 'array',
              items: { type: 'string' },
              description: '附件文件名列表',
            },
          },
          required: ['subject', 'attachments'],
        },
      },
    ],
    expectedToolCall: {
      name: 'create_draft_email',
      arguments: {
        subject: 'Q2 总结',
        attachments: ['项目周报.pdf', '财务表.xlsx'],
      },
    },
    weight: 2,
  },
];

/**
 * 获取所有工具调用评测题
 */
export function getAllFunctionCallingBenchmarks(): FunctionCallingQuestion[] {
  return functionCallingBenchmarks;
}

/**
 * 按类别获取工具调用评测题
 */
export function getFunctionCallingByCategory(
  category: string
): FunctionCallingQuestion[] {
  return functionCallingBenchmarks.filter((q) => q.category === category);
}
