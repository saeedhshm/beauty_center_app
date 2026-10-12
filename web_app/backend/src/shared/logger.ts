import { pino } from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    redact: {
      paths: ['password', 'token', 'authorization', 'cookie', 'databaseUrl', 'req.headers', 'req.body'],
      censor: '[REDACTED]',
    },
  });
}
