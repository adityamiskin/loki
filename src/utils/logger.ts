export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface LogSummary {
  total: number;
  byLevel: Record<LogLevel, number>;
  recent: Array<Pick<LogEntry, 'timestamp' | 'level' | 'message' | 'module'>>;
  lastTimestamp?: string;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private logLevel: LogLevel = 'info';
  private moduleName: string = 'app';

  setModule(module: string) {
    this.moduleName = module;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.moduleName,
    };

    if (metadata) {
      entry.metadata = metadata;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    return entry;
  }

  debug(message: string, metadata?: Record<string, unknown>, error?: Error) {
    if (!this.shouldLog('debug')) return;
    const entry = this.createLogEntry('debug', message, metadata, error);
    console.debug(JSON.stringify(entry));
  }

  info(message: string, metadata?: Record<string, unknown>, error?: Error) {
    if (!this.shouldLog('info')) return;
    const entry = this.createLogEntry('info', message, metadata, error);
    console.log(JSON.stringify(entry));
  }

  warn(message: string, metadata?: Record<string, unknown>, error?: Error) {
    if (!this.shouldLog('warn')) return;
    const entry = this.createLogEntry('warn', message, metadata, error);
    console.warn(JSON.stringify(entry));
  }

  error(message: string, metadata?: Record<string, unknown>, error?: Error) {
    if (!this.shouldLog('error')) return;
    const entry = this.createLogEntry('error', message, metadata, error);
    console.error(JSON.stringify(entry));
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.logs];
    return this.logs.filter((log) => log.level === level);
  }

  getSummary(limit = 10): LogSummary {
    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    for (const entry of this.logs) {
      byLevel[entry.level] += 1;
    }

    const recent = this.logs.slice(-limit).map((entry) => ({
      timestamp: entry.timestamp,
      level: entry.level,
      message: entry.message,
      module: entry.module,
    }));

    return {
      total: this.logs.length,
      byLevel,
      recent,
      lastTimestamp: this.logs.length
        ? this.logs[this.logs.length - 1]!.timestamp
        : undefined,
    };
  }

  clearLogs() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new Logger();
export default logger;
