# LLM Benchmark v0.4.0 开发规范

## 版本发布标准 (v0.4.0+)

### 必须满足的条件

| 条件 | 要求 | 当前状态 |
|------|------|----------|
| 单元测试 | 100% 通过 | ✅ 1096/1096 (90 套件) |
| 语句覆盖率 | ≥ 90% (闸门) | ✅ 91.68% |
| 分支覆盖率 | ≥ 70% (闸门) | ✅ 78.43% |
| 函数覆盖率 | ≥ 85% (闸门) | ✅ 86.86% |
| 行覆盖率 | ≥ 90% (闸门) | ✅ 92.78% |
| 集成测试 | 通过 | ⏳ 待完成 |
| Docker 部署验证 | 通过 | ⏳ 待完成 |

### Superpowers 开发流程

每个版本必须遵循以下流程：

```
1. Brainstorming     → 澄清目标、约束、备选方案
2. Writing-plans     → 设计文档，拆成可执行任务
3. Subagent-driven   → 必要时用 subagent 分任务推进
4. Test-driven       → 先写测试，RED-GREEN-REFACTOR
5. Code-review       → 关键步骤检查
6. Verification      → 完成前必须验证
7. Finish            → 确认合并/保留/清理
```

### 测试报告模板

```markdown
## vX.Y.Z 测试报告

### 测试执行
- 日期: YYYY-MM-DD HH:MM UTC
- 运行时长: Xs
- 测试套件: N 个通过 / M 个总数
- 测试用例: N 个通过 / M 个总数

### 覆盖率

| 指标 | 覆盖率 | 阈值 | 状态 |
|------|--------|------|------|
| Statements | XX.XX% | 100% | ✅/❌ |
| Branches | XX.XX% | 100% | ✅/❌ |
| Functions | XX.XX% | 100% | ✅/❌ |
| Lines | XX.XX% | 100% | ✅/❌ |

### 覆盖率详情

| 文件 | Stmts | Branch | Funcs | Lines | Uncovered |
|------|-------|--------|-------|-------|-----------|
| ... | ... | ... | ... | ... | ... |

### 测试套件详情

| 测试套件 | 状态 | 测试数 | 覆盖率 |
|----------|------|--------|--------|
| ... | ✅/❌ | N | XX% |

### 缺陷修复

- [ ] Issue #XXX: 描述 (已修复/未修复)

### 发布检查清单

- [ ] 所有测试通过
- [ ] 覆盖率达标 (100% on all metrics)
- [ ] Docker 构建成功
- [ ] Docker 部署验证通过
- [ ] Git tag 已打
- [ ] npm publish 完成
```

### 当前版本覆盖详情 (2026-10-02 实测)

> **数据状态**: 本节数据已于 2026-10-02 由 `npm test` 全量实测刷新 (90 套件 / 1096 用例, 真实阈值 90/70/90/85)。

**测试执行 (2026-10-02 实测, jest.config.js 真实阈值下):**
- 测试套件: 90 个通过 / 90 个总数
- 测试用例: 1096 个通过 / 1096 个总数
- 运行时长: ~47s

**覆盖率 (2026-10-02 实测, 阈值 90/70/90/85):**
- Statements: 91.68%
- Branches: 78.43%
- Functions: 86.86%
- Lines: 92.78%

**主要缺口 (2026-10-02 实测):**
- `src/core/evaluator.ts` 自 2026-10-02 起进入 coverage scope: 77.39 stmts / 59.36 branches /
  54.43 funcs / 80.06 lines —— 它是唯一拖住全局四项的单一文件, 也是 branch/function 两项的绑定约束
- `src/core/scorer.ts` branches: 99.23% (L176)
- `src/sandbox/python-sandbox.ts`: 98 stmts / 90 branches (L86)
- `src/web/websocket.ts` branches: 90% (L48)

### 待办 (v0.6.0)

- [ ] 提升 `src/core/evaluator.ts` branches 至 90% (当前 59.36%, 需再关 ~330 个分支臂)
- [ ] 提升 `src/core/evaluator.ts` functions 至 90% (当前 54.43%, 36 个 dark function 已在源码中被 0 调用)
- [ ] 补充 adapter 真实 API 调用集成测试
- [ ] 添加 Dockerfile 多阶段构建优化
- [ ] 补充 WebSocket 完整生命周期测试
- [ ] 添加 API 端到端集成测试
- [ ] 生成完整测试报告

---
_Last updated: 2026-10-02 06:06 UTC (coverage 数字全部由本次 `npm test` 实测, 取代 2026-05-24 的 v0.3.0 基线)_
