# CupoYa

**Tu lugar, asegurado.** Plataforma de reserva de cupos para eventos, pensada para soportar alta concurrencia sin sobreventa.

Proyecto académico desarrollado con **Programación Extrema (XP)** y **TDD**.

## Estado del proyecto

| Iteración | Alcance | Estado |
|---|---|---|
| 1 | Registro, login, sesiones con refresh, roles, contenedores, frontend Angular | Completa (`v0.1.0`) |
| 2 | Login con Google | Completa (`v0.2.0`) |
| 3 | Eventos y administración de usuarios y roles | Completa (`v0.3.0`) |
| 4 | Reservas con control de concurrencia, cluster y prueba de carga | Completa (`v0.4.0`) |
| 5 | Reportes en segundo plano (worker threads) | Pendiente |
| 6 | Cierre, documentación final y entrega | Pendiente |

## Stack

- **Backend:** Node 22, Express, TypeScript, Prisma, PostgreSQL 16, `cluster` (multiproceso)
- **Frontend:** Angular 21 (componentes standalone, signals), servido por nginx
- **Autenticación:** JWT + refresh token rotativo, Google Identity Services
- **Pruebas:** Jest + Supertest (backend), Vitest (frontend), integración contra PostgreSQL real, k6 (carga)
- **Infraestructura:** Docker y Docker Compose

## Estructura

```
cupoya/
├─ backend/        API REST (Express + TypeScript)
├─ frontend/       Interfaz (Angular + nginx)
├─ load-tests/     Pruebas de carga (k6) y verificación de consistencia
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
4. Abrir `http://localhost:8080`.

Solo el frontend (nginx) se expone al host; reenvía `/api/` al backend por la red interna, de modo que navegador y API comparten origen. El backend corre en modo `cluster` (4 workers por defecto, configurable con `WEB_CONCURRENCY`).

> Si cambiás `DB_USER` o `DB_PASSWORD` después de la primera ejecución, corré `docker compose down -v`: Postgres conserva las credenciales con las que se creó el volumen.

La base se publica en el puerto **5433** del host (para convivir con un PostgreSQL local en el 5432).

### Roles

Los usuarios nuevos tienen rol `USUARIO`. Un `ADMIN` cambia roles desde `/usuarios`; el primer administrador se asigna editando el campo `role` en la base (por ejemplo con Prisma Studio). El rol viaja en el token y rige desde el próximo ingreso.

### Login con Google (opcional)

Requiere un Client ID de OAuth (tipo "Aplicación web") con `http://localhost:4200` y `http://localhost:8080` como orígenes autorizados. Se configura en `GOOGLE_CLIENT_ID` (backend) y en `frontend/public/config.json` (frontend). Sin Client ID, la app funciona solo con email y contraseña.

## API (prefijo `/api/v1`)

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

Errores con formato unificado:

```json
{ "error": { "code": "CODIGO", "message": "Mensaje", "details": [] } }
```

## Concurrencia

- **Sin sobreventa:** la reserva es una transacción con un `UPDATE ... WHERE available_capacity >= qty` atómico; una restricción `CHECK` en la base actúa como segunda red.
- **Límite por usuario:** máximo 4 lugares por evento, serializado con un advisory lock por usuario y evento.
- **Idempotencia:** `(user_id, idempotency_key)` único; repetir un pedido con la misma clave devuelve la misma reserva.
- **Multiproceso:** `cluster` con política de reinicio de workers; sin estado en memoria (tokens autocontenidos y datos en PostgreSQL).

### Prueba de carga (k6)

Medición con 2.000 usuarios simultáneos sobre un evento de 3.000 lugares (demanda ≈ 5.000), ejecutada dentro de la red de Docker Compose en una PC de 12 núcleos:

| Medida | Resultado |
|---|---|
| Respuestas esperadas (201 o 409) | 2.000 de 2.000 |
| Errores o timeouts | 0 |
| Latencia p95 | ≈ 10 ms |
| Lugares confirmados | 3.000 = cupo (disponible 0) |
| Usuarios con más de 4 lugares | 0 |

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
- Access token JWT de 15 minutos, guardado solo en memoria en el frontend.
- Refresh token opaco, hasheado en base (SHA-256), con rotación y detección de reutilización (revoca toda la familia).
- Refresh token en cookie `httpOnly`, `SameSite=Strict`; solo se borra ante un 401, no ante errores transitorios.
- Login con Google: se verifica firma, vencimiento y audiencia del ID token; solo se acepta `email_verified`.
- Una cuenta creada con Google no tiene contraseña; registrarse primero con email y luego entrar con Google vincula ambas.
- Autorización por roles (`USUARIO`, `OPERADOR`, `ADMIN`) con middlewares `authenticate` y `authorize`, y guards en Angular.

## Desarrollo local

Requisitos: Node 22, Docker.

**Backend**

```bash
docker compose up -d db
cd backend
npm install
cp .env.example .env             # DATABASE_URL apuntando a localhost:5433
npx prisma migrate deploy
npm run dev                      # un proceso; para multiproceso: npm run dev:cluster
```

Variables de `backend/.env` (no se versiona): `DATABASE_URL` (puede incluir `?connection_limit=10`), `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `COOKIE_SECURE`, `GOOGLE_CLIENT_ID`, `WEB_CONCURRENCY`.

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
npm run test:integration  # contra PostgreSQL real (base cupoya_test)

cd ../frontend
npm test                  # Vitest
```

Para las de integración, crear la base de pruebas, migrarla y definir `TEST_DATABASE_URL` en `backend/.env.test`:

```bash
docker compose exec db psql -U cupoya -d cupoya -c "CREATE DATABASE cupoya_test;"
```

Estado actual: backend 178 unitarias y 40 de integración (incluye concurrencia real contra PostgreSQL); frontend 125.

## Metodología

- **TDD:** cada cambio empieza con una prueba que falla (`test:`), seguida del código (`feat:`).
- **Commits:** Conventional Commits (`test`, `feat`, `fix`, `refactor`, `chore`, `docs`).
- **Iteraciones** cortas con historias de usuario priorizadas por el cliente; versiones etiquetadas en git.
- Las pruebas de integración detectan defectos que las unitarias no ven (ej.: corrimiento de zona horaria en `lockedUntil`).

## Documentación

La documentación completa (requerimientos, historias de usuario, arquitectura, plan de pruebas) se mantiene en el documento del proyecto.