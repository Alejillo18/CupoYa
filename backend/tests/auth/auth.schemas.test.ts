import { registerSchema } from '../../src/modules/auth/auth.schemas';

describe('registerSchema', () => {
  it('acepta datos válidos', () => {
    const r = registerSchema.safeParse({ email: 'ana@mail.com', password: 'Clave1234' });
    expect(r.success).toBe(true);
  });

  it('rechaza un email inválido', () => {
    const r = registerSchema.safeParse({ email: 'no-es-email', password: 'Clave1234' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    const r = registerSchema.safeParse({ email: 'ana@mail.com', password: 'Ab1' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseñas sin números', () => {
    const r = registerSchema.safeParse({ email: 'ana@mail.com', password: 'SoloLetras' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseñas sin letras', () => {
    const r = registerSchema.safeParse({ email: 'ana@mail.com', password: '12345678' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseñas de más de 72 caracteres (límite de bcrypt)', () => {
    const r = registerSchema.safeParse({ email: 'ana@mail.com', password: 'a1'.repeat(40) });
    expect(r.success).toBe(false);
  });
});