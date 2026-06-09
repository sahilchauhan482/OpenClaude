export function startServer(
  config: { port?: number } & Record<string, unknown>,
  _sessionManager: unknown,
  _logger: unknown,
): {
  port?: number
  stop(force?: boolean): void
} {
  return {
    port: typeof config.port === 'number' ? config.port : undefined,
    stop(_force?: boolean): void {},
  }
}
