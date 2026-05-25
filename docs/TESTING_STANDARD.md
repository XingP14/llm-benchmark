# LLM Benchmark v0.4.0 开发规范

## 版本发布标准 (v0.4.0+)

### 必须满足的条件

| 条件 | 要求 | 当前状态 |
|------|------|----------|
| 单元测试 | 100% 通过 | ✅ 129/129 |
| 语句覆盖率 | ≥ 100% | ✅ 96.28% (需提升) |
| 分支覆盖率 | ≥ 100% | ⚠️ 77.37% (需提升) |
| 函数覆盖率 | ≥ 100% | ⚠️ 95.55% (需提升) |
| 行覆盖率 | ≥ 100% | ✅ 96.55% (需提升) |
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

### 当前版本覆盖详情 (v0.3.0)

**测试执行:**
- 测试套件: 19 个通过 / 19 个总数
- 测试用例: 129 个通过 / 129 个总数
- 运行时长: ~16s

**覆盖率:**
- Statements: 96.28% (目标 100%)
- Branches: 77.37% (目标 100%)
- Functions: 95.55% (目标 100%)
- Lines: 96.55% (目标 100%)

**主要缺口:**
- `evaluator.ts` branches: 80.76% (lines 59-60, 180 未覆盖)
- `websocket.ts` branches: 66.66% (empty catch blocks)
- `auth.ts` routes branches: 72.72%
- `reporter.ts` branches: 52.38% (template ternary)

### 待办 (v0.4.0)

- [ ] 提升 branches 覆盖率至 100%
- [ ] 补充 adapter 真实 API 调用集成测试
- [ ] 添加 Dockerfile 多阶段构建优化
- [ ] 补充 WebSocket 完整生命周期测试
- [ ] 添加 API 端到端集成测试
- [ ] 生成完整测试报告

---
_Last updated: 2026-05-24 01:00 UTC_
