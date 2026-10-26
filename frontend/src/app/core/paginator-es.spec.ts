import { PaginatorEs } from './paginator-es';

describe('PaginatorEs', () => {
  const p = new PaginatorEs();

  it('traduce las etiquetas al español', () => {
    expect(p.itemsPerPageLabel).toBe('Elementos por página:');
    expect(p.nextPageLabel).toBe('Página siguiente');
    expect(p.previousPageLabel).toBe('Página anterior');
  });

  it.each([
    [0, 10, 25, '1 – 10 de 25'],
    [2, 10, 25, '21 – 25 de 25'],
    [0, 10, 0, '0 de 0'],
  ])('arma el rango (página %i, tamaño %i, total %i)', (pagina, tamano, total, esperado) => {
    expect(p.getRangeLabel(pagina, tamano, total)).toBe(esperado);
  });
});