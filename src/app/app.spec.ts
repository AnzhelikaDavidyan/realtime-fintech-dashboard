import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { provideFakeProducerWorker } from './state/testing/fake-producer-worker';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideFakeProducerWorker()],
    }).compileComponents();
  });

  it('renders the main navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('nav a') as NodeListOf<HTMLAnchorElement>;
    expect(Array.from(links).map((a) => a.textContent?.trim())).toEqual(['Dashboard', 'Settings']);
  });

  it('redirects the root path to the dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Live market');
  });

  it('navigates to settings', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/settings');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Settings');
  });

  it('shows the not-found page for unknown urls', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/does-not-exist');
    await fixture.whenStable();
    expect(router.url).toBe('/does-not-exist');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Page not found');
  });
});
