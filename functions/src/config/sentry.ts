import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.ENVIRONMENT || 'development',
  tracesSampleRate: 1.0,
});
