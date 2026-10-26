import { Scheduler } from '../producer-engine';

/**
 * Manual clock and scheduler for tests: time only moves when the test calls
 * `advance` or `jump`, so timing-based behaviour is exact and repeatable.
 */
export class FakeTime implements Scheduler {
  private timers = new Map<number, { interval: number; next: number; callback: () => void }>();
  private nextId = 0;

  constructor(public now = 1_000) {}

  readonly clock = () => this.now;

  every(interval: number, callback: () => void): () => void {
    const id = this.nextId++;
    this.timers.set(id, { interval, next: this.now + interval, callback });
    return () => this.timers.delete(id);
  }

  /** Timers currently scheduled (not yet cancelled). */
  get activeTimers(): number {
    return this.timers.size;
  }

  /** Moves time forward, firing due timers in time order. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers.values()]
        .filter((t) => t.next <= end)
        .sort((a, b) => a.next - b.next)[0];
      if (!due) break;
      this.now = due.next;
      due.next += due.interval;
      due.callback();
    }
    this.now = end;
  }

  /**
   * Jumps the clock without firing timers, like a frozen background tab.
   * Missed ticks are dropped, as browsers do, not replayed afterwards.
   */
  jump(ms: number): void {
    this.now += ms;
    for (const timer of this.timers.values()) {
      timer.next = this.now + timer.interval;
    }
  }
}
