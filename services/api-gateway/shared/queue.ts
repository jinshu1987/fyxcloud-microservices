/**
 * PostgreSQL-based job queue shared by all services.
 * Jobs are rows in the `job_queue` table. Workers poll via SKIP LOCKED.
 */
import { getPool } from "./db.js";
import { log, logError } from "./logger.js";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job<T = Record<string, unknown>> {
  id: string;
  queue: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
  error?: string | null;
}

export async function ensureQueueTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_queue (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      queue       TEXT NOT NULL,
      payload     JSONB NOT NULL DEFAULT '{}',
      status      TEXT NOT NULL DEFAULT 'pending',
      attempts    INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 3,
      run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error       TEXT
    );
    CREATE INDEX IF NOT EXISTS job_queue_status_queue_run_at
      ON job_queue (status, queue, run_at)
      WHERE status = 'pending';
  `);
}

export async function enqueue<T>(
  queue: string,
  payload: T,
  opts: { maxAttempts?: number; runAt?: Date } = {}
): Promise<string> {
  const pool = getPool();
  const { maxAttempts = 3, runAt = new Date() } = opts;
  const result = await pool.query(
    `INSERT INTO job_queue (queue, payload, max_attempts, run_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [queue, JSON.stringify(payload), maxAttempts, runAt]
  );
  return result.rows[0].id as string;
}

export async function dequeue<T>(queue: string): Promise<Job<T> | null> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE job_queue
     SET status = 'running', attempts = attempts + 1, updated_at = NOW()
     WHERE id = (
       SELECT id FROM job_queue
       WHERE queue = $1 AND status = 'pending' AND run_at <= NOW()
       ORDER BY run_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [queue]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    queue: row.queue,
    payload: row.payload as T,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  };
}

export async function completeJob(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE job_queue SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function failJob(id: string, error: string): Promise<void> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE job_queue
     SET error = $2, updated_at = NOW(),
         status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         run_at = CASE WHEN attempts >= max_attempts THEN run_at ELSE NOW() + INTERVAL '30 seconds' END
     WHERE id = $1
     RETURNING status`,
    [id, error]
  );
  const finalStatus = result.rows[0]?.status;
  if (finalStatus === "failed") {
    logError(`Job ${id} permanently failed: ${error}`, "queue");
  }
}

export type JobHandler<T> = (job: Job<T>) => Promise<void>;

export function startWorker<T>(
  queue: string,
  handler: JobHandler<T>,
  opts: { pollIntervalMs?: number; concurrency?: number } = {}
): () => void {
  const { pollIntervalMs = 2000, concurrency = 3 } = opts;
  let running = 0;
  let stopped = false;

  async function poll() {
    if (stopped || running >= concurrency) return;
    try {
      const job = await dequeue<T>(queue);
      if (!job) return;
      running++;
      handler(job)
        .then(() => completeJob(job.id))
        .catch(async (err: Error) => {
          await failJob(job.id, err.message);
        })
        .finally(() => { running--; });
    } catch (err) {
      logError(`Worker poll error on queue ${queue}`, "queue", err);
    }
  }

  const timer = setInterval(poll, pollIntervalMs);
  log(`Worker started on queue "${queue}" (poll=${pollIntervalMs}ms, concurrency=${concurrency})`, "queue");

  return () => {
    stopped = true;
    clearInterval(timer);
    log(`Worker stopped on queue "${queue}"`, "queue");
  };
}
