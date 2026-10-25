const bearer = [{ bearerAuth: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const paginacion = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
  { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
];

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'CupoYa API',
    version: '1.0.0',
    description:
      'Reserva de cupos para eventos con alta concurrencia. Errores con formato unificado { error: { code, message, details } }.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Estado del servicio', responses: { '200': { description: 'OK' } } },
    },
    '/auth/register': {
      post: {
        summary: 'Registrar usuario (email y contraseña)',
        responses: { '201': { description: 'Creado' }, '400': err('Datos inválidos'), '409': err('Email ya registrado'), '429': err('Demasiados intentos') },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Iniciar sesión; el refresh token viaja en cookie httpOnly',
        responses: { '200': { description: 'Access token y usuario' }, '401': err('Credenciales inválidas'), '423': err('Cuenta bloqueada'), '429': err('Demasiados intentos') },
      },
    },
    '/auth/google': {
      post: {
        summary: 'Iniciar sesión con Google (ID token)',
        responses: { '200': { description: 'Access token y usuario' }, '401': err('Token de Google inválido'), '429': err('Demasiados intentos') },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Renovar la sesión con rotación del refresh token (cookie)',
        responses: { '200': { description: 'Nuevo access token' }, '401': err('Sesión inválida'), '429': err('Demasiados intentos') },
      },
    },
    '/auth/logout': {
      post: { summary: 'Cerrar sesión e invalidar el refresh token', responses: { '204': { description: 'Sin contenido' } } },
    },
    '/auth/me': {
      get: { summary: 'Usuario actual', security: bearer, responses: { '200': { description: 'Usuario' }, '401': err('No autenticado') } },
    },
    '/events': {
      get: { summary: 'Listar eventos activos y futuros (paginado)', security: bearer, parameters: paginacion, responses: { '200': { description: 'Página de eventos' }, '401': err('No autenticado') } },
      post: { summary: 'Crear evento (Operador, Admin)', security: bearer, responses: { '201': { description: 'Creado' }, '400': err('Datos inválidos'), '403': err('Sin permiso') } },
    },
    '/events/{id}': {
      get: { summary: 'Detalle de un evento', security: bearer, parameters: [idParam], responses: { '200': { description: 'Evento' }, '404': err('No existe') } },
      put: { summary: 'Editar evento (Operador, Admin)', security: bearer, parameters: [idParam], responses: { '200': { description: 'Evento' }, '409': err('Cupo menor a lo reservado o evento cancelado'), '404': err('No existe') } },
      delete: { summary: 'Cancelar evento (no se borra)', security: bearer, parameters: [idParam], responses: { '204': { description: 'Cancelado' }, '404': err('No existe') } },
    },
    '/events/{id}/reservations': {
      post: {
        summary: 'Reservar 1 a 4 lugares; admite el encabezado Idempotency-Key',
        security: bearer,
        parameters: [idParam, { name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }],
        responses: { '201': { description: 'Reserva creada' }, '200': { description: 'Repetición idempotente' }, '400': err('Cantidad inválida'), '404': err('Evento inexistente'), '409': err('Sin cupo, límite superado o evento no disponible') },
      },
    },
    '/reservations/me': {
      get: { summary: 'Mis reservas', security: bearer, responses: { '200': { description: 'Lista de reservas' } } },
    },
    '/reservations/{id}/cancel': {
      post: { summary: 'Cancelar reserva (dueño o Admin); libera el cupo', security: bearer, parameters: [idParam], responses: { '200': { description: 'Reserva cancelada' }, '403': err('Sin permiso'), '404': err('No existe') } },
    },
    '/users': {
      get: { summary: 'Listar usuarios (Admin, paginado)', security: bearer, parameters: paginacion, responses: { '200': { description: 'Página de usuarios' }, '403': err('Sin permiso') } },
    },
    '/users/{id}/role': {
      patch: { summary: 'Cambiar rol (Admin); siempre queda al menos un Admin', security: bearer, parameters: [idParam], responses: { '200': { description: 'Usuario actualizado' }, '404': err('No existe'), '409': err('Último administrador') } },
    },
    '/reports': {
      post: { summary: 'Solicitar reporte de ocupación (Admin); se genera en un hilo aparte', security: bearer, responses: { '202': { description: 'Aceptado' }, '403': err('Sin permiso') } },
    },
    '/reports/{id}': {
      get: { summary: 'Estado y resultado del reporte (Admin)', security: bearer, parameters: [idParam], responses: { '200': { description: 'Reporte' }, '404': err('No existe') } },
    },
    '/reports/{id}/download': {
      get: { summary: 'Descargar el reporte en CSV (Admin)', security: bearer, parameters: [idParam], responses: { '200': { description: 'CSV' }, '409': err('Reporte no listo') } },
    },
  },
};