import { RestartPolicy, planWorkers } from '../../src/cluster.config';

describe('planWorkers', () => {
  it('usa WEB_CONCURRENCY si es válido', () => {
    expect(planWorkers('6', 12)).toBe(6);
  });

  it('por defecto usa 4 o la mitad de los núcleos, lo que sea menor', () => {
    expect(planWorkers(undefined, 12)).toBe(4);
    expect(planWorkers(undefined, 2)).toBe(1);
  });

  it('nunca baja de 1 ni supera los núcleos', () => {
    expect(planWorkers('0', 12)).toBe(4);
    expect(planWorkers('abc', 12)).toBe(4);
    expect(planWorkers('50', 12)).toBe(12);
  });
});

describe('RestartPolicy', () => {
  it('permite reinicios hasta el máximo dentro de la ventana', () => {
    const p = new RestartPolicy(3, 10_000);
    expect(p.allow(0)).toBe(true);
    expect(p.allow(1000)).toBe(true);
    expect(p.allow(2000)).toBe(true);
    expect(p.allow(3000)).toBe(false);
  });

  it('olvida los reinicios viejos fuera de la ventana', () => {
    const p = new RestartPolicy(2, 1000);
    p.allow(0);
    p.allow(100);
    expect(p.allow(5000)).toBe(true);
  });
});