import { Prisma, PrismaClient } from '@prisma/client';
import { OccupancyEventInput, OccupancyReservationInput } from './occupancy';

export type ReportStatus = 'PENDIENTE' | 'EN_PROCESO' | 'LISTO' | 'ERROR';

export interface ReportRecord {
  id: string;
  requestedBy: string;
  status: ReportStatus;
  result: unknown;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface ReportsRepository {
  create(requestedBy: string): Promise<ReportRecord>;
  findById(id: string): Promise<ReportRecord | null>;
  setStatus(id: string, status: ReportStatus, extra?: Partial<ReportRecord>): Promise<void>;
  loadData(): Promise<{
    events: OccupancyEventInput[];
    reservations: OccupancyReservationInput[];
  }>;
}

export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(requestedBy: string): Promise<ReportRecord> {
    return this.prisma.report.create({ data: { requestedBy } });
  }

  async findById(id: string): Promise<ReportRecord | null> {
    return this.prisma.report.findUnique({ where: { id } });
  }

  async setStatus(id: string, status: ReportStatus, extra: Partial<ReportRecord> = {}) {
    await this.prisma.report.update({
      where: { id },
      data: {
        status,
        errorMessage: extra.errorMessage,
        finishedAt: extra.finishedAt,
        result: extra.result === undefined ? undefined : (extra.result as Prisma.InputJsonValue),
      },
    });
  }

  async loadData() {
    const [events, reservations] = await Promise.all([
      this.prisma.event.findMany(),
      this.prisma.reservation.findMany({
        select: { eventId: true, quantity: true, status: true },
      }),
    ]);
    return { events, reservations };
  }
}