// src/web/engine/task.ts - 评测任务管理器

import { randomUUID } from 'crypto';

export interface EvaluationTask {
  id: string;
  userId: number;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  configs: number[];
  includeDialogue: boolean;
  includeCoding: boolean;
  includeFunctionCalling: boolean;
  includeLongContext: boolean;
  startedAt?: Date;
  completedAt?: Date;
}

class TaskManager {
  private currentTask: EvaluationTask | null = null;
  private cancelRequested = false;

  /**
   * 开始新任务
   */
  startTask(
    userId: number,
    configs: number[],
    dialogue: boolean,
    coding: boolean,
    functionCalling: boolean = false,
    longContext: boolean = false
  ): string {
    if (this.currentTask && this.currentTask.status === 'RUNNING') {
      throw new Error('Another evaluation is running');
    }

    this.currentTask = {
      id: randomUUID(),
      userId,
      status: 'PENDING',
      configs,
      includeDialogue: dialogue,
      includeCoding: coding,
      includeFunctionCalling: functionCalling,
      includeLongContext: longContext,
    };
    this.cancelRequested = false;
    return this.currentTask.id;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): EvaluationTask | null {
    return this.currentTask;
  }

  /**
   * 设置运行中状态
   */
  setRunning(): void {
    if (this.currentTask) {
      this.currentTask.status = 'RUNNING';
      this.currentTask.startedAt = new Date();
    }
  }

  /**
   * 设置完成状态
   */
  setCompleted(): void {
    if (this.currentTask) {
      this.currentTask.status = 'COMPLETED';
      this.currentTask.completedAt = new Date();
    }
  }

  /**
   * 设置失败状态
   */
  setFailed(): void {
    if (this.currentTask) {
      this.currentTask.status = 'FAILED';
      this.currentTask.completedAt = new Date();
    }
  }

  /**
   * 请求取消
   */
  requestCancel(): void {
    this.cancelRequested = true;
  }

  /**
   * 是否已取消
   */
  isCancelled(): boolean {
    return this.cancelRequested;
  }

  /**
   * 清除任务
   */
  clear(): void {
    this.currentTask = null;
    this.cancelRequested = false;
  }
}

export const taskManager = new TaskManager();
