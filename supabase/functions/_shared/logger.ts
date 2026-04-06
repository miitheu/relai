/**
 * Structured JSON logger for edge functions.
 */
export function createLogger(functionName: string) {
  const log = (level: string, msg: string, data?: Record<string, unknown>) =>
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
      JSON.stringify({ level, fn: functionName, msg, ...data, ts: new Date().toISOString() }),
    );

  return {
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
  };
}
