export function planWorkers(env: string | undefined, cores: number): number {
    const pedido = Number(env);
    if (Number.isInteger(pedido) && pedido >= 1) return Math.min(pedido, cores);
    return Math.max(1, Math.min(4, Math.floor(cores / 2)));
  }
  
  // Evita un bucle de reinicios: si mueren demasiados workers en poco tiempo, se rinde.
  export class RestartPolicy {
    private marcas: number[] = [];
  
    constructor(
      private readonly max: number,
      private readonly ventanaMs: number,
    ) {}
  
    allow(ahora: number): boolean {
      this.marcas = this.marcas.filter((t) => ahora - t < this.ventanaMs);
      if (this.marcas.length >= this.max) return false;
      this.marcas.push(ahora);
      return true;
    }
  }