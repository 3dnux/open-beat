import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home').then(m => m.Home)
  },
  {
    path: 'biblioteca',
    title: 'Mi biblioteca · Lectura biónica',
    loadComponent: () => import('./reader/bookshelf/bookshelf').then(m => m.Bookshelf)
  },
  {
    path: 'leer/:id',
    title: 'Lector biónico',
    loadComponent: () => import('./reader/reader/reader').then(m => m.Reader)
  },
  { path: '**', redirectTo: '' }
];
