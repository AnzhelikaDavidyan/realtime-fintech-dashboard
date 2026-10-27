import { Component, computed, ElementRef, inject, linkedSignal, viewChild } from '@angular/core';

import { InstrumentMetrics } from '../../core/instrument-metrics';
import { instrumentSymbol, symbolAvatar } from '../../core/instrument-symbols';
import { nominalRate } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import { ImbalancePipe, PricePipe, VolumePipe } from '../../ui/format/format.pipes';
import { ImbalanceBar } from '../../ui/imbalance-bar/imbalance-bar';
import { nextTrends, NO_TRENDS, Trend, TrendState } from '../../ui/price-trend';
import { Value } from '../../ui/value/value';

/** Which of the design's dashboard screens to show. */
export type DashboardView = 'loading' | 'running' | 'paused' | 'error';

export interface MarketRow {
  readonly symbol: string;
  readonly avatar: string;
  readonly metrics: InstrumentMetrics;
  readonly trend: Trend | null;
}

const emptyMetrics = (instrument: number): InstrumentMetrics => ({
  instrument,
  bid: null,
  ask: null,
  bidQty: null,
  askQty: null,
  spread: null,
  imbalance: null,
  lastPrice: null,
  volume: 0,
  vwap: null,
});

@Component({
  selector: 'app-dashboard',
  imports: [Value, ImbalanceBar, PricePipe, VolumePipe, ImbalancePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly producer = inject(ProducerService);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly runId = this.producer.runId;
  protected readonly totalUpdates = this.producer.totalUpdates;
  protected readonly instrumentCount = computed(
    () => this.producer.activeSettings().instrumentCount,
  );
  protected readonly rate = computed(() => nominalRate(this.producer.activeSettings()));

  protected readonly view = computed<DashboardView>(() => {
    const status = this.producer.status();
    if (status === 'error' || status === 'finished') return 'error';
    if (status === 'paused') return 'paused';
    if (status === 'running' && this.producer.rows().length > 0) return 'running';
    return 'loading';
  });

  /** Headline of the error banner: a failed start or a run that stopped. */
  protected readonly errorTitle = computed(() =>
    this.producer.status() === 'finished' ? 'Producer stopped.' : 'Producer failed to start.',
  );
  /** The worker's message as a sentence (it may lack a final full stop). */
  protected readonly errorMessage = computed(() => {
    const message = this.producer.error() ?? 'The market data worker could not start.';
    return /[.!?]$/.test(message) ? message : `${message}.`;
  });

  /** Starts a fresh worker with the same settings. */
  protected retry(): void {
    // The Retry button is about to go away; keep focus at the top of the page.
    this.heading().nativeElement.focus();
    this.producer.retry();
  }

  /** Price direction per instrument, compared with the previous snapshot. */
  private readonly trends = linkedSignal<readonly InstrumentMetrics[], TrendState>({
    source: this.producer.rows,
    computation: (rows, previous) => nextTrends(previous?.value ?? NO_TRENDS, rows),
  });

  /** One row per instrument of the run; placeholders until its first snapshot. */
  protected readonly rows = computed<readonly MarketRow[]>(() => {
    const byId = new Map(this.producer.rows().map((m) => [m.instrument, m]));
    const trends = this.trends().trends;
    return Array.from({ length: this.instrumentCount() }, (_, i) => {
      const symbol = instrumentSymbol(i);
      return {
        symbol,
        avatar: symbolAvatar(symbol),
        metrics: byId.get(i) ?? emptyMetrics(i),
        trend: trends.get(i) ?? null,
      };
    });
  });
}
