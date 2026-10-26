import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { GoogleAuthService } from '../../core/google-auth.service';
import { NotificationService } from '../../core/notification.service';
import { GoogleButtonComponent } from './google-button.component';

describe('GoogleButtonComponent', () => {
  let auth: { loginWithGoogle: ReturnType<typeof vi.fn> };
  let google: { renderButton: ReturnType<typeof vi.fn> };
  let notif: { error: ReturnType<typeof vi.fn> };
  let router: Router;

  async function crear() {
    const fixture = TestBed.createComponent(GoogleButtonComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    auth = { loginWithGoogle: vi.fn() };
    google = { renderButton: vi.fn().mockResolvedValue(true) };
    notif = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: GoogleAuthService, useValue: google },
        { provide: NotificationService, useValue: notif },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('pide dibujar el botón en su contenedor', async () => {
    await crear();

    expect(google.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.any(Function));
  });

  it('al recibir el token inicia sesión y navega a /inicio', async () => {
    auth.loginWithGoogle.mockReturnValue(of({ user: {}, accessToken: 't' }));
    await crear();
    const onToken = google.renderButton.mock.calls[0][1];

    onToken('id-token');

    expect(auth.loginWithGoogle).toHaveBeenCalledWith('id-token');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inicio');
  });

  it('con 401 notifica el mensaje de Google', async () => {
    auth.loginWithGoogle.mockReturnValue(throwError(() => ({ status: 401 })));
    await crear();

    google.renderButton.mock.calls[0][1]('malo');

    expect(notif.error).toHaveBeenCalledWith('No pudimos verificar tu cuenta de Google.');
  });

  it('con 423 notifica cuenta bloqueada', async () => {
    auth.loginWithGoogle.mockReturnValue(throwError(() => ({ status: 423 })));
    await crear();

    google.renderButton.mock.calls[0][1]('tok');

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('bloqueada'));
  });

  it('con otro error 4xx notifica un mensaje genérico', async () => {
    auth.loginWithGoogle.mockReturnValue(throwError(() => ({ status: 400 })));
    await crear();

    google.renderButton.mock.calls[0][1]('tok');

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('Ocurrió un error'));
  });

  it('con 500 no notifica (ya lo avisa el interceptor)', async () => {
    auth.loginWithGoogle.mockReturnValue(throwError(() => ({ status: 500 })));
    await crear();

    google.renderButton.mock.calls[0][1]('tok');

    expect(notif.error).not.toHaveBeenCalled();
  });
});