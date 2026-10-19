import { AppError } from '../../errors/AppError';
import { EventChanges, EventRecord, EventRepository, NewEvent } from './events.repository';

const MAX_PAGE_SIZE = 100;

export interface EventPage {
  items: EventRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export class EventsService {
  constructor(
    private readonly events: EventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(data: NewEvent): Promise<EventRecord> {
    this.assertFutureDate(data.startsAt);
    if (!Number.isInteger(data.totalCapacity) || data.totalCapacity <= 0) {
      throw new AppError(400, 'CUPO_INVALIDO', 'El cupo debe ser un entero mayor a cero.');
    }
    return this.events.create(data);
  }

  async get(id: string): Promise<EventRecord> {
    const event = await this.events.findById(id);
    if (!event) {
      throw new AppError(404, 'EVENTO_NO_ENCONTRADO', 'El evento no existe.');
    }
    return event;
  }

  async list(opts: { page?: number; pageSize?: number }): Promise<EventPage> {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize ?? 20)));
    const { items, total } = await this.events.list({
      page,
      pageSize,
      from: this.now(),
      includeCancelled: false,
    });
    return { items, total, page, pageSize };
  }

  async update(id: string, changes: EventChanges): Promise<EventRecord> {
    const current = await this.get(id);
    if (current.status === 'CANCELADO') {
      throw new AppError(409, 'EVENTO_CANCELADO', 'No se puede editar un evento cancelado.');
    }
    if (changes.startsAt) this.assertFutureDate(changes.startsAt);
    if (
      changes.totalCapacity !== undefined &&
      (!Number.isInteger(changes.totalCapacity) || changes.totalCapacity <= 0)
    ) {
      throw new AppError(400, 'CUPO_INVALIDO', 'El cupo debe ser un entero mayor a cero.');
    }

    const updated = await this.events.update(id, changes);
    if (!updated) {

      throw new AppError(
        409,
        'CUPO_MENOR_A_RESERVAS',
        'El cupo total no puede ser menor a los lugares ya reservados.',
      );
    }
    return updated;
  }

  async cancel(id: string): Promise<void> {
    const cancelled = await this.events.cancel(id);
    if (!cancelled) {
      throw new AppError(404, 'EVENTO_NO_ENCONTRADO', 'El evento no existe.');
    }
  }

  private assertFutureDate(date: Date): void {
    if (date <= this.now()) {
      throw new AppError(400, 'FECHA_PASADA', 'La fecha del evento debe ser futura.');
    }
  }
}