// tests/web/evaluator.test.ts - 评测引擎测试

import { taskManager } from '../../src/web/engine/task';

describe('EvaluatorEngine', () => {
  beforeEach(() => {
    taskManager.clear();
  });

  describe('task manager integration', () => {
    it('should manage evaluation tasks', () => {
      // 验证任务管理器可用于评测引擎
      const taskId = taskManager.startTask(1, [1], true, true);
      expect(taskId).toBeDefined();

      const task = taskManager.getCurrentTask();
      expect(task).toBeDefined();
      expect(task!.userId).toBe(1);
      expect(task!.configs).toEqual([1]);
    });

    it('should handle cancellation', () => {
      taskManager.startTask(1, [1], true, true);
      taskManager.requestCancel();

      expect(taskManager.isCancelled()).toBe(true);
    });

    it('should clear task state', () => {
      taskManager.startTask(1, [1], true, true);
      taskManager.clear();

      expect(taskManager.getCurrentTask()).toBeNull();
      expect(taskManager.isCancelled()).toBe(false);
    });
  });
});
