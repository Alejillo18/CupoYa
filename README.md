# CupoYa

![CI](https://github.com/Alejillo18/CupoYa/actions/workflows/ci.yml/badge.svg)

**Tu lugar, asegurado.** Plataforma de reserva de cupos para eventos, pensada para soportar alta concurrencia sin sobreventa.

Proyecto académico desarrollado con **Programación Extrema (XP)** y **TDD**.

## Estado del proyecto

| Iteración | Alcance | Estado |
|---|---|---|
| 1 | Registro, login, sesiones con refresh, roles, contenedores, frontend Angular | Completa (`v0.1.0`) |
| 2 | Login con Google | Completa (`v0.2.0`) |
| 3 | Eventos y administración de usuarios y roles | Completa (`v0.3.0`) |
| 4 | Reservas con control de concurrencia, cluster y prueba de carga | Completa (`v0.4.0`) |
| 5 | Reportes de ocupación en segundo plano (`worker_threads`) | Completa (`v0.5.0`) |
| 6 | CI, rate limiting con Redis, documentación OpenAPI y cierre | Completa (`v1.0.0`) |
| 7 | Interfaz con Angular Material | Completa (`v1.1.0`) |
| 8 | Contenedores de producción y pruebas de resistencia | Completa (`v1.2.0`) |
| 9 | Ocupación en vivo por WebSocket e interfaz renovada | Completa (`v1.3.0`) |
| 10 | Robustez del tiempo real: vencimiento de sesión, *heartbeat* y prueba de carga | Completa (`v1.4.0`) |
| 11 | Resiliencia del cliente ante saturación (503) y revisión de dependencias | Completa (`v1.5.0`) |

## Stack

- **Backend:** Node 22, Express, TypeScript, Prisma, PostgreSQL 16, Redis 7, `cluster` (multiproceso), `worker_threads` (Piscina) y WebSocket (`ws`)
- **Frontend:** Angular 21 (componentes standalone, signals) con Angular Material (tema M3), servido por nginx sin privilegios
- **Tiempo real:** WebSocket (`ws`) con difusión entre procesos por Redis pub/sub
- **Autenticación:** JWT + refresh token rotativo, Google Identity Services
- **Pruebas:** Jest + Supertest (backend), Vitest (frontend), integración contra PostgreSQL y Redis reales, k6 (carga y resistencia)
- **Infraestructura:** Docker, Docker Compose (base y overlay de producción) y GitHub Actions

## Estructura

```
cupoya/
├─ backend/                 API REST y WebSocket (Express + TypeScript)
├─ frontend/                Interfaz (Angular + nginx)
├─ load-tests/              Carga, resistencia y caos (k6, PowerShell) y verificación de consistencia
├─ .github/workflows/ci.yml
├─ docker-compose.yml       Desarrollo
├─ docker-compose.prod.yml  Overlay de producción (límites, reinicio, logs, sin puertos de BD)
├─ docker-compose.e2e.yml   Overlay para pruebas de resistencia (publica la base en 127.0.0.1:5433)
└─ .env.example
```

## Puesta en marcha

Requisitos: Docker Desktop (o Docker Engine + Compose).

1. Clonar el repositorio.
2. Copiar `.env.example` a `.env` y completar `DB_PASSWORD`, `JWT_SECRET` (mínimo 32 caracteres) y, opcionalmente, `GOOGLE_CLIENT_ID`.
3. Ejecutar:
   ```bash
   docker compose up --build -d
   ```
4. Abrir `http://localhost:8080`. La documentación interactiva de la API está en `http://localhost:8080/api/docs`.

Solo el frontend (nginx) atiende al navegador; reenvía `/api/` al backend por la red interna, de modo que navegador y API comparten origen. El backend corre en modo `cluster`: `WEB_CONCURRENCY` workers HTTP (4 por defecto), limitados a los núcleos que tenga disponibles el contenedor (con 2 CPU corren 2).

> Si cambiás `DB_USER` o `DB_PASSWORD` después de la primera ejecución, corré `docker compose down -v`: Postgres conserva las credenciales con las que se creó el volumen.

En desarrollo la base se publica en el puerto **5433** del host (para convivir con un PostgreSQL local en el 5432) y Redis en el **6379** (útil para las pruebas de integración).

### Producción

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

El overlay de producción agrega:

- **Límites de recursos** por contenedor, ajustados con las pruebas de resistencia:

  | Servicio | CPU | Memoria |
  |---|---|---|
  | Frontend (nginx) | 1,0 | 128 MB |
  | Backend (2 workers) | 2,0 | 1 GB |
  | PostgreSQL | 1,0 | 512 MB |
  | Redis | 0,5 | 128 MB |

- **Reinicio automático** (`unless-stopped`) y logs rotados (3 archivos de 10 MB).
- **Sin puertos de base ni Redis publicados** en el host.
- **Endurecimiento:** `no-new-privileges` y `cap_drop: ALL` en backend y frontend; el frontend usa `nginx-unprivileged` (sin root, puerto interno 8080) con cabeceras de seguridad, caché de estáticos y resolución DNS dinámica del backend.
- **Imagen del backend** de multi-etapa con solo dependencias de producción: de 1,15 GB a 689 MB.

### Roles

Los usuarios nuevos tienen rol `USUARIO`. Un `ADMIN` cambia roles desde `/usuarios`; el primer administrador se asigna editando el campo `role` en la base (por ejemplo con Prisma Studio). El rol viaja en el token y rige desde el próximo ingreso.

### Login con Google (opcional)

Requiere un Client ID de OAuth (tipo "Aplicación web") con `http://localhost:4200` y `http://localhost:8080` como orígenes autorizados. Se configura en `GOOGLE_CLIENT_ID` (backend) y en `frontend/public/config.json` (frontend). Sin Client ID, la app funciona solo con email y contraseña.

## API (prefijo `/api/v1`)

Especificación OpenAPI 3 en `/api/openapi.json` y Swagger UI en `/api/docs`.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/health` | Público | Estado del servicio |
| POST | `/auth/register` | Público | Registro (email y contraseña) |
| POST | `/auth/login` | Público | Login: access token en el cuerpo, refresh token en cookie httpOnly |
| POST | `/auth/google` | Público | Login con Google (crea o vincula la cuenta) |
| POST | `/auth/refresh` | Cookie | Renueva la sesión (rotación del refresh token) |
| POST | `/auth/logout` | Cookie | Cierra la sesión e invalida el token |
| GET | `/auth/me` | Autenticado | Usuario actual |
| GET | `/events` | Autenticado | Listado paginado de eventos activos y futuros |
| GET | `/events/:id` | Autenticado | Detalle de un evento |
| POST | `/events` | Operador, Admin | Crear evento |
| PUT | `/events/:id` | Operador, Admin | Editar evento (no baja el cupo por debajo de lo reservado) |
| DELETE | `/events/:id` | Operador, Admin | Cancelar evento (no se borra) |
| POST | `/events/:id/reservations` | Autenticado | Reservar 1 a 4 lugares; admite `Idempotency-Key` |
| GET | `/reservations/me` | Autenticado | Mis reservas |
| POST | `/reservations/:id/cancel` | Dueño o Admin | Cancelar reserva (libera el cupo, idempotente) |
| GET | `/users` | Admin | Listado paginado de usuarios |
| PATCH | `/users/:id/role` | Admin | Cambiar rol (siempre queda al menos un Admin) |
| WS | `/ws` | Admin | Ocupación de eventos en vivo (ver [Ocupación en vivo](#ocupación-en-vivo-websocket)) |
| POST | `/reports` | Admin | Solicitar reporte de ocupación (202, se genera en segundo plano) |
| GET | `/reports/:id` | Admin | Estado del reporte y, si está listo, el resultado |
| GET | `/reports/:id/download` | Admin | Descargar el reporte en CSV (409 si no está listo) |

Errores con formato unificado:

```json
{ "error": { "code": "CODIGO", "message": "Mensaje", "details": [] } }
```

### Servicio saturado o no disponible (503)

Ante una sobrecarga o una falla de infraestructura, la API y nginx responden con un 503 en el mismo formato, nunca con un 500 genérico ni con una conexión colgada. Siempre incluyen `Retry-After`:

| Código | Cuándo | `Retry-After` |
|---|---|---|
| `SERVICIO_SATURADO` | Se agotó el pool de conexiones a la base (pico de carga) | 1 s |
| `SERVICIO_NO_DISPONIBLE` | La base está caída o arrancando, o nginx no alcanza al backend | 2 s |

Los pedidos que fallan así no se aplicaron o se pueden repetir sin riesgo: las reservas llevan `Idempotency-Key` y la cancelación es idempotente.

El frontend traduce cada código a un mensaje claro y reintenta **una sola vez** las lecturas (GET) que fallan así, esperando lo que indique `Retry-After` (1 s si falta, con tope de 5 s); si el reintento funciona, la persona no ve ningún error. Las escrituras no se repiten solas: la reserva conserva su `Idempotency-Key` ante errores 5xx, de modo que repetirla a mano es seguro.

## Ocupación en vivo (WebSocket)

La pantalla `/reportes` (solo `ADMIN`) muestra la ocupación de hasta 5 eventos que se actualiza sola, sin recargar. El navegador abre un WebSocket en `/api/v1/ws`; nginx reenvía el *upgrade* con timeouts de 1 hora, y el proxy de desarrollo de Angular tiene `"ws": true`.

**Protocolo** (mensajes JSON, el tipo de cada uno identifica su función):

| Mensaje | Sentido | Descripción |
|---|---|---|
| `auth` | cliente → servidor | Primer mensaje obligatorio: lleva el access token. El token no viaja en la URL |
| `autenticado` | servidor → cliente | Confirma la sesión |
| `suscribir` | cliente → servidor | Lista de eventos a seguir (máximo 5) |
| `snapshot` | servidor → cliente | Estado actual de cada evento al suscribirse |
| `ocupacion` | servidor → cliente | Cambios de ocupación, agrupados cada 500 ms |
| `error` | servidor → cliente | Error de protocolo (por ejemplo, demasiados eventos) |

Códigos de cierre: `4401` (token inválido o vencido: el frontend renueva la sesión una vez y reintenta) y `4403` (sin permiso: no es `ADMIN`). Ante una caída de la conexión, el frontend reconecta con espera exponencial y muestra el estado (*En vivo*, *Reconectando*, *Desconectado*).

El servidor también protege sus recursos: cierra con `4401` ("Sesión vencida") la conexión cuyo access token venció, y el frontend renueva la sesión y reconecta; y cada 30 s envía un `ping` y termina las conexiones que no responden con `pong` (red caída, equipo suspendido), para no acumular sockets muertos ni suscripciones colgadas.

**Cómo escala:** cada worker del `cluster` mantiene su propio *hub* de conexiones. Cuando una reserva, una cancelación o la edición de un evento cambia la ocupación, el worker publica solo el **id del evento** en un canal de Redis; todos los workers reciben el aviso, leen el estado actual de la base y lo envían a sus clientes suscriptos. Así no se transmiten datos en el canal y un mensaje perdido se corrige con el siguiente. Si Redis falla, la reserva sigue funcionando (falla abierto) y solo se pierde la actualización en vivo; el puente registra como máximo un fallo cada 30 s (con la cantidad de avisos omitidos) y avisa cuando Redis se recupera. Se desactiva con `REALTIME_ENABLED=false`.

Para observarla desde la terminal (usa el login de un admin; ver el encabezado del script):

```bash
cd backend
WS_URL=ws://localhost:8080/api/v1/ws node --env-file=.env scripts/ws-ocupacion.js <id-del-evento>
```

## Concurrencia y paralelismo

- **Sin sobreventa:** la reserva es una transacción con un `UPDATE ... WHERE available_capacity >= qty` atómico; una restricción `CHECK` en la base actúa como segunda red.
- **Límite por usuario:** máximo 4 lugares por evento, serializado con un advisory lock por usuario y evento.
- **Idempotencia:** `(user_id, idempotency_key)` único; repetir un pedido con la misma clave devuelve la misma reserva.
- **Multiproceso:** `cluster` con política de reinicio de workers; sin estado en memoria (tokens autocontenidos, datos en PostgreSQL y contadores en Redis). Cada worker usa un pool de 10 conexiones a la base (`connection_limit`).
- **Multihilo:** los reportes de ocupación se calculan en un pool de `worker_threads` (Piscina, `REPORT_THREADS` hilos por proceso), fuera del *event loop* que atiende la API. El estado del reporte (`PENDIENTE`, `EN_PROCESO`, `LISTO`, `ERROR`) vive en la base, así que cualquier worker puede responder la consulta. Un reporte `EN_PROCESO` por más de 10 minutos se marca como `ERROR`.
- **Tiempo real multiproceso:** las conexiones WebSocket viven en cada worker; Redis pub/sub los coordina enviando solo ids de evento (ver [Ocupación en vivo](#ocupación-en-vivo-websocket)).

## Pruebas de carga y resistencia

### Prueba de reservas (k6)

Medición con 2.000 usuarios simultáneos sobre un evento de 3.000 lugares (demanda ≈ 5.000), ejecutada dentro de la red de Docker Compose en una PC de 12 núcleos:

| Medida | Sin reportes | Con 20 reportes en curso |
|---|---|---|
| Respuestas esperadas (201 o 409) | 2.000 de 2.000 | 2.000 de 2.000 |
| Errores o timeouts | 0 | 0 |
| Latencia p95 | ≈ 10 ms | ≈ 12 ms |
| Lugares confirmados | 3.000 = cupo | 3.000 = cupo |
| Usuarios con más de 4 lugares | 0 | 0 |

En la segunda columna, cada reporte ocupaba su hilo 3 s de CPU simulada (`REPORT_SIMULATED_WORK_MS=3000`) y los 20 terminaron en `LISTO`.

```bash
cd load-tests
LOAD_CAPACITY=3000 npm run preparar     # en PowerShell: $env:LOAD_CAPACITY=3000; npm run preparar
docker run --rm -i --network cupoya_default -e BASE_URL=http://backend:3000 \
  -v "$PWD:/scripts" -w /scripts grafana/k6 run reservas.js
npm run verify                          # comprueba que no hubo sobreventa
```

### Resistencia de punta a punta (nginx → API → PostgreSQL y Redis)

Cinco perfiles de k6 en `load-tests/e2e.js`, con usuarios sintéticos que listan eventos, reservan, cancelan y piden reportes, sobre un evento de 5.000 lugares y con los límites de producción:

| Perfil | Qué hace | Resultado |
|---|---|---|
| `mixta` | Carga sostenida realista, 200 VUs | 48.875 peticiones, 0 errores; p95 lectura 9,5 ms y reserva 16 ms; 12 de 12 reportes `LISTO` |
| `rampa` | Sube hasta encontrar el techo | Techo del conjunto ≈ **800 VUs** con el frontend a 1,0 CPU (≈ 500 con 0,5 y ≈ 1.000 con 2,0); sin errores, se degrada por latencia |
| `spike` | Salto a 2.000 VUs | Tras el pico vuelve a p95 8,6 ms con 0 errores; los errores del pico salen como 503 `SERVICIO_SATURADO` |
| `soak` | 29 min a 150 VUs | 246 mil peticiones, 0 errores, p95 9,3 ms; memoria del backend estable |
| `ws` | Como `mixta` (5 min) más 200 administradores con el WebSocket abierto | 200 de 200 conexiones, 0 cierres inesperados ni errores de protocolo; autenticación y primer estado en p95 ≤ 2 ms; ≈ 350 avisos/s (107.744 en total, todos los sockets recibieron); reserva p95 5,6 ms y 0 errores; memoria del backend estable (≈ 225 → 270 MB y vuelve a 257 MB al cerrar los sockets) |

> En Linux, `host.docker.internal` no se resuelve por defecto: correr k6 dentro de la red de Compose, por ejemplo `docker run --rm -i --network cupoya_default -e FASE=ws -e BASE_URL=http://frontend:8080 -v "$PWD:/scripts" -w /scripts grafana/k6 run e2e.js`. La fase `ws` usa el token del administrador de carga para los 200 sockets (`WS_CLIENTES` cambia la cantidad).

Tras cada corrida, `npm run verify` comprueba la **integridad**: sin sobreventa, nadie con más de 4 lugares y `disponibles + confirmados = total`. Se cumplió en todas las corridas, incluso después de matar a la fuerza el backend y la base.

### Pruebas de caos

| Falla | Comportamiento medido |
|---|---|
| Backend caído (`kill`) | nginx responde 503 JSON en ≤ 2 s; el contenedor se reinicia solo y vuelve a atender ~2 s después |
| PostgreSQL con `SIGKILL` | Sin pérdida de datos; solo 503, ningún 500; vuelve ~2 s después de arrancar |
| Redis caído o congelado | El limitador falla abierto en ≈ 1 s y el login sigue; al volver Redis se restablece el límite |

Para reproducirlas (en PowerShell, desde la raíz):

```powershell
$env:RATE_LIMIT_ENABLED = "false"   # para carga; "true" en la prueba de Redis
$env:JWT_ACCESS_TTL = "7200"
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.e2e.yml up -d --build

cd load-tests
npm run preparar                    # usuarios, tokens y evento de 5.000 lugares
docker run --rm -i -v "${PWD}:/scripts" -w /scripts -e FASE=mixta grafana/k6 run --quiet e2e.js   # mixta | rampa | spike | soak | ws
npm run verify
cd ..

.\load-tests\caos.ps1                          # caída del backend y de la base bajo carga
.\load-tests\redis-caos.ps1 -Modo pause        # o -Modo kill (con RATE_LIMIT_ENABLED = "true")
```

Los resultados dependen del equipo; la consistencia (cero sobreventa) es lo que se verifica siempre.

## Seguridad implementada

- Contraseñas con hash bcrypt; nunca se devuelven.
- Respuesta idéntica ante email inexistente o contraseña incorrecta.
- Bloqueo de cuenta 15 minutos tras 5 intentos fallidos (423).
- **Rate limiting** en `/auth/login`, `/register`, `/google` y `/refresh`: 20 pedidos por minuto por IP, contador compartido entre workers en Redis, respuesta 429 con `Retry-After`. Si Redis falla o no responde en 1 s, la API sigue (falla abierto). Se desactiva con `RATE_LIMIT_ENABLED=false`.
- **IP del cliente:** `trust proxy` confía en un solo salto (nginx), así que el límite no se puede esquivar falsificando `X-Forwarded-For`. Si se agrega otro proxy delante, hay que subir ese número.
- Access token JWT de 15 minutos, guardado solo en memoria en el frontend.
- Refresh token opaco, hasheado en base (SHA-256), con rotación y detección de reutilización (revoca toda la familia).
- Refresh token en cookie `httpOnly`, `SameSite=Strict`; solo se borra ante un 401, no ante errores transitorios.
- Login con Google: se verifica firma, vencimiento y audiencia del ID token; solo se acepta `email_verified`.
- Una cuenta creada con Google no tiene contraseña; registrarse primero con email y luego entrar con Google vincula ambas.
- Autorización por roles (`USUARIO`, `OPERADOR`, `ADMIN`) con middlewares `authenticate` y `authorize`, y guards en Angular.
- El CSV de reportes neutraliza textos que una planilla interpretaría como fórmulas.
- Contenedores de producción sin privilegios (frontend sin root, `no-new-privileges`, `cap_drop: ALL`) y sin puertos de base ni Redis expuestos.
- **Dependencias:** `npm audit --omit=dev` sin vulnerabilidades en el frontend. En el backend queda una alta en `deepmerge-ts`, dependencia de la CLI de Prisma (agotamiento de pila al fusionar objetos recursivos): solo se ejecuta al cargar la configuración de la CLI, nunca con datos de usuarios, y corregirla exige migrar a Prisma 7. Es un riesgo aceptado hasta esa migración.

## Desarrollo local

Requisitos: Node 22, Docker.

**Backend**

```bash
docker compose up -d db redis
cd backend
npm install
cp .env.example .env             # DATABASE_URL apuntando a localhost:5433
npx prisma migrate deploy
npm run dev                      # un proceso; para multiproceso: npm run dev:cluster
```

Variables de `backend/.env` (no se versiona): `DATABASE_URL` (puede incluir `?connection_limit=10`), `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `COOKIE_SECURE`, `GOOGLE_CLIENT_ID`, `WEB_CONCURRENCY`, `REPORT_THREADS`, `REDIS_URL`, `REALTIME_ENABLED`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `REPORT_SIMULATED_WORK_MS` (solo para pruebas de carga; en uso normal vale 0).

**Frontend**

```bash
cd frontend
npm install
npm start                        # http://localhost:4200, con proxy /api -> localhost:3000
```

### Pruebas

```bash
cd backend
npm test                  # unitarias (Jest)
npm run test:integration  # contra PostgreSQL y Redis reales (base cupoya_test)

cd ../frontend
npm test                  # Vitest
```

Para las de integración, crear la base de pruebas, migrarla y definir `TEST_DATABASE_URL` (y opcionalmente `TEST_REDIS_URL`) en `backend/.env.test`:

```bash
docker compose up -d db redis
docker compose exec db psql -U cupoya -d cupoya -c "CREATE DATABASE cupoya_test;"
```

```ini
# backend/.env.test (no se versiona; la clave va codificada como URL y el valor entre comillas)
TEST_DATABASE_URL="postgresql://cupoya:<CLAVE>@localhost:5433/cupoya_test"
TEST_REDIS_URL="redis://localhost:6379"
```

> `node --env-file` **no pisa** las variables que ya existan en la terminal: si hay una `TEST_DATABASE_URL` exportada de antes, gana sobre el archivo. Ante un `Can't reach database server` inesperado, correr `unset TEST_DATABASE_URL TEST_REDIS_URL DATABASE_URL`.

Estado actual: backend 297 unitarias y 53 de integración (incluye concurrencia real contra PostgreSQL, un hilo real de `worker_threads` y Redis, y el puente de ocupación por Redis pub/sub); frontend 304. Total: 654.

### Cobertura de pruebas

| Suite | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| Backend, unitarias (297) | 95,03 % | 88,97 % | 92,30 % | 95,17 % |
| Backend, integración (53) | 86,74 % | 77,58 % | 85,71 % | 86,70 % |
| Frontend (304) | 94,20 % | 93,75 % | 85,97 % | 96,19 % |

- Las de integración miden solo los archivos que ejercitan (repositorios, pool de reportes y limitador con Redis); se leen junto con las unitarias, no en su lugar.
- En el frontend, la cobertura de funciones baja porque V8 cuenta como funciones los manejadores de eventos de las plantillas HTML. Los puntos bajos reales son `app.routes.ts` (las rutas de carga diferida se verifican por su configuración, no se navega a cada una) y `google-auth.service.ts` (carga del script externo de Google).

Para medirla (en PowerShell se llama a las herramientas directamente, porque `--` no llega a `npm`):

```bash
cd backend
npx jest --coverage                                                        # unitarias
node --env-file=.env.test node_modules/jest/bin/jest.js --config jest.integration.config.js --runInBand --coverage   # integración (necesita Redis en el 6379)

cd ../frontend
npx ng test --no-watch --coverage                                          # requiere @vitest/coverage-v8
```

### Integración continua

GitHub Actions (`.github/workflows/ci.yml`) ejecuta en cada push: compilación y pruebas unitarias del backend, migraciones y pruebas de integración con servicios PostgreSQL y Redis, pruebas y build de producción del frontend, y construcción de las imágenes Docker.

## Metodología

- **TDD:** cada cambio empieza con una prueba que falla (`test:`), seguida del código (`feat:` o `fix:`). Los arreglos de resistencia siguieron el mismo ciclo: el defecto se reprodujo primero con una prueba o un experimento y recién después se corrigió.
- **Commits:** Conventional Commits (`test`, `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`, `build`, `perf`).
- **Iteraciones** cortas con historias de usuario priorizadas por el cliente; versiones etiquetadas en git.
- Las pruebas de integración detectan defectos que las unitarias no ven (ej.: corrimiento de zona horaria en `lockedUntil`), el CI detectó una dependencia no declarada (`jest-util`) y las pruebas de resistencia encontraron cuatro defectos que ninguna prueba funcional veía (nginx con la IP de un backend muerto, el login colgado con Redis congelado, el límite de intentos esquivable con `X-Forwarded-For` y los 500 ante saturación o caída de la base).

## Historial de versiones

| Versión | Contenido |
|---|---|
| `v1.5.0` | Mensajes específicos ante saturación y caída momentánea del servicio (503); reintento único de las lecturas con `Retry-After`; `qs` actualizado para corregir una vulnerabilidad moderada; riesgo aceptado documentado para la dependencia de la CLI de Prisma |
| `v1.4.0` | El servidor de tiempo real cierra con 4401 las sesiones vencidas y detecta conexiones muertas con ping/pong; el puente de Redis limita el registro de fallos y avisa al recuperarse; prueba de carga con 200 administradores conectados por WebSocket (0 cierres inesperados, reservas p95 5,6 ms, memoria estable) |
| `v1.3.0` | Ocupación de eventos en vivo por WebSocket (`/api/v1/ws`) con difusión entre procesos por Redis; gráfico en `/reportes`; login y registro rediseñados (ver contraseña, requisitos, errores sin superposición); formulario de eventos con calendario y hora en 24 h; nginx con *upgrade* de WebSocket |
| `v1.2.0` | Imagen del backend de 1,15 GB a 689 MB; frontend sin root; compose de producción con límites, reinicio y logs rotados; pruebas de resistencia y caos; respuestas 503 ante saturación o caída; timeout del limitador; `trust proxy` de un salto; cobertura medida |
| `v1.1.0` | Migración del frontend a Angular Material (tabla, paginador y notificaciones; menú desplegable; carga diferida de rutas) |
| `v1.0.0` | CI, rate limiting con Redis, documentación OpenAPI y cierre del MVP |
| `v0.2.0` a `v0.5.0` | Login con Google, eventos y usuarios, reservas con cluster, reportes asíncronos |

## Documentación

La documentación completa (requerimientos, historias de usuario, arquitectura, plan de pruebas, evidencia de XP) se mantiene en el documento del proyecto.