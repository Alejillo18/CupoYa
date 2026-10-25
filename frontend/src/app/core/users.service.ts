import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Role } from './auth.service';

export interface ManagedUser {
  id: string;
  email: string;
  role: Role;
  bloqueado: boolean;
  createdAt: Date;
}

export interface UsersPage {
  items: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
}

interface UserRaw {
  id: string;
  email: string;
  role: Role;
  lockedUntil: string | null;
  createdAt: string;
}

const API = '/api/v1/users';

const aUsuario = (u: UserRaw): ManagedUser => ({
  id: u.id,
  email: u.email,
  role: u.role,
  bloqueado: u.lockedUntil !== null && new Date(u.lockedUntil).getTime() > Date.now(),
  createdAt: new Date(u.createdAt),
});

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  list(page = 1, pageSize = 20): Observable<UsersPage> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http
      .get<{ items: UserRaw[]; total: number; page: number; pageSize: number }>(API, { params })
      .pipe(map((r) => ({ ...r, items: r.items.map(aUsuario) })));
  }

  changeRole(id: string, role: Role): Observable<ManagedUser> {
    return this.http
      .patch<{ user: UserRaw }>(`${API}/${id}/role`, { role })
      .pipe(map((r) => aUsuario(r.user)));
  }
}