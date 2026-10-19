import {
    EventChanges,
    EventRecord,
    EventRepository,
    NewEvent,
  } from '../../src/modules/events/events.repository';
  
  export class FakeEventRepository implements EventRepository {
    events: EventRecord[] = [];
  
    async create(data: NewEvent) {
      const e: EventRecord = {
        id: `ev-${this.events.length + 1}`,
        description: '',
        ...data,
        availableCapacity: data.totalCapacity,
        status: 'ACTIVO',
        createdAt: new Date(),
      };
      this.events.push(e);
      return e;
    }
  
    async findById(id: string) {
      return this.events.find((e) => e.id === id) ?? null;
    }
  
    async list(opts: { page: number; pageSize: number; from: Date; includeCancelled: boolean }) {
      const all = this.events
        .filter((e) => e.startsAt >= opts.from)
        .filter((e) => opts.includeCancelled || e.status === 'ACTIVO')
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const start = (opts.page - 1) * opts.pageSize;
      return { items: all.slice(start, start + opts.pageSize), total: all.length };
    }
  
    async update(id: string, data: EventChanges) {
      const e = this.events.find((x) => x.id === id);
      if (!e) return null;
      if (data.totalCapacity !== undefined) {
        const reservados = e.totalCapacity - e.availableCapacity;
        if (data.totalCapacity < reservados) return null;
        e.availableCapacity = data.totalCapacity - reservados;
      }
      Object.assign(e, data);
      return e;
    }
  
    async cancel(id: string) {
      const e = this.events.find((x) => x.id === id);
      if (!e) return null;
      e.status = 'CANCELADO';
      return e;
    }
  }