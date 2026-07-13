// Query-key factory mirroring the REST paths. Centralising keys keeps them
// typo-proof and makes invalidation legible (invalidate `['telemetry']` to drop
// the whole domain). Extended per feature as screens land (#34 onward).
export const queryKeys = {
  telemetry: {
    gps: (year: number) => ['telemetry', 'gps', year] as const,
    sessions: (year: number, gp: string) => ['telemetry', 'sessions', year, gp] as const,
    drivers: (year: number, gp: string, session: string) =>
      ['telemetry', 'drivers', year, gp, session] as const,
  },
  chat: {
    health: () => ['chat', 'health'] as const,
    models: () => ['chat', 'models'] as const,
  },
} as const
