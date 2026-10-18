import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let auth: { user: ReturnType<typeof signal>; logout: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    auth = {
      user: signal({ id: 'u1', email: 'ana@mail.com', role: 'OPERADOR' }),
      logout: vi.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('muestra el email y el rol del usuario', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('ana@mail.com');
    expect(texto).toContain('OPERADOR');
  });

  it('cerrar sesión llama a logout y navega a /login', () => {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();

    fixture.componentInstance.logout();

    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});