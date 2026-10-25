import { routes } from './app.routes';

describe('rutas de eventos', () => {
  const guardas = (path: string) => routes.find((r) => r.path === path)?.canActivate ?? [];

  it('existe /eventos/nuevo protegida con guard', () => {
    expect(guardas('eventos/nuevo').length).toBeGreaterThan(0);
  });

  it('existe /eventos/:id/editar protegida con guard', () => {
    expect(guardas('eventos/:id/editar').length).toBeGreaterThan(0);
  });

  it('/eventos/nuevo está declarada antes que cualquier ruta con parámetro', () => {
    const paths = routes.map((r) => r.path);
    expect(paths.indexOf('eventos/nuevo')).toBeLessThan(paths.indexOf('**'));
  });
});