import { Component, computed, inject } from '@angular/core';

import { nominalRate } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import { VolumePipe } from '../../ui/format/format.pipes';

type Tone = 'starting' | 'running' | 'paused' | 'error';
type Action = 'pause' | 'resume' | 'retry';

/**
 * Status pill and the matching action from the design's top bar:
 * Running → Pause, Paused → Resume, Error → Retry.
 */
@Component({
  selector: 'app-producer-controls',
  imports: [VolumePipe],
  templateUrl: './producer-controls.html',
  styleUrl: './producer-controls.scss',
})
export class ProducerControls {
  private readonly producer = inject(ProducerService);

  protected readonly rate = computed(() => nominalRate(this.producer.activeSettings()));

  protected readonly tone = computed<Tone>(() => {
    switch (this.producer.status()) {
      case 'running':
        return 'running';
      case 'paused':
        return 'paused';
      case 'error':
      case 'finished':
        return 'error';
      default:
        return 'starting';
    }
  });

  protected readonly action = computed<Action>(() => {
    const tone = this.tone();
    return tone === 'paused' ? 'resume' : tone === 'error' ? 'retry' : 'pause';
  });

  protected act(): void {
    switch (this.action()) {
      case 'pause':
        this.producer.pause();
        break;
      case 'resume':
        this.producer.resume();
        break;
      case 'retry':
        this.producer.retry();
        break;
    }
  }
}
