import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Notifications, Toast } from './notifications';

/** Shows the app's toasts in the top-right corner. Placed once, in the shell. */
@Component({
  selector: 'app-toasts',
  imports: [RouterLink],
  templateUrl: './toasts.html',
  styleUrl: './toasts.scss',
})
export class Toasts {
  protected readonly notifications = inject(Notifications);

  /** Text of the newest success and error toast, for the live regions. */
  protected readonly announcement = computed(() => {
    const latest = (kind: Toast['kind']) => {
      const toast = this.notifications
        .toasts()
        .filter((t) => t.kind === kind)
        .at(-1);
      return toast ? `${toast.title}. ${toast.message}` : '';
    };
    return { polite: latest('success'), assertive: latest('error') };
  });

  protected act(toast: Toast): void {
    this.notifications.dismiss(toast.id);
    toast.action?.run();
  }
}
