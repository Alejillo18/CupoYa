import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
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

  async function crear() {
    const fixture = TestBed.createComponent(UsersListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    users = { list: vi.fn(), changeRole: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: UsersService, useValue: users }],
    });
  });

  it('carga la primera página al iniciar', async () => {
    users.list.mockReturnValue(of(pagina([])));

    await crear();

    expect(users.list).toHaveBeenCalledWith(1, 10);
  });

  it('muestra email, rol y estado de bloqueo', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a', 'ADMIN'), usuario('b', 'USUARIO', true)])));

    const f = await crear();

    const texto = f.nativeElement.textContent;
    expect(texto).toContain('a@mail.com');
    expect(texto).toContain('b@mail.com');
    expect(texto).toContain('Bloqueado');
  });

  it('muestra el aviso de que el cambio rige desde el próximo ingreso', async () => {
    users.list.mockReturnValue(of(pagina([])));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('próximo ingreso');
  });

  it('cambiar el rol llama a la API y actualiza la fila', async () => {
    users.list.mockReturnValue(of(pagina([usuario('b')])));
    users.changeRole.mockReturnValue(of(usuario('b', 'OPERADOR')));
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'OPERADOR');

    expect(users.changeRole).toHaveBeenCalledWith('b', 'OPERADOR');
    expect(f.componentInstance.items()[0].role).toBe('OPERADOR');
  });

  it('con ULTIMO_ADMIN muestra el mensaje y conserva el rol anterior', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a', 'ADMIN')])));
    users.changeRole.mockReturnValue(
      throwError(() => ({ status: 409, error: { error: { code: 'ULTIMO_ADMIN' } } })),
    );
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'USUARIO');

    expect(f.componentInstance.error()).toContain('al menos un administrador');
    expect(f.componentInstance.items()[0].role).toBe('ADMIN');
  });

  it('con otro error muestra un mensaje genérico', async () => {
    users.list.mockReturnValue(of(pagina([usuario('b')])));
    users.changeRole.mockReturnValue(throwError(() => ({ status: 500 })));
    const f = await crear();

    f.componentInstance.cambiarRol(f.componentInstance.items()[0], 'ADMIN');

    expect(f.componentInstance.error()).toContain('No pudimos cambiar el rol');
  });

  it('ante un error de carga muestra mensaje', async () => {
    users.list.mockReturnValue(throwError(() => ({ status: 500 })));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('No pudimos cargar los usuarios');
  });

  it('paginación: siguiente pide la página 2', async () => {
    users.list.mockReturnValue(of(pagina([usuario('a')], 25)));
    const f = await crear();

    users.list.mockReturnValue(of(pagina([usuario('b')], 25, 2)));
    f.componentInstance.siguiente();

    expect(users.list).toHaveBeenLastCalledWith(2, 10);
  });
});