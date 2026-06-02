// src/benchmarks/multi-turn.ts - 多轮对话一致性评测集
// Story 4.1 Step 3 — 考察模型在多轮对话中保持上下文/角色/逻辑一致性的能力

import { BenchmarkQuestion } from '../types';

/**
 * 多轮对话评测题扩展接口
 * - `turns` 字段为按顺序的多轮消息（user/assistant 交替）
 * - 最后一轮 user 消息为"问题轮"，模型对该轮的回复被作为评分对象
 * - `consistencyCheck.required` 必须在模型回复中出现的关键短语（用于"记住了 / 没跑题 / 不矛盾"判定）
 * - `consistencyCheck.forbidden` 不应出现在模型回复中的关键短语（用于"自相矛盾 / 角色越界"判定）
 */
export interface MultiTurnQuestion extends BenchmarkQuestion {
  type: 'multi_turn';
  /** 多轮对话，按顺序发送（最后一轮通常是 user，作为问题轮） */
  turns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  /** 一致性校验规则 */
  consistencyCheck: {
    /** 必须出现（用于上下文保留 / 角色一致 / 关键事实） */
    required: string[];
    /** 不应出现（用于矛盾检测 / 角色越界） */
    forbidden: string[];
  };
}

/**
 * 多轮对话一致性能力评测集 (3 题)
 * 涵盖: 上下文保留（事实记忆）/ 角色一致性（persona 不跑题）/ 逻辑一致性（不自相矛盾）
 */
export const multiTurnBenchmarks: MultiTurnQuestion[] = [
  // ========== 1. 上下文保留: 3 轮后记住关键事实 ==========
  {
    id: 'mt-context-001',
    category: 'context_retention',
    type: 'multi_turn' as const,
    content: '',
    turns: [
      { role: 'user', content: '我养了一只猫,叫"豆豆",今年 3 岁,喜欢玩逗猫棒。' },
      { role: 'assistant', content: '豆豆听起来很可爱! 3 岁的猫正是活泼好动的年纪,逗猫棒是消耗它精力的好玩具。' },
      { role: 'user', content: '它最近开始挑食了,医生建议换粮。' },
      { role: 'assistant', content: '换粮要循序渐进,把新粮和旧粮按 1:3 比例混合,逐步过渡 7 天,避免肠胃不适。' },
      { role: 'user', content: '好的。请你帮我总结一下:我家猫叫什么?今年几岁?平时玩什么?最近有什么新状况?' },
    ],
    referenceAnswer: '豆豆 / 3 岁 / 逗猫棒 / 挑食换粮',
    consistencyCheck: {
      required: ['豆豆', '3 岁', '逗猫棒', '挑食'],
      forbidden: ['狗', '4 岁', '5 岁', '2 岁'],
    },
    weight: 2.0,
  },

  // ========== 2. 角色一致性: 维持 persona 不跑题 ==========
  {
    id: 'mt-persona-002',
    category: 'persona_consistency',
    type: 'multi_turn' as const,
    content: '',
    turns: [
      { role: 'system', content: '你现在扮演一位资深中餐厨师,只用中文回答,语气专业亲切,菜名会标注关键食材与火候要点。' },
      { role: 'user', content: '师傅,我冰箱里有鸡蛋、西红柿、葱花,能做什么?' },
      { role: 'assistant', content: '可以做经典的西红柿炒蛋! 鸡蛋 3 个打散加少许盐,西红柿切块,热锅冷油先炒蛋至七分熟盛出,再下西红柿炒出汁,回蛋翻匀撒葱花即可。' },
      { role: 'user', content: '那如果我改用鹌鹑蛋呢?口感会有什么不同?' },
      { role: 'assistant', content: '鹌鹑蛋体积小,建议 6-8 颗替代 3 个鸡蛋,口感更嫩滑,炒制时间缩短到 30 秒内,出锅前点几滴香油提鲜。' },
      { role: 'user', content: '最后一个问题:除了炒,你推荐哪种做法最能体现鹌鹑蛋的嫩?' },
    ],
    referenceAnswer: '推荐水煮/溏心/蒸蛋羹等低温做法',
    consistencyCheck: {
      required: ['鹌鹑蛋'],
      forbidden: ['汉堡', '披萨', '薯条', '可乐', '西餐'],
    },
    weight: 2.0,
  },

  // ========== 3. 逻辑一致性: 不自相矛盾 ==========
  {
    id: 'mt-logic-003',
    category: 'logical_consistency',
    type: 'multi_turn' as const,
    content: '',
    turns: [
      { role: 'user', content: '我钱包里原本有 1000 元,今天上午买了本书花 180 元,中午买午饭花 35 元。' },
      { role: 'assistant', content: '上午花 180 元、午饭 35 元,合计 215 元,还剩 785 元。' },
      { role: 'user', content: '下午朋友还了我 500 元借款,晚上我请客吃饭花 220 元。' },
      { role: 'assistant', content: '下午进账 500 元、晚上支出 220 元,余额 785 + 500 - 220 = 1065 元。' },
      { role: 'user', content: '好的。那我今天总共花出去多少钱?晚上吃饭花多少?现在钱包里还剩多少?' },
    ],
    referenceAnswer: '总支出 180+35+220=435;晚饭 220;余额 1065',
    consistencyCheck: {
      required: ['435', '220', '1065'],
      forbidden: ['785', '1000', '500'],
    },
    weight: 2.5,
  },
];

/**
 * 获取所有多轮对话一致性评测题
 */
export function getAllMultiTurnBenchmarks(): MultiTurnQuestion[] {
  return multiTurnBenchmarks;
}

/**
 * 按类别获取多轮对话评测题
 */
export function getMultiTurnByCategory(category: string): MultiTurnQuestion[] {
  return multiTurnBenchmarks.filter((q) => q.category === category);
}
