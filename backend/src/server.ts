import { createApp } from './app';

const port = Number(process.env.PORT) || 3000;

createApp().listen(port, () => {
  console.log(`CupoYa backend escuchando en el puerto ${port}`);
});