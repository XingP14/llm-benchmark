// tests/web/task.test.ts - 任务管理器测试

import { taskManager } from '../../src/web/engine/task';

describe('TaskManager', () => {
  beforeEach(() => {
    taskManager.clear();
  });

  describe('startTask', () => {
    it('should create a new task', () => {
      const id = taskManager.startTask(1, [1, 2], true, true);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const task = taskManager.getCurrentTask();
      expect(task).toBeDefined();
      expect(task!.id).toBe(id);
      expect(task!.userId).toBe(1);
      expect(task!.configs).toEqual([1, 2]);
      expect(task!.includeDialogue).toBe(true);
      expect(task!.includeCoding).toBe(true);
      expect(task!.status).toBe('PENDING');
    });

    it('should reject when task is running', () => {
      taskManager.startTask(1, [1], true, true);
      taskManager.setRunning();

      expect(() => {
        taskManager.startTask(2, [2], true, true);
      }).toThrow('Another evaluation is running');
    });

    it('should accept new task after completion', () => {
      taskManager.startTask(1, [1], true, true);
      taskManager.setRunning();
      taskManager.setCompleted();

      const id = taskManager.startTask(2, [2], true, true);
      expect(id).toBeDefined();
    });
  });

  describe('status transitions', () => {
    it('should transition PENDING -> RUNNING -> COMPLETED', () => {
      taskManager.startTask(1, [1], true, true);
      expect(taskManager.getCurrentTask()!.status).toBe('PENDING');

      taskManager.setRunning();
      expect(taskManager.getCurrentTask()!.status).toBe('RUNNING');
      expect(taskManager.getCurrentTask()!.startedAt).toBeDefined();

      taskManager.setCompleted();
      expect(taskManager.getCurrentTask()!.status).toBe('COMPLETED');
      expect(taskManager.getCurrentTask()!.completedAt).toBeDefined();
    });

    it('should transition PENDING -> RUNNING -> FAILED', () => {
      taskManager.startTask(1, [1], true, true);

      taskManager.setRunning();
      taskManager.setFailed();

      expect(taskManager.getCurrentTask()!.status).toBe('FAILED');
    });
  });

  describe('cancel', () => {
    it('should set cancel flag', () => {
      taskManager.startTask(1, [1], true, true);
      expect(taskManager.isCancelled()).toBe(false);

      taskManager.requestCancel();
      expect(taskManager.isCancelled()).toBe(true);
    });

    it('should reset cancel on clear', () => {
      taskManager.startTask(1, [1], true, true);
      taskManager.requestCancel();
      taskManager.clear();

      expect(taskManager.isCancelled()).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear current task', () => {
      taskManager.startTask(1, [1], true, true);
      expect(taskManager.getCurrentTask()).toBeDefined();

      taskManager.clear();
      expect(taskManager.getCurrentTask()).toBeNull();
    });
  });

  describe('dialogue and coding options', () => {
    it('should support dialogue only', () => {
      taskManager.startTask(1, [1], true, false);
      expect(taskManager.getCurrentTask()!.includeDialogue).toBe(true);
      expect(taskManager.getCurrentTask()!.includeCoding).toBe(false);
    });

    it('should support coding only', () => {
      taskManager.startTask(1, [1], false, true);
      expect(taskManager.getCurrentTask()!.includeDialogue).toBe(false);
      expect(taskManager.getCurrentTask()!.includeCoding).toBe(true);
    });
  });
});
