# Pruebas de CupoYa

## Suites

| Suite | Herramienta | Ubicación | Cantidad | Necesita |
|---|---|---|---|---|
| Unitarias backend | Jest + supertest | `backend/tests/` | 244 | Nada |
| Integración backend | Jest | `backend/tests/integration/` | 52 | PostgreSQL y Redis |
| Frontend | Vitest (`ng test`) | `frontend/src/**/*.spec.ts` | 210 | Nada |
| E2E API | Playwright | `e2e/tests/api/` | 150 | Stack con Docker |
| E2E interfaz | Playwright | `e2e/tests/ui/` | 25 | Stack con Docker |
| Carga y caos | k6 | `load-tests/` | — | Stack con Docker |

Las unitarias usan repositorios falsos de `backend/tests/helpers/`. Las de integración usan la base `cupoya_test`.

## Cobertura

| Suite | Sentencias | Ramas | Funciones | Líneas |
|---|---|---|---|---|
| Backend, unitarias | 94,62 % | 91,95 % | 91,04 % | 94,49 % |
| Backend, integración | 95,86 % | 80,48 % | 91,11 % | 95,68 % |
| Frontend | 94,65 % | 94,39 % | 83,78 % | 96,06 % |

## Cómo correrlas

**Backend**
```bash
cd backend && npm ci && npx prisma generate
npm test                    # unitarias
npm run test:cov            # con cobertura
npm run test:integration    # integración
```
La integración necesita `backend/.env.test` con `TEST_DATABASE_URL` y `TEST_REDIS_URL`, y la base migrada:
```bash
docker compose up -d db redis
docker compose exec db psql -U cupoya -d cupoya -c "CREATE DATABASE cupoya_test;"
```

**Frontend**
```bash
cd frontend && npm ci
npx ng test --watch=false
npx ng test --no-watch --coverage
```

**E2E**
```bash
RATE_LIMIT_ENABLED=false docker compose up -d --build
cd e2e && cp .env.example .env && npm install && npx playwright install chromium
npm test              # todo
npm run test:api      # solo API
npm run test:ui       # solo interfaz
npm run report        # reporte HTML
```
Variables (`e2e/.env`): `BASE_URL` (por defecto `http://localhost:8080`), `DB_USER`, `DB_PASSWORD`, `DB_PORT` (por defecto `5433`).

El limitador de tasa tiene que estar apagado (`RATE_LIMIT_ENABLED=false`): las pruebas crean muchos usuarios desde una sola IP. Solo SEG-07 lo necesita encendido (`RATE_LIMIT_ENABLED=true` al correrla).

**Carga**: ver `README.md` principal (`load-tests/`).

## CI

- `.github/workflows/ci.yml`: backend (compilación, unitarias, migraciones, integración), frontend (pruebas y build) e imágenes Docker.
- `.github/workflows/e2e.yml`: levanta el stack con `docker compose up --build --wait`, corre las E2E y sube el reporte de Playwright.

## Datos de prueba (E2E)

Cada prueba crea sus propios datos y al terminar se borran: usuarios `@e2e.cupoya.test` y eventos cuyo nombre empieza con `E2E `. Los roles OPERADOR y ADMIN se asignan directo en la base, porque no hay forma de crearlos por API.

---

# Casos de prueba E2E

La columna **Resultado** queda vacía para completar en cada corrida (OK / FALLA).

## API: autenticación (`auth.api.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| AUT-01 | Registrar usuario válido | 201, rol USUARIO, sin hash ni contraseña en la respuesta | |
| AUT-02 | Registrar con email en mayúsculas y espacios | 201, email guardado en minúsculas y sin espacios | |
| AUT-03 | Registrar email repetido (cambiando mayúsculas) | 409 `EMAIL_YA_REGISTRADO` | |
| AUT-04 | Registrar email sin arroba | 400 `VALIDACION` | |
| AUT-05 | Registrar email de más de 254 caracteres | 400 `VALIDACION` | |
| AUT-06 | Registrar contraseña de 7 caracteres | 400 `VALIDACION` | |
| AUT-07 | Registrar contraseña solo con letras | 400 `VALIDACION` | |
| AUT-08 | Registrar contraseña solo con números | 400 `VALIDACION` | |
| AUT-09 | Registrar contraseña de 73 caracteres | 400 `VALIDACION` | |
| AUT-10 | Registrar contraseña de 8 caracteres (mínimo) | 201 | |
| AUT-11 | Registrar contraseña de 72 caracteres (máximo) | 201 | |
| AUT-12 | Registrar con JSON mal formado | 400 `SOLICITUD_INVALIDA` | |
| AUT-13 | Login correcto | 200, `accessToken` en el cuerpo, sin `refreshToken`; cookie `refresh_token` con HttpOnly, SameSite=Strict y Path=/api/v1/auth | |
| AUT-14 | Login con contraseña mala vs. usuario inexistente | Ambos 401 `CREDENCIALES_INVALIDAS` con el mismo error | |
| AUT-15 | 5 logins fallidos y uno correcto | Los 5 dan 401; el sexto da 423 `CUENTA_BLOQUEADA` | |
| AUT-16 | 4 fallos, un login correcto y otro fallo | El login correcto reinicia el contador: la cuenta no se bloquea | |
| AUT-17 | `GET /auth/me` sin header, con esquema Basic, con token basura y con firma alterada | 401 `NO_AUTENTICADO` en todos | |
| AUT-18 | `GET /auth/me` con token válido | 200 con el usuario | |
| AUT-19 | Token con `alg: none` que dice ser ADMIN | 401 | |
| AUT-20 | Refresh con cookie válida; luego reusar la cookie vieja | 200 con token nuevo; el reuso da 401 `REFRESH_INVALIDO` y el token nuevo también queda revocado | |
| AUT-21 | Refresh sin cookie | 401 `REFRESH_INVALIDO` | |
| AUT-22 | Logout con cookie, repetido y sin cookie; refresh después | Los tres logout dan 204; el refresh posterior da 401 | |

## API: eventos (`events.api.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| EVE-01 | Operador crea evento (nombre con espacios sobrantes, cupo 25) | 201, nombre recortado, `availableCapacity` = 25, estado ACTIVO | |
| EVE-02 | Usuario común crea evento; sin token crea evento | 403 `SIN_PERMISO`; 401 | |
| EVE-03 | Crear con fecha en el pasado | 400 `FECHA_PASADA` | |
| EVE-04 | Crear con fecha inválida ("mañana") | 400 `VALIDACION` | |
| EVE-05 | Crear con cupo 0 | 400 `VALIDACION` | |
| EVE-06 | Crear con cupo negativo | 400 `VALIDACION` | |
| EVE-07 | Crear con cupo decimal (1.5) | 400 `VALIDACION` | |
| EVE-08 | Crear con cupo como texto ("10") | 400 `VALIDACION` | |
| EVE-09 | Crear con cupo 1.000.001 | 400 `VALIDACION` | |
| EVE-10 | Crear con nombre de solo espacios | 400 `VALIDACION` | |
| EVE-11 | Crear con nombre de 121 caracteres | 400 `VALIDACION` | |
| EVE-12 | Crear con lugar vacío | 400 `VALIDACION` | |
| EVE-13 | Crear con descripción de 2001 caracteres | 400 `VALIDACION` | |
| EVE-14 | Crear con cupo 1 (mínimo) | 201 | |
| EVE-15 | Crear con cupo 1.000.000 (máximo) | 201 | |
| EVE-16 | Crear con nombre de 120 caracteres | 201 | |
| EVE-17 | Crear con descripción de 2000 caracteres | 201 | |
| EVE-18 | Listar eventos sin sesión | 401 | |
| EVE-19 | Evento recién creado en el listado y por id | 200; el id aparece en el listado y `GET /events/:id` lo devuelve | |
| EVE-20 | Paginar con `pageSize=1` (páginas 1 y 2) | Un evento por página, distintos entre sí, `total` ≥ 2 | |
| EVE-21 | `pageSize=100000` | 200, `pageSize` devuelto = 100 | |
| EVE-22 | `?page=0` | 400 `VALIDACION` | |
| EVE-23 | `?page=-1` | 400 `VALIDACION` | |
| EVE-24 | `?page=abc` | 400 `VALIDACION` | |
| EVE-25 | `?pageSize=0` | 400 `VALIDACION` | |
| EVE-26 | `?pageSize=1.5` | 400 `VALIDACION` | |
| EVE-27 | `GET /events/:id` con UUID inexistente | 404 `EVENTO_NO_ENCONTRADO` | |
| EVE-28 | Evento cancelado en el listado | No aparece; su detalle muestra estado CANCELADO | |
| EVE-29 | Editar solo el nombre | 200, nombre nuevo, cupo sin cambios | |
| EVE-30 | Subir cupo total de 10 a 20 con 3 reservados; bajarlo a 2; bajarlo a 3 | Sube: disponible 17; a 2: 409 `CUPO_MENOR_A_RESERVAS`; a 3: 200, disponible 0 | |
| EVE-31 | Editar con cuerpo vacío; con fecha pasada; como usuario común | 400; 400 `FECHA_PASADA`; 403 | |
| EVE-32 | Editar un evento cancelado | 409 `EVENTO_CANCELADO` | |
| EVE-33 | Cancelar como usuario común; cancelar evento inexistente | 403; 404 | |

## API: reservas (`reservations.api.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| RES-01 | Reservar 2 lugares de un evento de 10 | 201, CONFIRMADA; cupo 8 en la API y en la base | |
| RES-02 | Reservar sin token; reservar en evento inexistente | 401; 404 `EVENTO_NO_ENCONTRADO` | |
| RES-03 | Reservar cantidad 0 | 400 `CANTIDAD_INVALIDA` | |
| RES-04 | Reservar cantidad 5 | 400 `CANTIDAD_INVALIDA` | |
| RES-05 | Reservar cantidad -1 | 400 `CANTIDAD_INVALIDA` | |
| RES-06 | Reservar cantidad 2.5 | 400 `CANTIDAD_INVALIDA` | |
| RES-07 | Reservar con cantidad como texto o sin cantidad | 400 | |
| RES-08 | Reservar 3, luego 2, luego 1, luego 1 | 201; 409 `LIMITE_SUPERADO`; 201 (total 4); 409 `LIMITE_SUPERADO` | |
| RES-09 | Evento de 2 lugares: A reserva 2, B reserva 1 | B recibe 409 `CUPO_INSUFICIENTE`; cupo en base = 0 | |
| RES-10 | Reservar en evento cancelado y en evento ya empezado | 409 `EVENTO_NO_DISPONIBLE` en ambos | |
| RES-11 | Mismo pedido dos veces con la misma `Idempotency-Key` | 201 y luego 200 con la misma reserva; cupo descontado una sola vez | |
| RES-12 | Dos pedidos con claves distintas | Dos reservas distintas; cupo descontado dos veces | |
| RES-13 | `GET /reservations/me` | Solo las reservas propias; sin token, 401 | |
| RES-14 | Cancelar una reserva de 4 lugares; cancelar de nuevo; reservar 4 otra vez | 200 CANCELADA, cupo vuelve a 10; la repetición da 200 sin devolver cupo de más; la nueva reserva da 201 | |
| RES-15 | Otro usuario cancela una reserva ajena; un ADMIN la cancela | 403 `SIN_PERMISO` sin cambiar el cupo; el ADMIN recibe 200 y el cupo vuelve | |
| RES-16 | Cancelar reserva inexistente | 404 `RESERVA_NO_ENCONTRADA` | |
| RES-17 | 8 usuarios reservan 1 lugar a la vez en un evento de 5 | Exactamente 5 respuestas 201 y 3 respuestas 409; cupo en base = 0 | |
| RES-18 | Un usuario dispara 6 reservas de 1 lugar a la vez (cupo 50) | Exactamente 4 respuestas 201 y 2 respuestas 409; cupo en base = 46 | |

## API: permisos por rol (`authz-matrix.api.spec.ts`)

Cada fila se prueba en cuatro situaciones: sin sesión, USUARIO, OPERADOR y ADMIN. Sin sesión siempre es **401**. Un rol no permitido recibe **403 `SIN_PERMISO`**. Un rol permitido no recibe ni 401 ni 403.

| ID | Endpoint | USUARIO | OPERADOR | ADMIN |
|---|---|---|---|---|
| PER-01 | `GET /auth/me` | Permitido | Permitido | Permitido |
| PER-02 | `GET /events` | Permitido | Permitido | Permitido |
| PER-03 | `GET /events/:id` | Permitido | Permitido | Permitido |
| PER-04 | `POST /events` | 403 | Permitido | Permitido |
| PER-05 | `PUT /events/:id` | 403 | Permitido | Permitido |
| PER-06 | `DELETE /events/:id` | 403 | Permitido | Permitido |
| PER-07 | `POST /events/:id/reservations` | Permitido | Permitido | Permitido |
| PER-08 | `GET /reservations/me` | Permitido | Permitido | Permitido |
| PER-09 | `POST /reservations/:id/cancel` | Permitido | Permitido | Permitido |
| PER-10 | `GET /users` | 403 | 403 | Permitido |
| PER-11 | `PATCH /users/:id/role` | 403 | 403 | Permitido |
| PER-12 | `POST /reports` | 403 | 403 | Permitido |
| PER-13 | `GET /reports/:id` | 403 | 403 | Permitido |
| PER-14 | `GET /reports/:id/download` | 403 | 403 | Permitido |

## API: usuarios y reportes (`admin.api.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| ADM-01 | Admin lista usuarios con `pageSize=5` | 200, hasta 5 ítems, `total` ≥ 1, sin hashes | |
| ADM-02 | Listar usuarios con `?page=0` | 400 | |
| ADM-03 | Admin cambia un usuario a OPERADOR | 200 con rol OPERADOR; con el token viejo sigue dando 403 al crear evento; tras volver a ingresar da 201 | |
| ADM-04 | Cambiar a un rol inexistente; cambiar un usuario inexistente | 400; 404 `USUARIO_NO_ENCONTRADO` | |
| ADM-05 | Solicitar reporte y descargarlo | 202; pasa a LISTO; el JSON de estado no trae el CSV; `/download` da 200, `text/csv` y `attachment` | |
| ADM-06 | Consultar reporte inexistente | 404 `REPORTE_NO_ENCONTRADO` | |

## API: seguridad (`seguridad.api.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| SEG-01 | Login con `' OR 1=1 --` como email | 400 | |
| SEG-02 | Login con SQL en la contraseña | 401 | |
| SEG-03 | Evento con nombre `'); DROP TABLE events;-- <script>…` | Se guarda y se devuelve igual, sin alterar | |
| SEG-04 | `GET /api/v1/no-existe` | 404 JSON `NO_ENCONTRADO` | |
| SEG-05 | `GET /` (headers de nginx) | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` presente, `Server` sin número de versión | |
| SEG-06 | `GET /api/openapi.json` | 200, JSON con campo `openapi` | |
| SEG-07 | 30 logins fallidos seguidos (solo con `RATE_LIMIT_ENABLED=true`) | Aparece al menos un 429 | |

## API: ids con formato inválido (`ids-invalidos.api.spec.ts`)

Se envía el id `esto-no-es-un-uuid`. Esperado en todos: **400 o 404**, nunca 500.

| ID | Endpoint |
|---|---|
| IDS-01 | `GET /events/:id` |
| IDS-02 | `PUT /events/:id` |
| IDS-03 | `DELETE /events/:id` |
| IDS-04 | `POST /events/:id/reservations` |
| IDS-05 | `POST /reservations/:id/cancel` |
| IDS-06 | `PATCH /users/:id/role` |
| IDS-07 | `GET /reports/:id` y `GET /reports/:id/download` |
| IDS-08 | Control: `GET /events/:id` con UUID válido inexistente → 404 |

## Interfaz: autenticación (`auth.ui.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| UI-AUT-01 | Registrarse con datos válidos | Redirige a `/login?registrado=1` con "Cuenta creada. Ya podés ingresar." | |
| UI-AUT-02 | Registrarse con contraseñas distintas | Muestra "Las contraseñas no coinciden." y sigue en `/registro` | |
| UI-AUT-03 | Contraseña sin números | Muestra "Mínimo 8 caracteres, con letras y números (máximo 72)." | |
| UI-AUT-04 | Registrarse con email ya existente | Aviso "Ya existe una cuenta con ese email." | |
| UI-AUT-05 | Ingresar con credenciales correctas | Va a `/inicio`; se ve "Rol: USUARIO" y `email · USUARIO` en la barra | |
| UI-AUT-06 | Ingresar con contraseña incorrecta | Aviso "Email o contraseña incorrectos." y sigue en `/login` | |
| UI-AUT-07 | Ingresar con campos vacíos | Errores "Ingresá un email válido." e "Ingresá tu contraseña."; no se llama a la API | |
| UI-AUT-08 | Recargar la página con sesión iniciada | Sigue en `/inicio` con la sesión | |
| UI-AUT-09 | Cerrar sesión y abrir `/eventos` | Va a `/login` en ambos casos | |
| UI-AUT-10 | Abrir `/inicio`, `/eventos`, `/reservas`, `/eventos/nuevo`, `/usuarios` y `/reportes` sin sesión | Redirige a `/login` | |
| UI-AUT-11 | Abrir una ruta inexistente | Redirige a `/login` | |
| UI-AUT-12 | Pantalla de 390 px de ancho | Aparece el botón "Menú"; sus opciones y "Cerrar sesión" funcionan | |

## Interfaz: reservas (`reservas.ui.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| UI-RES-01 | Reservar 2 lugares de un evento de 10 | Aviso `Reserva confirmada para "<evento>".`; fila 8 / 10; base en 8; aparece CONFIRMADA en "Mis reservas" | |
| UI-RES-02 | Reservar 2 teniendo ya 3 | Aviso "Superás el máximo de 4 lugares por evento."; el cupo no cambia | |
| UI-RES-03 | Evento sin cupo | La fila muestra "Agotado" y el botón Reservar está deshabilitado | |
| UI-RES-04 | "Mis reservas" sin reservas | "Todavía no tenés reservas." | |
| UI-RES-05 | Cancelar reserva y confirmar | Aviso "Reserva cancelada."; estado CANCELADA; sin botón de cancelar; el cupo vuelve a 10 | |
| UI-RES-06 | Cancelar reserva y elegir "Volver" | La reserva sigue CONFIRMADA y el cupo no cambia | |

## Interfaz: roles (`roles.ui.spec.ts`)

| ID | Caso | Esperado | Resultado |
|---|---|---|---|
| UI-ROL-01 | Usuario común en `/eventos` y en las pantallas de gestión | No ve "Nuevo evento", "Reportes" ni "Usuarios"; `/eventos/nuevo`, `/usuarios` y `/reportes` lo llevan a `/inicio` | |
| UI-ROL-02 | Operador crea un evento desde el formulario | Aviso "Evento creado."; va a `/eventos`; la fila muestra 12 / 12 y el lugar | |
| UI-ROL-03 | Operador guarda el formulario vacío con cupo 0 | Muestra los tres errores de campo; no se llama a la API | |
| UI-ROL-04 | Operador edita el nombre de un evento | Aviso "Evento actualizado."; el listado muestra el nombre nuevo | |
| UI-ROL-05 | Operador cancela un evento y confirma | Aviso `Evento "<evento>" cancelado.`; desaparece del listado | |
| UI-ROL-06 | Evento con nombre `<img onerror=…> <b>…</b>` | Se muestra como texto; no se ejecuta código | |
| UI-ROL-07 | Admin abre Usuarios y Reportes desde la barra | Se ven los títulos "Usuarios" y "Reporte de ocupación" | |
