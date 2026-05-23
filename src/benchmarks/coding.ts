// src/benchmarks/coding.ts - 代码能力评测集

import { BenchmarkQuestion, CodeTestCase } from '../types';

/**
 * 代码能力评测集
 * 涵盖: 语法正确性、逻辑正确性、代码质量、算法效率
 */
interface CodeBenchmarkQuestion extends BenchmarkQuestion {
  language: string;
  starterCode?: string;
  testCases: CodeTestCase[];
  complexity?: string;
}

export const codeBenchmarks: CodeBenchmarkQuestion[] = [
  // ========== 基础语法 ==========
  {
    id: 'code-basic-001',
    category: 'syntax',
    type: 'coding',
    language: 'python',
    content: '写一个函数，计算两个数的和并返回。',
    weight: 1,
    testCases: [
      { input: '1, 2', expectedOutput: '3', description: '正数相加' },
      { input: '-1, 1', expectedOutput: '0', description: '正负相加' },
      { input: '0, 0', expectedOutput: '0', description: '零相加' },
    ],
    starterCode: 'def add(a, b):\n    # your code here\n    pass',
  },
  {
    id: 'code-basic-002',
    category: 'syntax',
    type: 'coding',
    language: 'python',
    content: '写一个函数，判断一个数是否为偶数。',
    weight: 1,
    testCases: [
      { input: '4', expectedOutput: 'True', description: '偶数' },
      { input: '7', expectedOutput: 'False', description: '奇数' },
      { input: '0', expectedOutput: 'True', description: '零是偶数' },
    ],
    starterCode: 'def is_even(n):\n    # your code here\n    pass',
  },

  // ========== 字符串处理 ==========
  {
    id: 'code-string-001',
    category: 'string_processing',
    type: 'coding',
    language: 'python',
    content: '写一个函数，反转输入的字符串并返回。',
    weight: 1.5,
    testCases: [
      { input: '"hello"', expectedOutput: '"olleh"', description: '普通字符串' },
      { input: '"abc"', expectedOutput: '"cba"', description: '短字符串' },
      { input: '"racecar"', expectedOutput: '"racecar"', description: '回文' },
    ],
    starterCode: 'def reverse_string(s):\n    # your code here\n    pass',
  },
  {
    id: 'code-string-002',
    category: 'string_processing',
    type: 'coding',
    language: 'python',
    content: '写一个函数，统计字符串中元音字母(a,e,i,o,u)的数量。',
    weight: 1.5,
    testCases: [
      { input: '"hello"', expectedOutput: '2', description: 'hello有e和o' },
      { input: '"xyz"', expectedOutput: '0', description: '无元音' },
      { input: '"AEIOU"', expectedOutput: '5', description: '全元音大写' },
    ],
    starterCode: 'def count_vowels(s):\n    # your code here\n    pass',
  },

  // ========== 数组/列表操作 ==========
  {
    id: 'code-array-001',
    category: 'array_operations',
    type: 'coding',
    language: 'python',
    content: '写一个函数，找出数组中的最大值并返回。',
    weight: 1.5,
    testCases: [
      { input: '[1, 5, 3, 9, 2]', expectedOutput: '9', description: '普通数组' },
      { input: '[-1, -5, -3]', expectedOutput: '-1', description: '负数数组' },
      { input: '[42]', expectedOutput: '42', description: '单元素数组' },
    ],
    starterCode: 'def find_max(arr):\n    # your code here\n    pass',
  },
  {
    id: 'code-array-002',
    category: 'array_operations',
    type: 'coding',
    language: 'python',
    content: '写一个函数，判断数组中是否存在重复元素。',
    weight: 1.5,
    testCases: [
      { input: '[1, 2, 3, 4]', expectedOutput: 'False', description: '无重复' },
      { input: '[1, 2, 3, 1]', expectedOutput: 'True', description: '有重复' },
      { input: '[]', expectedOutput: 'False', description: '空数组' },
    ],
    starterCode: 'def has_duplicate(arr):\n    # your code here\n    pass',
  },

  // ========== 算法 ==========
  {
    id: 'code-algo-001',
    category: 'algorithms',
    type: 'coding',
    language: 'python',
    content: '写一个函数，判断一个数是否为质数。',
    weight: 2,
    testCases: [
      { input: '7', expectedOutput: 'True', description: '质数' },
      { input: '4', expectedOutput: 'False', description: '非质数' },
      { input: '1', expectedOutput: 'False', description: '1不是质数' },
      { input: '2', expectedOutput: 'True', description: '2是质数' },
    ],
    starterCode: 'def is_prime(n):\n    # your code here\n    pass',
    complexity: 'O(sqrt(n))',
  },
  {
    id: 'code-algo-002',
    category: 'algorithms',
    type: 'coding',
    language: 'python',
    content: '写一个函数，计算斐波那契数列第n项的值。',
    weight: 2,
    testCases: [
      { input: '0', expectedOutput: '0', description: '第0项' },
      { input: '1', expectedOutput: '1', description: '第1项' },
      { input: '10', expectedOutput: '55', description: '第10项' },
      { input: '20', expectedOutput: '6765', description: '第20项' },
    ],
    starterCode: 'def fibonacci(n):\n    # your code here\n    pass',
    complexity: 'O(n)',
  },
  {
    id: 'code-algo-003',
    category: 'algorithms',
    type: 'coding',
    language: 'python',
    content: '写一个函数，对数组进行排序（返回排序后的新数组）。',
    weight: 2,
    testCases: [
      { input: '[3, 1, 4, 1, 5]', expectedOutput: '[1, 1, 3, 4, 5]', description: '普通数组' },
      { input: '[5, 4, 3, 2, 1]', expectedOutput: '[1, 2, 3, 4, 5]', description: '逆序数组' },
      { input: '[1]', expectedOutput: '[1]', description: '单元素数组' },
    ],
    starterCode: 'def sort_array(arr):\n    # your code here\n    pass',
    complexity: 'O(n log n)',
  },

  // ========== 数据结构 ==========
  {
    id: 'code-ds-001',
    category: 'data_structures',
    type: 'coding',
    language: 'python',
    content: '写一个函数，使用字典统计字符串中每个字符出现的次数。',
    weight: 1.5,
    testCases: [
      { input: '"hello"', expectedOutput: "{'h': 1, 'e': 1, 'l': 2, 'o': 1}", description: '普通字符串' },
      { input: '"aaa"', expectedOutput: "{'a': 3}", description: '全相同字符' },
      { input: '""', expectedOutput: '{}', description: '空字符串' },
    ],
    starterCode: 'def char_count(s):\n    # your code here\n    pass',
  },
  {
    id: 'code-ds-002',
    category: 'data_structures',
    type: 'coding',
    language: 'python',
    content: '写一个函数，合并两个有序数组并返回有序结果。',
    weight: 2,
    testCases: [
      { input: '[1, 3, 5], [2, 4, 6]', expectedOutput: '[1, 2, 3, 4, 5, 6]', description: '普通合并' },
      { input: '[1, 1, 1], [1, 1]', expectedOutput: '[1, 1, 1, 1, 1]', description: '有重复' },
      { input: '[], [1]', expectedOutput: '[1]', description: '一个空数组' },
    ],
    starterCode: 'def merge_sorted(arr1, arr2):\n    # your code here\n    pass',
    complexity: 'O(n)',
  },
];

/**
 * 按类别获取代码评测题
 */
export function getCodeByCategory(category: string): CodeBenchmarkQuestion[] {
  return codeBenchmarks.filter((q) => q.category === category);
}

/**
 * 获取所有代码评测题
 */
export function getAllCodeBenchmarks(): CodeBenchmarkQuestion[] {
  return codeBenchmarks;
}

/**
 * 获取所有测试用例
 */
export function getTestCases(): Map<string, CodeTestCase[]> {
  const map = new Map<string, CodeTestCase[]>();
  for (const benchmark of codeBenchmarks) {
    map.set(benchmark.id, benchmark.testCases);
  }
  return map;
}
