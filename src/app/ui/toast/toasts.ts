import { Component, inject } from '@angular/core';
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

  protected act(toast: Toast): void {
    this.notifications.dismiss(toast.id);
    toast.action?.run();
  }
}
