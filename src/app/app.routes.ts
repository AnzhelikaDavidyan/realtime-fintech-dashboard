import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · FinDev Markets',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'settings',
    title: 'Settings · FinDev Markets',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
  },
  {
    path: '**',
    title: 'Page not found · FinDev Markets',
    loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound),
  },
];
