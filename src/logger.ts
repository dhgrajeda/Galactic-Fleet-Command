/**
 * Structured log entry. Consumers attach domain context (commandId, fleetId, etc.)
 * so that any backend — console, pino, OTel — can index on it.
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Logger interface. Swap the implementation to route logs to
 * OpenTelemetry, pino, Datadog, etc. without touching domain code.
 */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

/**
 * Console-based logger. Writes structured JSON lines to stdout/stderr.
 */
export class ConsoleLogger implements Logger {
  private readonly base: LogContext;

  constructor(base: LogContext = {}) {
    this.base = base;
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.base, ...context });
  }

  private write(level: string, message: string, context?: LogContext): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.base,
      ...context,
    };

    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }
}

/**
 * Silent logger — drops all output. Useful for tests.
 */
export class NoopLogger implements Logger {
  info(): void { /* noop */ }
  warn(): void { /* noop */ }
  error(): void { /* noop */ }
  debug(): void { /* noop */ }
  child(): Logger { return this; }
}
