import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConfigService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sin cargar, no hay client id', () => {
    expect(service.googleClientId()).toBeNull();
  });

  it('load lee /config.json y expone el client id', () => {
    service.load().subscribe();

    http.expectOne('/config.json').flush({ googleClientId: 'abc.apps.googleusercontent.com' });

    expect(service.googleClientId()).toBe('abc.apps.googleusercontent.com');
  });

  it('si el archivo falta o falla, no rompe y queda sin client id', () => {
    let terminado = false;
    service.load().subscribe(() => (terminado = true));

    http.expectOne('/config.json').flush('', { status: 404, statusText: 'Not Found' });

    expect(terminado).toBe(true);
    expect(service.googleClientId()).toBeNull();
  });

  it('un client id vacío cuenta como no configurado', () => {
    service.load().subscribe();

    http.expectOne('/config.json').flush({ googleClientId: '' });

    expect(service.googleClientId()).toBeNull();
  });
});