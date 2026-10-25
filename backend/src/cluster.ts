import cluster from 'node:cluster';
import os from 'node:os';
import { RestartPolicy, planWorkers } from './cluster.config';

if (cluster.isPrimary) {
  const n = planWorkers(process.env.WEB_CONCURRENCY, os.availableParallelism());
  const politica = new RestartPolicy(5, 60_000);
  console.log(`CupoYa: proceso primario ${process.pid}, levantando ${n} workers`);

  for (let i = 0; i < n; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} terminó (${signal ?? code})`);
    if (shuttingDown) return;
    if (politica.allow(Date.now())) cluster.fork();
    else {
      console.error('Demasiados reinicios seguidos: se detiene el servicio.');
      process.exit(1);
    }
  });

  let shuttingDown = false;
  const apagar = () => {
    shuttingDown = true;
    for (const w of Object.values(cluster.workers ?? {})) w?.process.kill('SIGTERM');
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
} else {
  require('./server');
}