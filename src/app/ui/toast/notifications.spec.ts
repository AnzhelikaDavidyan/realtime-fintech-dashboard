import { TestBed } from '@angular/core/testing';

import { Notifications, TOAST_AUTO_DISMISS_MS, ToastInput } from './notifications';

const success: ToastInput = { kind: 'success', title: 'Saved', message: 'All good.' };
const failure: ToastInput = { kind: 'error', title: 'Failed', message: 'It broke.' };

describe('Notifications', () => {
  let notifications: Notifications;

  beforeEach(() => {
    vi.useFakeTimers();
    notifications = TestBed.inject(Notifications);
  });

  afterEach(() => vi.useRealTimers());

  const titles = () => notifications.toasts().map((t) => t.title);

  it('shows toasts in the order they arrive', () => {
    notifications.show(success);
    notifications.show(failure);
    expect(titles()).toEqual(['Saved', 'Failed']);
  });

  it('replaces a toast from the same group instead of stacking', () => {
    notifications.show({ ...failure, group: 'apply' });
    notifications.show(success);
    notifications.show({ ...success, title: 'Applied', group: 'apply' });
    expect(titles()).toEqual(['Saved', 'Applied']);
  });

  it('dismisses a toast by id', () => {
    const id = notifications.show(failure);
    notifications.dismiss(id);
    expect(notifications.toasts()).toEqual([]);
  });

  it('hides success toasts on their own, but keeps errors until dismissed', () => {
    notifications.show(success);
    notifications.show(failure);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    expect(titles()).toEqual(['Saved', 'Failed']);
    vi.advanceTimersByTime(1);
    expect(titles()).toEqual(['Failed']);
    vi.advanceTimersByTime(60_000);
    expect(titles()).toEqual(['Failed']);
  });

  it('keeps a held toast and restarts its countdown on release', () => {
    const id = notifications.show(success);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    notifications.hold(id);
    vi.advanceTimersByTime(60_000);
    expect(titles()).toEqual(['Saved']);

    // Released: a full new countdown, not the 1 ms that was left.
    notifications.release(id);
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    expect(titles()).toEqual(['Saved']);
    vi.advanceTimersByTime(1);
    expect(titles()).toEqual([]);
  });

  it('does not let a replaced toast’s timer remove its replacement', () => {
    notifications.show({ ...success, group: 'apply' });
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    notifications.show({ ...failure, group: 'apply' });
    // The first toast's timer fires during this wait; it must not remove the replacement.
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    expect(titles()).toEqual(['Failed']);
  });
});
