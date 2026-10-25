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

## Stack

- **Backend:** Node 22, Express, TypeScript, Prisma, PostgreSQL 16, Redis 7, `cluster` (multiproceso) y `worker_threads` (Piscina)
- **Frontend:** Angular 21 (componentes standalone, signals), servido por nginx
- **Autenticación:** JWT + refresh token rotativo, Google Identity Services
- **Pruebas:** Jest + Supertest (backend), Vitest (frontend), integración contra PostgreSQL y Redis reales, k6 (carga)
- **Infraestructura:** Docker, Docker Compose y GitHub Actions

## Estructura

```
cupoya/
├─ backend/        API REST (Express + TypeScript)
├─ frontend/       Interfaz (Angular + nginx)
├─ load-tests/     Pruebas de carga (k6) y verificación de consistencia
├─ .github/workflows/ci.yml
├─ docker-compose.yml
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

Solo el frontend (nginx) se expone al host; reenvía `/api/` al backend por la red interna, de modo que navegador y API comparten origen. El backend corre en modo `cluster` (4 workers HTTP por defecto, configurable con `WEB_CONCURRENCY`).

> Si cambiás `DB_USER` o `DB_PASSWORD` después de la primera ejecución, corré `docker compose down -v`: Postgres conserva las credenciales con las que se creó el volumen.

La base se publica en el puerto **5433** del host (para convivir con un PostgreSQL local en el 5432) y Redis en el **6379** (útil para las pruebas de integración).

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
| POST | `/reports` | Admin | Solicitar reporte de ocupación (202, se genera en segundo plano) |
| GET | `/reports/:id` | Admin | Estado del reporte y, si está listo, el resultado |
| GET | `/reports/:id/download` | Admin | Descargar el reporte en CSV (409 si no está listo) |

Errores con formato unificado:

```json
{ "error": { "code": "CODIGO", "message": "Mensaje", "details": [] } }
```

## Concurrencia y paralelismo

- **Sin sobreventa:** la reserva es una transacción con un `UPDATE ... WHERE available_capacity >= qty` atómico; una restricción `CHECK` en la base actúa como segunda red.
- **Límite por usuario:** máximo 4 lugares por evento, serializado con un advisory lock por usuario y evento.
- **Idempotencia:** `(user_id, idempotency_key)` único; repetir un pedido con la misma clave devuelve la misma reserva.
- **Multiproceso:** `cluster` con política de reinicio de workers; sin estado en memoria (tokens autocontenidos, datos en PostgreSQL y contadores en Redis).
- **Multihilo:** los reportes de ocupación se calculan en un pool de `worker_threads` (Piscina, `REPORT_THREADS` hilos por proceso), fuera del *event loop* que atiende la API. El estado del reporte (`PENDIENTE`, `EN_PROCESO`, `LISTO`, `ERROR`) vive en la base, así que cualquier worker puede responder la consulta. Un reporte `EN_PROCESO` por más de 10 minutos se marca como `ERROR`.

### Prueba de carga (k6)

Medición con 2.000 usuarios simultáneos sobre un evento de 3.000 lugares (demanda ≈ 5.000), ejecutada dentro de la red de Docker Compose en una PC de 12 núcleos:

| Medida | Sin reportes | Con 20 reportes en curso |
|---|---|---|
| Respuestas esperadas (201 o 409) | 2.000 de 2.000 | 2.000 de 2.000 |
| Errores o timeouts | 0 | 0 |
| Latencia p95 | ≈ 10 ms | ≈ 12 ms |
| Lugares confirmados | 3.000 = cupo | 3.000 = cupo |
| Usuarios con más de 4 lugares | 0 | 0 |

En la segunda columna, cada reporte ocupaba su hilo 3 s de CPU simulada (`REPORT_SIMULATED_WORK_MS=3000`) y los 20 terminaron en `LISTO`. La diferencia de latencia está dentro del ruido entre corridas.

Para reproducirla (backend y base levantados con `docker compose up -d`; el `JWT_SECRET` de `backend/.env` debe coincidir con el de `.env`):

```bash
cd load-tests
LOAD_CAPACITY=3000 npm run preparar     # en PowerShell: $env:LOAD_CAPACITY=3000; npm run preparar
docker run --rm -i --network cupoya_default -e BASE_URL=http://backend:3000 \
  -v "$PWD:/scripts" -w /scripts grafana/k6 run reservas.js
npm run verify                          # comprueba que no hubo sobreventa
```

Los resultados dependen del equipo; la consistencia (cero sobreventa) es lo que se verifica siempre.

## Seguridad implementada

- Contraseñas con hash bcrypt; nunca se devuelven.
- Respuesta idéntica ante email inexistente o contraseña incorrecta.
- Bloqueo de cuenta 15 minutos tras 5 intentos fallidos (423).
- **Rate limiting** en `/auth/login`, `/register`, `/google` y `/refresh`: 20 pedidos por minuto por IP, contador compartido entre workers en Redis, respuesta 429 con `Retry-After`. Si Redis no responde, la API sigue (falla abierto). Se desactiva con `RATE_LIMIT_ENABLED=false`.
- Access token JWT de 15 minutos, guardado solo en memoria en el frontend.
- Refresh token opaco, hasheado en base (SHA-256), con rotación y detección de reutilización (revoca toda la familia).
- Refresh token en cookie `httpOnly`, `SameSite=Strict`; solo se borra ante un 401, no ante errores transitorios.
- Login con Google: se verifica firma, vencimiento y audiencia del ID token; solo se acepta `email_verified`.
- Una cuenta creada con Google no tiene contraseña; registrarse primero con email y luego entrar con Google vincula ambas.
- Autorización por roles (`USUARIO`, `OPERADOR`, `ADMIN`) con middlewares `authenticate` y `authorize`, y guards en Angular.
- El CSV de reportes neutraliza textos que una planilla interpretaría como fórmulas.
- `trust proxy` activo: el backend asume que está detrás de nginx.

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

Variables de `backend/.env` (no se versiona): `DATABASE_URL` (puede incluir `?connection_limit=10`), `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `COOKIE_SECURE`, `GOOGLE_CLIENT_ID`, `WEB_CONCURRENCY`, `REPORT_THREADS`, `REDIS_URL`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `REPORT_SIMULATED_WORK_MS` (solo para pruebas de carga; en uso normal vale 0).

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
docker compose exec db psql -U cupoya -d cupoya -c "CREATE DATABASE cupoya_test;"
```

Estado actual: backend 228 unitarias y 52 de integración (incluye concurrencia real contra PostgreSQL, un hilo real de `worker_threads` y Redis); frontend 139. Total: 419.

### Integración continua

GitHub Actions (`.github/workflows/ci.yml`) ejecuta en cada push: compilación y pruebas unitarias del backend, migraciones y pruebas de integración con servicios PostgreSQL y Redis, pruebas y build de producción del frontend, y construcción de las imágenes Docker.

## Metodología

- **TDD:** cada cambio empieza con una prueba que falla (`test:`), seguida del código (`feat:`).
- **Commits:** Conventional Commits (`test`, `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`).
- **Iteraciones** cortas con historias de usuario priorizadas por el cliente; versiones etiquetadas en git.
- Las pruebas de integración detectan defectos que las unitarias no ven (ej.: corrimiento de zona horaria en `lockedUntil`), y el CI detectó una dependencia no declarada (`jest-util`).

## Documentación

La documentación completa (requerimientos, historias de usuario, arquitectura, plan de pruebas, evidencia de XP) se mantiene en el documento del proyecto.