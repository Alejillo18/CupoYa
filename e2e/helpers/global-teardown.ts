import { limpiarDatosDePrueba } from './db';

export default async function globalTeardown() {
  await limpiarDatosDePrueba();
}
