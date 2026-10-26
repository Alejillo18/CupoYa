import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'registro',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'inicio',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
    canActivate: [authGuard],
  },
  {
    path: 'eventos',
    loadComponent: () =>
      import('./features/events/events-list.component').then((m) => m.EventsListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'eventos/nuevo',
    loadComponent: () =>
      import('./features/events/event-form.component').then((m) => m.EventFormComponent),
    canActivate: [roleGuard('OPERADOR', 'ADMIN')],
  },
  {
    path: 'eventos/:id/editar',
    loadComponent: () =>
      import('./features/events/event-form.component').then((m) => m.EventFormComponent),
    canActivate: [roleGuard('OPERADOR', 'ADMIN')],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./features/users/users-list.component').then((m) => m.UsersListComponent),
    canActivate: [roleGuard('ADMIN')],
  },
  {
    path: 'reservas',
    loadComponent: () =>
      import('./features/reservations/my-reservations.component').then(
        (m) => m.MyReservationsComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'reportes',
    loadComponent: () =>
      import('./features/reports/reports.component').then((m) => m.ReportsComponent),
    canActivate: [roleGuard('ADMIN')],
  },
  { path: '**', redirectTo: 'login' },
];