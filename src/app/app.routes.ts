import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    title: 'Dashboard · Findev',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'settings',
    title: 'Settings · Findev',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
  },
  { path: '**', redirectTo: 'dashboard' },
];
