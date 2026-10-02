export function operationCancelled(): Error {
  const error = new Error('작업을 중지했어요.');
  error.name = 'AbortError';
  return error;
}

/** Owns a native resource. Replacements wait for active work to finish before disposal. */
export class ExclusiveResource<T> {
  private resource: T | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private revision = 0;
  private pending = 0;
  private active: { controller: AbortController; settled: Promise<unknown> } | null = null;
  private readonly dispose: (resource: T) => Promise<void>;
  private readonly interrupt: (resource: T) => Promise<void>;

  constructor(
    dispose: (resource: T) => Promise<void>,
    interrupt: (resource: T) => Promise<void>
  ) { this.dispose = dispose; this.interrupt = interrupt; }

  get current(): T | null { return this.pending === 0 ? this.resource : null; }

  get running(): boolean { return !!this.active; }

  async stop(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.controller.abort();
    if (this.resource) await this.interrupt(this.resource);
  }

  replace(create: ((isCurrent: () => boolean) => Promise<T>) | null): Promise<void> {
    const revision = ++this.revision;
    this.pending += 1;
    // Invalidate callbacks immediately, even while a previous load is still pending.
    const interrupted = this.stop();
    const operation = this.queue.then(async () => {
      if (revision !== this.revision) throw operationCancelled();
      await interrupted;
      await this.active?.settled.catch(() => undefined);
      const previous = this.resource;
      if (previous) {
        await this.dispose(previous);
        this.resource = null;
      }
      if (!create) return;
      if (revision !== this.revision) throw operationCancelled();
      const isCurrent = () => revision === this.revision;
      const next = await create(isCurrent);
      if (!isCurrent()) {
        await this.dispose(next);
        throw operationCancelled();
      }
      this.resource = next;
    });
    this.queue = operation.catch(() => undefined);
    // Observe interrupt failures immediately; the operation also propagates them.
    void interrupted.catch(() => undefined);
    return operation.finally(() => { this.pending -= 1; });
  }

  run<R>(work: (resource: T, signal: AbortSignal) => Promise<R>): Promise<R> {
    const resource = this.current;
    if (!resource) return Promise.reject(new Error('지키미를 먼저 준비해 주세요.'));
    if (this.active) return Promise.reject(new Error('이미 답변을 만들고 있어요.'));
    const controller = new AbortController();
    const settled = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw operationCancelled();
      return work(resource, controller.signal);
    });
    const active = { controller, settled };
    this.active = active;
    return settled.finally(() => {
      if (this.active === active) this.active = null;
    });
  }
}
