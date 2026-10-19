import { PrismaClient } from '@prisma/client';

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  venue: string;
  startsAt: Date;
  totalCapacity: number;
  availableCapacity: number;
  status: 'ACTIVO' | 'CANCELADO';
  createdAt: Date;
}

export interface NewEvent {
  name: string;
  description?: string;
  venue: string;
  startsAt: Date;
  totalCapacity: number;
}

export type EventChanges = Partial<NewEvent>;

export interface EventRepository {
  create(data: NewEvent): Promise<EventRecord>;
  findById(id: string): Promise<EventRecord | null>;
  list(opts: {
    page: number;
    pageSize: number;
    from: Date;
    includeCancelled: boolean;
  }): Promise<{ items: EventRecord[]; total: number }>;

  update(id: string, data: EventChanges): Promise<EventRecord | null>;
  cancel(id: string): Promise<EventRecord | null>;
}

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewEvent): Promise<EventRecord> {
    return this.prisma.event.create({
      data: { ...data, availableCapacity: data.totalCapacity },
    });
  }

  async findById(id: string): Promise<EventRecord | null> {
    return this.prisma.event.findUnique({ where: { id } });
  }

  async list(opts: { page: number; pageSize: number; from: Date; includeCancelled: boolean }) {
    const where = {
      startsAt: { gte: opts.from },
      ...(opts.includeCancelled ? {} : { status: 'ACTIVO' as const }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.event.count({ where }),
    ]);
    return { items, total };
  }

  async update(id: string, data: EventChanges): Promise<EventRecord | null> {
    const { totalCapacity, ...rest } = data;

    if (totalCapacity === undefined) {
      const r = await this.prisma.event.updateMany({ where: { id }, data: rest });
      return r.count === 0 ? null : this.findById(id);
    }

    const filas = await this.prisma.$executeRaw`
      UPDATE events
         SET available_capacity = available_capacity + (${totalCapacity}::int - total_capacity),
             total_capacity = ${totalCapacity}::int
       WHERE id = ${id}::uuid
         AND total_capacity - available_capacity <= ${totalCapacity}::int`;
    if (filas === 0) return null;

    if (Object.keys(rest).length > 0) {
      await this.prisma.event.update({ where: { id }, data: rest });
    }
    return this.findById(id);
  }

  async cancel(id: string): Promise<EventRecord | null> {
    const r = await this.prisma.event.updateMany({
      where: { id },
      data: { status: 'CANCELADO' },
    });
    return r.count === 0 ? null : this.findById(id);
  }
}