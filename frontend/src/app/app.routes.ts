import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { EventFormComponent } from './features/events/event-form.component';
import { EventsListComponent } from './features/events/events-list.component';
import { HomeComponent } from './features/home/home.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'registro', component: RegisterComponent, canActivate: [guestGuard] },
  { path: 'inicio', component: HomeComponent, canActivate: [authGuard] },
  { path: 'eventos', component: EventsListComponent, canActivate: [authGuard] },
  {
    path: 'eventos/nuevo',
    component: EventFormComponent,
    canActivate: [roleGuard('OPERADOR', 'ADMIN')],
  },
  {
    path: 'eventos/:id/editar',
    component: EventFormComponent,
    canActivate: [roleGuard('OPERADOR', 'ADMIN')],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];