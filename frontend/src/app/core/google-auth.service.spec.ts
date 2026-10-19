import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { ConfigService } from './config.service';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  const clientId = signal<string | null>('cid.apps.googleusercontent.com');
  let initialize: ReturnType<typeof vi.fn>;
  let renderButton: ReturnType<typeof vi.fn>;
  let service: GoogleAuthService;

  beforeEach(() => {
    clientId.set('cid.apps.googleusercontent.com');
    initialize = vi.fn();
    renderButton = vi.fn();
    (window as any).google = { accounts: { id: { initialize, renderButton } } };

    TestBed.configureTestingModule({
      providers: [{ provide: ConfigService, useValue: { googleClientId: clientId } }],
    });
    service = TestBed.inject(GoogleAuthService);
  });

  afterEach(() => {
    delete (window as any).google;
  });

  it('inicializa con el client id y dibuja el botón', async () => {
    const el = document.createElement('div');

    const ok = await service.renderButton(el, () => undefined);

    expect(ok).toBe(true);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'cid.apps.googleusercontent.com' }),
    );
    expect(renderButton).toHaveBeenCalledWith(el, expect.any(Object));
  });

  it('entrega el ID token al callback cuando Google responde', async () => {
    const recibido = vi.fn();
    await service.renderButton(document.createElement('div'), recibido);

    const { callback } = initialize.mock.calls[0][0];
    callback({ credential: 'id-token-xyz' });

    expect(recibido).toHaveBeenCalledWith('id-token-xyz');
  });

  it('ignora respuestas sin credential', async () => {
    const recibido = vi.fn();
    await service.renderButton(document.createElement('div'), recibido);

    initialize.mock.calls[0][0].callback({});

    expect(recibido).not.toHaveBeenCalled();
  });

  it('sin client id no dibuja nada y devuelve false', async () => {
    clientId.set(null);

    const ok = await service.renderButton(document.createElement('div'), () => undefined);

    expect(ok).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
  });
});