// src/benchmarks/long-context.ts - 长上下文理解评测集
// Story 4.1 Step 2 — 需要 32k+ tokens context

import { BenchmarkQuestion } from '../types';

/**
 * 长上下文评测题扩展接口
 * - `content` 字段包含完整长上下文（题目与上下文合在同一字段）
 * - 期望答案放在 `referenceAnswer` 中
 * - `keyFacts` 用于评分时检测关键事实是否都被模型提到
 */
export interface LongContextQuestion extends BenchmarkQuestion {
  type: 'long_context';
  /** 上下文所在字段（与 content 拼接后的总 token 数 >= 32k） */
  contextTokens: number;
  /** 评分时需要在模型回答中命中的关键事实列表（任一命中即得分） */
  keyFacts: string[];
}

/**
 * 生成长上下文填充段落（中文 + 英文交替）
 * 默认约 1 token ≈ 1.5 字符（中英文混合），目标 32k tokens ≈ 48000 字符
 */
function padContext(theme: string, targetChars: number): string {
  const lines: string[] = [];
  lines.push(`[${theme} 上下文开始]`);
  const paragraphs = [
    `${theme}领域的研究在过去数十年间取得了长足进展。来自世界各地的学者、工程师和产业从业者，从不同视角切入，发表了大量论文、专利和技术报告。`,
    `The field of ${theme} has seen rapid development in recent decades. Researchers, engineers, and practitioners worldwide have published numerous papers, patents, and technical reports from different perspectives.`,
    `${theme}的标准化工作也在持续推进。ISO、IEEE、IETF 等组织相继发布了一系列与${theme}相关的国际标准，为产业实践提供了统一的参考。`,
    `Standardization efforts in ${theme} continue to progress. Organizations such as ISO, IEEE, and IETF have published a series of international standards related to ${theme}, providing unified references for industry practice.`,
    `${theme}产业链上下游紧密协同。从基础研究、芯片设计、操作系统、编译器，到上层应用、用户界面、商业模式，每个环节都在快速迭代。`,
    `The ${theme} industry chain involves close collaboration across upstream and downstream sectors—from basic research, chip design, operating systems, and compilers, to upper-layer applications, user interfaces, and business models—with rapid iteration in every segment.`,
  ];
  let cur = '';
  let i = 0;
  while (cur.length < targetChars) {
    cur += paragraphs[i % paragraphs.length] + '\n\n';
    i++;
  }
  lines.push(cur.trim());
  lines.push(`[${theme} 上下文结束]`);
  return lines.join('\n');
}

/**
 * 长上下文理解能力评测集 (3 题)
 * 涵盖: 海量文档中关键事实检索 / 长文档关键信息提取 / 多文档交叉对比
 *
 * 每题总 content 长度 ≥ 32000 tokens (≈ 48000 中英文字符)
 */
export const longContextBenchmarks: LongContextQuestion[] = [
  // ========== 1. 大海捞针: 关键事实检索 ==========
  (() => {
    const needle = '隐藏关键事实:2026 年 6 月 1 日凌晨,代号"晨星"的项目在杭州启动,首期投入 18.7 亿元人民币,牵头人为林承志博士。';
    const filler = padContext('人工智能产业', 46000);
    // 把 needle 插入中间位置
    const half = Math.floor(filler.length / 2);
    const contextWithNeedle = filler.slice(0, half) + '\n\n' + needle + '\n\n' + filler.slice(half);
    return {
      id: 'lc-needle-001',
      category: 'needle_in_haystack',
      type: 'long_context' as const,
      content: `${contextWithNeedle}\n\n---\n\n请阅读上面的全部内容,回答:代号"晨星"的项目在哪个城市启动?首期投入多少人民币?牵头人是谁?`,
      referenceAnswer: '杭州,18.7 亿元,林承志',
      keyFacts: ['杭州', '18.7 亿', '林承志'],
      contextTokens: 32000,
      weight: 2.0,
    };
  })(),

  // ========== 2. 长文档关键信息提取 ==========
  (() => {
    const summaryNeedle = '本研究的核心结论是:在 10 万亿参数规模下,稀疏激活模型相比稠密模型能效比提升 4.2 倍,但需要 3 倍的通信带宽支撑。';
    const filler = padContext('机器学习系统优化', 46000);
    const half = Math.floor(filler.length / 2);
    const contextWithNeedle = filler.slice(0, half) + '\n\n' + summaryNeedle + '\n\n' + filler.slice(half);
    return {
      id: 'lc-extract-002',
      category: 'long_doc_extraction',
      type: 'long_context' as const,
      content: `${contextWithNeedle}\n\n---\n\n请阅读上面的全部内容,用一段话总结该研究的核心结论,需要包含:模型规模、能效比倍数、通信带宽需求倍数。`,
      referenceAnswer: '稀疏激活模型在 10 万亿参数规模下,能效比比稠密模型提升 4.2 倍,但需要 3 倍通信带宽。',
      keyFacts: ['10 万亿', '4.2 倍', '3 倍', '稀疏激活'],
      contextTokens: 32000,
      weight: 2.0,
    };
  })(),

  // ========== 3. 多文档交叉对比 ==========
  (() => {
    const doc1 = padContext('数据库技术演进', 15500);
    const doc2 = padContext('分布式系统设计', 15500);
    const doc3 = padContext('云原生架构实践', 15500);
    const answer = 'PostgreSQL 16(2023年发布)在 HTAP 场景下的写吞吐比 MySQL 8.0 高 23%,且支持逻辑复制槽。';
    const answerNeedle2 = '该分布式系统采用 Raft 一致性算法,Leader 选举平均耗时 280ms。';
    const content =
      `[文档 A]\n${doc1}\n\n[文档 A 关键结论]\n${answer}\n\n` +
      `[文档 B]\n${doc2}\n\n[文档 B 关键结论]\n${answerNeedle2}\n\n` +
      `[文档 C]\n${doc3}\n\n---\n\n请阅读三份文档,回答两个问题:\n(1) PostgreSQL 16 相比 MySQL 8.0 在 HTAP 写吞吐上高多少?\n(2) 文档 B 提到的 Raft 算法 Leader 选举平均耗时是多少?`;
    return {
      id: 'lc-multi-003',
      category: 'multi_doc_comparison',
      type: 'long_context' as const,
      content,
      referenceAnswer: '23%;280ms',
      keyFacts: ['23%', '280ms', 'Raft'],
      contextTokens: 32000,
      weight: 2.5,
    };
  })(),
];

/**
 * 获取所有长上下文评测题
 */
export function getAllLongContextBenchmarks(): LongContextQuestion[] {
  return longContextBenchmarks;
}

/**
 * 按类别获取长上下文评测题
 */
export function getLongContextByCategory(category: string): LongContextQuestion[] {
  return longContextBenchmarks.filter((q) => q.category === category);
}
