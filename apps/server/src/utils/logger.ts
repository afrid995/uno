type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

class StructuredLogger {
  private format(level: LogLevel, message: string, context?: LogContext): string {
    const sanitizedContext = this.sanitize(context);
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {}),
    });
  }

  /**
   * Redacts sensitive fields like tokens, secrets, passwords before logging.
   */
  private sanitize(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;
    const sensitiveKeys = ['token', 'sessiontoken', 'password', 'secret', 'authorization', 'cookie'];
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value as LogContext);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  info(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.log(this.format('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.warn(this.format('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    // eslint-disable-next-line no-console
    console.error(this.format('error', message, context));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(this.format('debug', message, context));
    }
  }
}

export const logger = new StructuredLogger();
