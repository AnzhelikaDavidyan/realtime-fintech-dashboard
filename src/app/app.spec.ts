import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
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
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Dashboard');
  });

  it('navigates to settings', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/settings');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Settings');
  });
});
