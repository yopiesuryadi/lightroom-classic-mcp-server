import fs from "node:fs";
import path from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private readonly logFile: string) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }

  debug(message: string, fields: Record<string, unknown> = {}): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields: Record<string, unknown> = {}): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields: Record<string, unknown> = {}): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    this.write("error", message, fields);
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...fields
    };
    const line = `${JSON.stringify(entry)}\n`;
    fs.appendFileSync(this.logFile, line);
    process.stderr.write(line);
  }
}
