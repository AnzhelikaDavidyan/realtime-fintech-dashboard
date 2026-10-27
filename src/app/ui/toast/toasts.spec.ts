import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Notifications } from './notifications';
import { Toasts } from './toasts';

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Toasts);
  const notifications = TestBed.inject(Notifications);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, notifications, el, render };
}

describe('Toasts', () => {
  it('keeps an empty live region ready for announcements', async () => {
    const { el, render } = setup();
    await render();
    const region = el.querySelector('section')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.children).toHaveLength(0);
  });

  it('shows success as a status and errors as an alert', async () => {
    const { el, render, notifications } = setup();
    notifications.show({ kind: 'success', title: 'Settings applied', message: 'Run #2 started.' });
    notifications.show({ kind: 'error', title: 'Couldn’t apply settings', message: 'Bad.' });
    await render();

    const toasts = [...el.querySelectorAll('.toast')];
    expect(toasts.map((t) => t.getAttribute('role'))).toEqual(['status', 'alert']);
    expect(toasts[0].querySelector('.toast__title')?.textContent).toBe('Settings applied');
    expect(toasts[0].querySelector('.toast__message')?.textContent).toBe('Run #2 started.');
  });

  it('dismisses a toast with its close button', async () => {
    const { el, render, notifications } = setup();
    notifications.show({ kind: 'error', title: 'Failed', message: 'Bad.' });
    await render();
    (el.querySelector('[aria-label="Dismiss notification"]') as HTMLButtonElement).click();
    await render();
    expect(el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('runs the action and closes the toast', async () => {
    const { el, render, notifications } = setup();
    const run = vi.fn();
    notifications.show({
      kind: 'error',
      title: 'Failed',
      message: 'Bad.',
      action: { label: 'Retry', run },
    });
    await render();
    (el.querySelector('.toast__button') as HTMLButtonElement).click();
    await render();
    expect(run).toHaveBeenCalledOnce();
    expect(el.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('links to another page', async () => {
    const { el, render, notifications } = setup();
    notifications.show({
      kind: 'success',
      title: 'Done',
      message: 'Ok.',
      link: { label: 'View dashboard', path: '/dashboard' },
    });
    await render();
    const link = el.querySelector('.toast__link') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('View dashboard');
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('keeps a toast while hovered', async () => {
    const { el, render, notifications } = setup();
    const hold = vi.spyOn(notifications, 'hold');
    const release = vi.spyOn(notifications, 'release');
    const id = notifications.show({ kind: 'success', title: 'Done', message: 'Ok.' });
    await render();
    const toast = el.querySelector('.toast')!;
    toast.dispatchEvent(new Event('mouseenter'));
    toast.dispatchEvent(new Event('mouseleave'));
    expect(hold).toHaveBeenCalledWith(id);
    expect(release).toHaveBeenCalledWith(id);
  });
});
