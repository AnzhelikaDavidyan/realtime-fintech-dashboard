import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly title: string;
  readonly message: string;
  /** Toasts in the same group replace each other instead of stacking. */
  readonly group?: string;
  /** In-app link, e.g. "View dashboard". */
  readonly link?: { readonly label: string; readonly path: string };
  readonly action?: ToastAction;
}

export type ToastInput = Omit<Toast, 'id'>;

/** Success toasts hide themselves after this long; errors stay until dismissed. */
export const TOAST_AUTO_DISMISS_MS = 5_000;

/** App-wide toast notifications, shown by the `Toasts` outlet in the shell. */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly _toasts = signal<readonly Toast[]>([]);

  readonly toasts = this._toasts.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timers.forEach((timer) => clearTimeout(timer)));
  }

  show(input: ToastInput): number {
    const toast: Toast = { ...input, id: ++this.nextId };
    // A replaced toast's timer may still fire; dismissing an id that is gone does nothing.
    const kept = this._toasts().filter((t) => !input.group || t.group !== input.group);
    this._toasts.set([...kept, toast]);
    this.startTimer(toast);
    return toast.id;
  }

  dismiss(id: number): void {
    this.stopTimer(id);
    this._toasts.update((toasts) => toasts.filter((t) => t.id !== id));
  }

  /** Keeps a toast on screen while the pointer or focus is on it. */
  hold(id: number): void {
    this.stopTimer(id);
  }

  /** Restarts the auto-dismiss countdown after `hold`. */
  release(id: number): void {
    const toast = this._toasts().find((t) => t.id === id);
    if (toast) {
      this.startTimer(toast);
    }
  }

  private startTimer(toast: Toast): void {
    if (toast.kind !== 'success') return;
    this.stopTimer(toast.id);
    this.timers.set(
      toast.id,
      setTimeout(() => this.dismiss(toast.id), TOAST_AUTO_DISMISS_MS),
    );
  }

  private stopTimer(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }
}
