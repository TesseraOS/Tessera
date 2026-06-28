/** A handler for jobs delivered on a topic. May be async; throwing triggers a retry. */
export type JobHandler<T> = (payload: T) => void | Promise<void>;

/** Handle returned by {@link Queue.subscribe}. */
export interface QueueSubscription {
  unsubscribe(): void;
}

/**
 * Job queue port. The local default is in-process; a BullMQ/Redis adapter implements the
 * same contract for cloud (ADR-0003). Handlers must be **idempotent** — jobs may be retried.
 */
export interface Queue {
  /** Enqueue a job payload on a topic. */
  enqueue<T>(topic: string, payload: T): Promise<void>;
  /** Subscribe a handler to a topic; returns a handle to stop it. */
  subscribe<T>(topic: string, handler: JobHandler<T>): QueueSubscription;
  /** Stop accepting new jobs and await all in-flight handlers. */
  shutdown(): Promise<void>;
}
