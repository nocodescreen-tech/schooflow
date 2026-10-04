import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface JobHandler {
  (payload: Record<string, unknown>): Promise<unknown>;
}

/**
 * In-memory job queue for background tasks.
 *
 * Handles: email sending, bulk report card generation, document rendering,
 * notifications, imports, exports, backups, cleanup.
 *
 * Jobs are retryable, idempotent, and observable.
 */
class JobQueue {
  private jobs: Map<string, Job> = new Map();
  private handlers: Map<string, JobHandler> = new Map();
  private running: Set<string> = new Set();
  private maxConcurrent: number;
  private processing: boolean = false;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(type: string, payload: Record<string, unknown>, maxAttempts = 3): Promise<Job> {
    const job: Job = {
      id: uuidv4(),
      type,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobs.set(job.id, job);
    this.process();
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  listJobs(filter?: { type?: string; status?: string; limit?: number }): Job[] {
    let jobs = [...this.jobs.values()];
    if (filter?.type) jobs = jobs.filter((j) => j.type === filter.type);
    if (filter?.status) jobs = jobs.filter((j) => j.status === filter.status);
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (filter?.limit) jobs = jobs.slice(0, filter.limit);
    return jobs;
  }

  async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.running.size < this.maxConcurrent) {
        const pending = [...this.jobs.values()]
          .filter((j) => j.status === 'pending')
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

        if (!pending) break;

        const handler = this.handlers.get(pending.type);
        if (!handler) {
          pending.status = 'failed';
          pending.error = `No handler registered for type: ${pending.type}`;
          pending.updatedAt = new Date();
          continue;
        }

        this.running.add(pending.id);
        pending.status = 'running';
        pending.startedAt = new Date();
        pending.attempts++;
        pending.updatedAt = new Date();

        this.executeJob(pending, handler);
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeJob(job: Job, handler: JobHandler): Promise<void> {
    try {
      const result = await handler(job.payload);
      job.status = 'completed';
      job.result = result;
      job.completedAt = new Date();
    } catch (error) {
      job.error = (error as Error).message;
      if (job.attempts < job.maxAttempts) {
        job.status = 'retrying';
        // Exponential backoff: 1s, 2s, 4s, 8s...
        const delay = Math.pow(2, job.attempts - 1) * 1000;
        setTimeout(() => {
          job.status = 'pending';
          job.updatedAt = new Date();
          this.process();
        }, delay);
      } else {
        job.status = 'failed';
        job.completedAt = new Date();
      }
    } finally {
      job.updatedAt = new Date();
      this.running.delete(job.id);
      this.process();
    }
  }

  cleanup(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if ((job.status === 'completed' || job.status === 'failed') && job.updatedAt.getTime() < cutoff) {
        this.jobs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  stats(): { total: number; pending: number; running: number; completed: number; failed: number; retrying: number } {
    const jobs = [...this.jobs.values()];
    return {
      total: jobs.length,
      pending: jobs.filter((j) => j.status === 'pending').length,
      running: jobs.filter((j) => j.status === 'running').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      retrying: jobs.filter((j) => j.status === 'retrying').length,
    };
  }
}

export const jobQueue = new JobQueue();
export default jobQueue;
