import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { HomeComponent } from './features/home/home.component';
import { authGuard, guestGuard } from './core/guards';
import { EventsListComponent } from './features/events/events-list.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'registro', component: RegisterComponent, canActivate: [guestGuard] },
  { path: 'inicio', component: HomeComponent, canActivate: [authGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'eventos', component: EventsListComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'login' }
];