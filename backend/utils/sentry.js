










const { normalizeError } = require('./appError');
let Sentry = null;
let initialized = false;

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    .replace(/(token|secret|password|senha|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function sanitizeRoute(value) {
  return String(value || '')
    .split(/[?#]/, 1)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:id')
    .replace(/\/[^/]*(?:%40|@)[^/]*(?=\/|$)/gi, '/:value');
}

function sanitizeSentryEvent(event) {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.Authorization;
      delete event.request.headers.cookie;
      delete event.request.headers.Cookie;
    }
    if (event.request.url) event.request.url = sanitizeRoute(event.request.url);
  }
  delete event.user;
  delete event.extra;
  if (event.message) event.message = redact(event.message);
  for (const item of event.exception?.values || []) {
    if (item.value) item.value = redact(item.value);
  }
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.message) crumb.message = redact(crumb.message);
    if (crumb.data?.url) crumb.data.url = String(crumb.data.url).split(/[?#]/, 1)[0];
    if (crumb.data) delete crumb.data.body;
  }
  return event;
}

function initSentryBackend() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    initialized = true;
    return;
  }
  try {
    Sentry = require('@sentry/node');
    const env = process.env.SENTRY_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
    const tracesSampleRate = Number(
      process.env.SENTRY_TRACES_RATE ?? (env === 'production' ? 0.1 : 0)
    );
    Sentry.init({
      dsn,
      environment: env,
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_RELEASE || undefined,
      tracesSampleRate,
      sendDefaultPii: false,
      beforeSend(event) {
        return sanitizeSentryEvent(event);
      },
    });
    initialized = true;
    console.log(`[Sentry] inicializado em ${env} (sample=${tracesSampleRate})`);
  } catch (e) {
    console.warn('[Sentry] falha ao inicializar:', e.message);
  }
}


function noopRequestHandler() {
  return (_req, _res, next) => next();
}
function noopErrorHandler() {
  return (err, _req, _res, next) => next(err);
}




function sentryRequestHandler() {
  return noopRequestHandler();
}




function shouldCaptureException(error) {
  const normalized = normalizeError(error);
  return !(normalized.isOperational && Number(normalized.status) < 500);
}

function sentryErrorHandler() {
  if (!Sentry) return noopErrorHandler();
  return (err, req, _res, next) => {

    if (shouldCaptureException(err)) {
      try {
        captureException(err, {
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || req.originalUrl || req.path,
        });
      } catch {}
    }
    next(err);
  };
}

function captureException(err, ctx) {
  if (!Sentry) return null;
  const normalized = normalizeError(err);
  const route = sanitizeRoute(ctx?.route);
  return Sentry.withScope((scope) => {
    scope.setTag('error.code', normalized.code);
    scope.setTag('http.status_code', String(normalized.status));
    if (ctx?.method) scope.setTag('http.request.method', String(ctx.method).toUpperCase());
    if (ctx?.handled) scope.setTag('error.handled', 'true');
    if (ctx?.operation) scope.setTag('cbrio.operation', String(ctx.operation).slice(0, 100));
    scope.setContext('cbrio_request', {
      requestId: ctx?.requestId || null,
      route: route || null,
      operation: ctx?.operation ? String(ctx.operation).slice(0, 100) : null,
    });
    Sentry.captureException(err);
  });
}

function captureContextForRequest(req, operation) {
  return {
    requestId: req?.requestId,
    method: req?.method,
    route: typeof req?.route?.path === 'string'
      ? `${req?.baseUrl || ''}${req.route.path}`
      : req?.originalUrl || req?.path,
    operation,
    handled: true,
  };
}

function captureHandledException(err, req, operation) {
  try {
    return captureException(err, captureContextForRequest(req, operation));
  } catch (captureError) {
    console.warn('[Sentry] falha ao capturar exceção tratada:', captureError.message);
    return null;
  }
}

module.exports = {
  initSentryBackend,
  sentryRequestHandler,
  sentryErrorHandler,
  captureException,
  sanitizeSentryEvent,
  captureHandledException,
  captureContextForRequest,
  sanitizeRoute,
  shouldCaptureException,
};
