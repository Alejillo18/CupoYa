import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { FakeReservationsRepository } from '../helpers/fakeReservationsRepository';

describe('ReservationsService', () => {
  let repo: FakeReservationsRepository;
  let service: ReservationsService;

  beforeEach(() => {
    repo = new FakeReservationsRepository();
    service = new ReservationsService(repo);
  });

  describe('reserve', () => {
    it('crea la reserva', async () => {
      const r = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 2 });

      expect(r.reservation).toMatchObject({ userId: 'u1', quantity: 2, status: 'CONFIRMADA' });
      expect(r.replayed).toBe(false);
    });

    it.each([0, 5, 1.5, -1, NaN])('rechaza la cantidad %s (400)', async (q) => {
      await expect(
        service.reserve({ userId: 'u1', eventId: 'e1', quantity: q }),
      ).rejects.toMatchObject({ status: 400, code: 'CANTIDAD_INVALIDA' });
    });

    it('traduce EVENTO_NO_ENCONTRADO a 404', async () => {
      repo.falla = 'EVENTO_NO_ENCONTRADO';
      await expect(
        service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 }),
      ).rejects.toMatchObject({ status: 404, code: 'EVENTO_NO_ENCONTRADO' });
    });

    it('traduce EVENTO_NO_DISPONIBLE a 409', async () => {
      repo.falla = 'EVENTO_NO_DISPONIBLE';
      await expect(
        service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 }),
      ).rejects.toMatchObject({ status: 409, code: 'EVENTO_NO_DISPONIBLE' });
    });

    it('traduce SIN_CUPO a 409 CUPO_INSUFICIENTE', async () => {
      repo.falla = 'SIN_CUPO';
      await expect(
        service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 }),
      ).rejects.toMatchObject({ status: 409, code: 'CUPO_INSUFICIENTE' });
    });

    it('traduce LIMITE_SUPERADO a 409', async () => {
      repo.falla = 'LIMITE_SUPERADO';
      await expect(
        service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 }),
      ).rejects.toMatchObject({ status: 409, code: 'LIMITE_SUPERADO' });
    });

    it('con la misma Idempotency-Key devuelve la misma reserva marcada como repetida', async () => {
      const a = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1, idempotencyKey: 'k' });
      const b = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1, idempotencyKey: 'k' });

      expect(b.reservation.id).toBe(a.reservation.id);
      expect(b.replayed).toBe(true);
    });
  });

  describe('listMine', () => {
    it('devuelve solo las reservas del usuario', async () => {
      await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 });
      await service.reserve({ userId: 'u2', eventId: 'e1', quantity: 1 });

      const lista = await service.listMine('u1');

      expect(lista).toHaveLength(1);
      expect(lista[0].userId).toBe('u1');
    });
  });

  describe('cancel', () => {
    it('el dueño cancela su reserva', async () => {
      const { reservation } = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 });

      const r = await service.cancel(reservation.id, { userId: 'u1', role: 'USUARIO' });

      expect(r.status).toBe('CANCELADA');
    });

    it('un ADMIN puede cancelar la de otro', async () => {
      const { reservation } = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 });

      const r = await service.cancel(reservation.id, { userId: 'adm', role: 'ADMIN' });

      expect(r.status).toBe('CANCELADA');
    });

    it('otro usuario recibe 403 y la reserva sigue confirmada', async () => {
      const { reservation } = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 });

      await expect(
        service.cancel(reservation.id, { userId: 'u2', role: 'USUARIO' }),
      ).rejects.toMatchObject({ status: 403, code: 'SIN_PERMISO' });
      expect(repo.reservas[0].status).toBe('CONFIRMADA');
    });

    it('una reserva inexistente devuelve 404', async () => {
      await expect(
        service.cancel('nada', { userId: 'u1', role: 'USUARIO' }),
      ).rejects.toMatchObject({ status: 404, code: 'RESERVA_NO_ENCONTRADA' });
    });

    it('cancelar dos veces no falla (idempotente)', async () => {
      const { reservation } = await service.reserve({ userId: 'u1', eventId: 'e1', quantity: 1 });
      await service.cancel(reservation.id, { userId: 'u1', role: 'USUARIO' });

      const r = await service.cancel(reservation.id, { userId: 'u1', role: 'USUARIO' });

      expect(r.status).toBe('CANCELADA');
    });
  });
});