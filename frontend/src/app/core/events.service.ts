import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface EventItem {
  id: string;
  name: string;
  description: string;
  venue: string;
  startsAt: Date;
  totalCapacity: number;
  availableCapacity: number;
  status: 'ACTIVO' | 'CANCELADO';
}

export interface EventPage {
  items: EventItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EventInput {
  name: string;
  description: string;
  venue: string;
  startsAt: Date;
  totalCapacity: number;
}

type EventRaw = Omit<EventItem, 'startsAt'> & { startsAt: string };

const API = '/api/v1/events';

const aEvento = (e: EventRaw): EventItem => ({ ...e, startsAt: new Date(e.startsAt) });

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);

  list(page = 1, pageSize = 20): Observable<EventPage> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http
      .get<{ items: EventRaw[]; total: number; page: number; pageSize: number }>(API, { params })
      .pipe(map((r) => ({ ...r, items: r.items.map(aEvento) })));
  }

  get(id: string): Observable<EventItem> {
    return this.http.get<{ event: EventRaw }>(`${API}/${id}`).pipe(map((r) => aEvento(r.event)));
  }

  create(data: EventInput): Observable<EventItem> {
    return this.http
      .post<{ event: EventRaw }>(API, { ...data, startsAt: data.startsAt.toISOString() })
      .pipe(map((r) => aEvento(r.event)));
  }

  update(id: string, changes: Partial<EventInput>): Observable<EventItem> {
    const body: Record<string, unknown> = { ...changes };
    if (changes.startsAt) body['startsAt'] = changes.startsAt.toISOString();
    return this.http
      .put<{ event: EventRaw }>(`${API}/${id}`, body)
      .pipe(map((r) => aEvento(r.event)));
  }

  cancel(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/${id}`);
  }
}