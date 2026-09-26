/**
 * Datos de prueba para el MVP.
 *
 * TODO (siguiente etapa): reemplazar esta importación por la llamada real
 * al agente IBM Bob que analiza el workspace y devuelve un OnboardingData.
 * El contrato de tipos no cambia; solo cambia la fuente del dato.
 */

import type { OnboardingData } from './types';

// Datos de ejemplo genéricos usados como fallback cuando no hay onboarding.json guardado.
// Reflejan un proyecto hipotético; no hacen referencia a ningún repositorio real.
export const sampleData: OnboardingData = {
  projectName: 'my-project',
  summary:
    'Ejemplo de plataforma full-stack con frontend SPA y backend REST. ' +
    'Ejecuta "Bob Onboarding: Generar análisis con Bob" para analizar el ' +
    'repositorio actualmente abierto y reemplazar estos datos de ejemplo ' +
    'con el análisis real generado por IBM Bob.',
  technologies: [
    'Node.js', 'Express', 'PostgreSQL', 'jsonwebtoken', 'bcryptjs',
    'puppeteer-core', 'handlebars', 'express-rate-limit', 'archiver',
    'React', 'TypeScript', 'Vite', 'Tailwind CSS', 'Recharts',
    'Lucide React', 'SweetAlert2', 'SheetJS (xlsx)', 'Docker',
    'Docker Compose', 'Nginx',
  ],
  modules: [
    {
      name: 'API Server',
      path: 'api/src/server.js',
      description: 'Punto de entrada del backend. Espera disponibilidad de PostgreSQL (hasta 5 reintentos) y llama a createApp().listen().',
      type: 'backend',
    },
    {
      name: 'Express App',
      path: 'api/src/app.js',
      description: 'Ensambla la instancia de Express sin abrir puertos: CORS, body parser, rutas /api y estáticos del cliente en producción.',
      type: 'backend',
    },
    {
      name: 'Routes',
      path: 'api/src/routes/',
      description: 'Declara verbos HTTP y URLs. Aplica middlewares de autenticación y delega al controlador correspondiente.',
      type: 'backend',
    },
    {
      name: 'Controllers',
      path: 'api/src/controllers/',
      description: 'Traducen HTTP al dominio: leen req.params/body, invocan el servicio y eligen el status de respuesta. Sin SQL ni reglas de negocio.',
      type: 'backend',
    },
    {
      name: 'Services',
      path: 'api/src/services/',
      description: 'Casos de uso. Coordinan políticas, validadores y repositorios. Incluye generación de boletines PDF con Puppeteer.',
      type: 'backend',
    },
    {
      name: 'Policies',
      path: 'api/src/policies/',
      description: 'RBAC: define qué datos puede leer cada rol (read-scope) y quién puede crear, editar o borrar cada recurso (write-access).',
      type: 'backend',
    },
    {
      name: 'Repositories',
      path: 'api/src/repositories/',
      description: 'Única capa que emite SQL. registry.js declara columnas visibles, ocultas y secretas de cada tabla.',
      type: 'backend',
    },
    {
      name: 'Middleware',
      path: 'api/src/middleware/',
      description: 'Piezas transversales: requireAuth (JWT Bearer), optionalAuth, loginRateLimit y errorHandler global.',
      type: 'backend',
    },
    {
      name: 'Database Pool',
      path: 'api/src/db/pool.js',
      description: 'Pool de conexiones pg hacia PostgreSQL. Incluye guard que aborta si DATABASE_URL apunta a Supabase fuera de producción.',
      type: 'database',
    },
    {
      name: 'PostgreSQL',
      path: 'api/schema.sql',
      description: 'Base de datos relacional. Esquema inicializado con schema.sql y sembrado con scripts/setup.js al arrancar el contenedor.',
      type: 'database',
    },
    {
      name: 'React Entry Point',
      path: 'client/src/main.tsx',
      description: 'Punto de entrada del frontend. Monta <App /> en el div#root con StrictMode.',
      type: 'frontend',
    },
    {
      name: 'App Router',
      path: 'client/src/App.tsx',
      description: 'Componente raíz. Envuelve en AppProvider y renderiza el dashboard del rol autenticado o el Login si no hay sesión.',
      type: 'frontend',
    },
    {
      name: 'App Context',
      path: 'client/src/context/',
      description: 'Estado global: sesión, colecciones de datos, subdominio activo y errores. Expone useApp() a todos los componentes.',
      type: 'frontend',
    },
    {
      name: 'Hooks',
      path: 'client/src/hooks/',
      description: 'Lógica con ciclo de vida: useAuthSession, usePlatformData, useSubdomain y useMessaging.',
      type: 'frontend',
    },
    {
      name: 'HTTP Service',
      path: 'client/src/services/http.ts',
      description: 'Capa de transporte: URL base, token Bearer, detección de fallos de red y evento auth:unauthorized ante un 401 inesperado.',
      type: 'frontend',
    },
    {
      name: 'API Services',
      path: 'client/src/services/api/',
      description: 'Módulos REST por recurso (auth, report, resource). Único punto de acceso al backend desde los componentes.',
      type: 'frontend',
    },
    {
      name: 'Dashboards',
      path: 'client/src/components/dashboards/',
      description: 'Un panel por rol (super_admin, admin, teacher, student). Organizados en pestañas. Consumen useApp() y delegan HTTP a API Services.',
      type: 'frontend',
    },
    {
      name: 'UI Components',
      path: 'client/src/components/ui/',
      description: 'Primitivas visuales reutilizables sin lógica de dominio (botones, tablas, modales). Reciben datos ya preparados.',
      type: 'frontend',
    },
    {
      name: 'Export Services',
      path: 'client/src/services/export/',
      description: 'Generación de archivos exportables: boletines PDF (vía API) y reportes Excel (SheetJS).',
      type: 'frontend',
    },
    {
      name: 'Docker Compose',
      path: 'docker-compose.yml',
      description: 'Orquesta tres servicios: db (PostgreSQL 16), api (Express) y client (React + Nginx). Dockerfile.production fusiona api y client en una sola imagen.',
      type: 'infrastructure',
    },
  ],
  relationships: [
    { from: 'API Server',       to: 'Express App',       description: 'Llama a createApp() y luego .listen()' },
    { from: 'Express App',      to: 'Routes',             description: 'Monta todos los routers bajo /api' },
    { from: 'Express App',      to: 'Middleware',         description: 'Registra error handler global' },
    { from: 'Routes',           to: 'Controllers',        description: 'Delega cada petición al controlador del recurso' },
    { from: 'Routes',           to: 'Middleware',         description: 'Aplica requireAuth u optionalAuth por ruta' },
    { from: 'Controllers',      to: 'Services',           description: 'Invoca el caso de uso con los params del request' },
    { from: 'Services',         to: 'Policies',           description: 'Consulta scope de lectura/escritura del rol' },
    { from: 'Services',         to: 'Repositories',       description: 'Delega persistencia y recuperación de datos' },
    { from: 'Repositories',     to: 'Database Pool',      description: 'Única capa que emite queries parametrizadas' },
    { from: 'Database Pool',    to: 'PostgreSQL',         description: 'Gestiona el pool de conexiones TCP' },
    { from: 'React Entry Point',to: 'App Router',         description: 'Renderiza <App /> como raíz del árbol' },
    { from: 'App Router',       to: 'App Context',        description: 'Envuelve en AppProvider y consume useApp()' },
    { from: 'App Router',       to: 'Dashboards',         description: 'Selecciona el dashboard según el rol' },
    { from: 'App Context',      to: 'Hooks',              description: 'AppProvider delega estado a useAppState' },
    { from: 'Hooks',            to: 'API Services',       description: 'useAuthSession y usePlatformData llaman al API' },
    { from: 'API Services',     to: 'HTTP Service',       description: 'Construyen llamadas sobre apiFetch/http' },
    { from: 'HTTP Service',     to: 'Express App',        description: 'Envía peticiones REST con token Bearer hacia /api' },
    { from: 'Dashboards',       to: 'App Context',        description: 'Consumen estado global vía useApp()' },
    { from: 'Dashboards',       to: 'API Services',       description: 'Delegan mutaciones al API (nunca llaman fetch directo)' },
    { from: 'Dashboards',       to: 'UI Components',      description: 'Componen la interfaz con primitivas visuales' },
    { from: 'Dashboards',       to: 'Export Services',    description: 'Solicitan exportación de PDF y Excel' },
    { from: 'Docker Compose',   to: 'PostgreSQL',         description: 'Levanta el contenedor db con volumen persistente' },
    { from: 'Docker Compose',   to: 'API Server',         description: 'Levanta el contenedor api e inyecta variables de entorno' },
    { from: 'Docker Compose',   to: 'React Entry Point',  description: 'Levanta el contenedor client (Nginx) tras healthcheck de api' },
  ],
};
