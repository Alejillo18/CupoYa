# CupoYa

**Tu lugar, asegurado.** Plataforma de reserva de cupos para eventos, pensada para soportar alta concurrencia sin sobreventa.

Proyecto académico desarrollado con **Programación Extrema (XP)** y **TDD**.

## Estado del proyecto

| Iteración | Alcance | Estado |
|---|---|---|
| 1 | Registro, login, sesiones, roles, contenedores (backend) | Backend completo |
| 1 | Frontend Angular (login y registro) | En curso |
| 2 | Login con Google | Pendiente |
| 3 | Eventos y administración de usuarios | Pendiente |
| 4 | Reservas con control de concurrencia | Pendiente |
| 5 | Reportes en segundo plano (worker threads) | Pendiente |
| 6 | Pruebas de carga y cierre | Pendiente |

## Stack

- **Backend:** Node 22, Express, TypeScript, Prisma, PostgreSQL 16
- **Frontend:** Angular (en construcción)
- **Pruebas:** Jest + Supertest (unitarias e integración contra PostgreSQL real)
- **Infraestructura:** Docker y Docker Compose

## Estructura

```
cupoya/
├─ backend/        API REST (Express + TypeScript)
├─ frontend/       Interfaz (Angular)
├─ load-tests/     Pruebas de carga
├─ docker-compose.yml
└─ .env.example
```

## Puesta en marcha

Requisitos: Docker Desktop (o Docker Engine + Compose).

1. Clonar el repositorio.
2. Copiar `.env.example` a `.env` y completar `DB_PASSWORD` y `JWT_SECRET` (mínimo 32 caracteres).
3. Ejecutar:
```bash
   docker compose up --build -d
```
4. Verificar: `http://localhost:3000/api/v1/health` responde `{"status":"ok"}`.

> Si cambiás `DB_USER` o `DB_PASSWORD` después de la primera ejecución, corré `docker compose down -v`: Postgres conserva las credenciales con las que se creó el volumen.

La base se publica en el puerto **5433** del host (para convivir con un PostgreSQL local en el 5432).

## API (prefijo `/api/v1`)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/health` | Público | Estado del servicio |
| POST | `/auth/register` | Público | Registro (email y contraseña) |
| POST | `/auth/login` | Público | Login: devuelve access token; refresh token en cookie httpOnly |
| POST | `/auth/refresh` | Cookie | Renueva la sesión (rotación del refresh token) |
| POST | `/auth/logout` | Cookie | Cierra la sesión e invalida el token |
| GET | `/auth/me` | Autenticado | Usuario actual |

Errores con formato unificado:

```json
{ "error": { "code": "CODIGO", "message": "Mensaje", "details": [] } }
```

## Seguridad implementada

- Contraseñas con hash bcrypt; nunca se devuelven.
- Respuesta idéntica ante email inexistente o contraseña incorrecta.
- Bloqueo de cuenta 15 minutos tras 5 intentos fallidos (423).
- Access token JWT de 15 minutos; refresh token opaco, hasheado en base (SHA-256), con rotación y detección de reutilización (revoca toda la familia).
- Refresh token en cookie `httpOnly`, `SameSite=Strict`.
- Autorización por roles: `USUARIO`, `OPERADOR`, `ADMIN`.

## Desarrollo local

Requisitos: Node 22, Docker.

```bash
docker compose up -d db          # solo la base
cd backend
npm install
cp .env.example .env             # DATABASE_URL apuntando a localhost:5433
npx prisma migrate deploy
npm run dev
```

Variables de `backend/.env` (no se versiona): `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TTL_DAYS`, `COOKIE_SECURE`.

### Pruebas

```bash
cd backend
npm test                  # unitarias
npm run test:integration  # contra PostgreSQL real (base cupoya_test)
```

Para las de integración, crear la base de pruebas y migrarla, y definir `TEST_DATABASE_URL` en `backend/.env.test`:

```bash
docker compose exec db psql -U cupoya -d cupoya -c "CREATE DATABASE cupoya_test;"
```

## Metodología

- **TDD:** cada cambio empieza con una prueba que falla (`test:`), seguida del código (`feat:`).
- **Commits:** Conventional Commits (`test`, `feat`, `fix`, `refactor`, `chore`, `docs`).
- **Iteraciones** cortas con historias de usuario priorizadas por el cliente.
- Las pruebas de integración detectan defectos que las unitarias no ven (ej.: corrimiento de zona horaria en `lockedUntil`).

## Documentación

La documentación completa (requerimientos, historias de usuario, arquitectura, plan de pruebas) se mantiene en el documento del proyecto.