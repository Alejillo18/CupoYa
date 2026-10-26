import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { NotificationService } from '../../core/notification.service';
import { UsersService } from '../../core/users.service';
import { UsersListComponent } from './users-list.component';

const usuario = (id: string, role: 'USUARIO' | 'OPERADOR' | 'ADMIN' = 'USUARIO', bloqueado = false) => ({
  id,
  email: `${id}@mail.com`,
  role,
  bloqueado,
  createdAt: new Date('2026-10-01T00:00:00Z'),
});

const pagina = (items: ReturnType<typeof usuario>[], total = items.length, page = 1) => ({
  items,
  total,
  page,
  pageSize: 10,
});

describe('UsersListComponent', () => {
  let users: { list: ReturnType<typeof vi.fn>; changeRole: ReturnType<typeof vi.fn> };
  let notif: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function crear() {
    const fixture = TestBed.createComponent(UsersListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    users = { list: vi.fn(), changeRole: vi.fn() };
    notif = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: UsersService, useValue: users },
        { provide: NotificationService, useValue: notif },
      ],
    });
  });

  it('carga la primera página al iniciar', async () => {
    users.list.mockReturnValue(of(pagina([])));

    await crear();

    expect(users.list).toHaveBeenCalledWith(1, 10);
  });

  it('muestra email, rol y estado de bloqueo en una tabla de Material', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a', 'ADMIN'), usuario('b', 'USUARIO', true)])));

    const f = await crear();

    const texto = f.nativeElement.textContent;
    expect(texto).toContain('a@mail.com');
    expect(texto).toContain('b@mail.com');
    expect(texto).toContain('Bloqueado');
    expect(f.nativeElement.querySelector('table[mat-table]')).not.toBeNull();
  });

  it('ofrece un paginador de Material cuando hay usuarios', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a')], 25)));

    const f = await crear();

    expect(f.nativeElement.querySelector('mat-paginator')).not.toBeNull();
  });

  it('muestra el aviso de que el cambio rige desde el próximo ingreso', async () => {
    users.list.mockReturnValue(of(pagina([])));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('próximo ingreso');
  });

  it('cambiar el rol llama a la API, actualiza la fila y avisa del éxito', async () => {
    users.list.mockReturnValue(of(pagina([usuario('b')])));
    users.changeRole.mockReturnValue(of(usuario('b', 'OPERADOR')));
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'OPERADOR');

    expect(users.changeRole).toHaveBeenCalledWith('b', 'OPERADOR');
    expect(f.componentInstance.items()[0].role).toBe('OPERADOR');
    expect(notif.success).toHaveBeenCalledWith(expect.stringContaining('OPERADOR'));
  });

  it('con ULTIMO_ADMIN notifica el motivo y conserva el rol anterior', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a', 'ADMIN')])));
    users.changeRole.mockReturnValue(
      throwError(() => ({ status: 409, error: { error: { code: 'ULTIMO_ADMIN' } } })),
    );
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'USUARIO');

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('al menos un administrador'));
    expect(f.componentInstance.items()[0].role).toBe('ADMIN');
  });

  it('con otro error 4xx notifica un mensaje genérico', async () => {
    users.list.mockReturnValue(of(pagina([usuario('b')])));
    users.changeRole.mockReturnValue(throwError(() => ({ status: 403 })));
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'ADMIN');

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('No pudimos cambiar el rol'));
  });

  it.each([0, 429, 500])(
    'con %i no notifica (lo avisa el interceptor) y conserva el rol',
    async (status) => {
      users.list.mockReturnValue(of(pagina([usuario('b')])));
      users.changeRole.mockReturnValue(throwError(() => ({ status })));
      const f = await crear();

      f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'ADMIN');

      expect(notif.error).not.toHaveBeenCalled();
      expect(f.componentInstance.items()[0].role).toBe('USUARIO');
    },
  );

  it('ante un error de carga muestra mensaje y permite reintentar', async () => {
    users.list.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('No pudimos cargar los usuarios');
    expect(f.nativeElement.textContent).toContain('Reintentar');

    users.list.mockReturnValue(of(pagina([usuario('a')])));
    f.componentInstance.cargar(1);
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('a@mail.com');
    expect(f.nativeElement.textContent).not.toContain('No pudimos cargar los usuarios');
  });

  it('paginación: al cambiar de página pide la página elegida', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a')], 25)));
    const f = await crear();

    users.list.mockReturnValue(of(pagina([usuario('b')], 25, 2)));
    f.componentInstance.alPaginar({ pageIndex: 1, previousPageIndex: 0, pageSize: 10, length: 25 });

    expect(users.list).toHaveBeenLastCalledWith(2, 10);
  });
});