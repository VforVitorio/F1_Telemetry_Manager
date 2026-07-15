// Query-key factory mirroring the REST paths. Centralising keys keeps them
// typo-proof and makes invalidation legible (invalidate `['telemetry']` to drop
// the whole domain). Extended per feature as screens land (#34 onward).
export const queryKeys = {
  telemetry: {
    gps: (year: number) => ['telemetry', 'gps', year] as const,
    sessions: (year: number, gp: string) => ['telemetry', 'sessions', year, gp] as const,
    drivers: (year: number, gp: string, session: string) =>
      ['telemetry', 'drivers', year, gp, session] as const,
    lapTimes: (year: number, gp: string, session: string, drivers: string) =>
      ['telemetry', 'lap-times', year, gp, session, drivers] as const,
    lapTelemetry: (year: number, gp: string, session: string, driver: string, lap: number) =>
      ['telemetry', 'lap-telemetry', year, gp, session, driver, lap] as const,
    circuitDomination: (year: number, gp: string, session: string, drivers: string) =>
      ['telemetry', 'circuit-domination', year, gp, session, drivers] as const,
  },
  chat: {
    health: () => ['chat', 'health'] as const,
    models: () => ['chat', 'models'] as const,
  },
  strategy: {
    gps: () => ['strategy', 'gps'] as const,
    drivers: (gp: string) => ['strategy', 'drivers', gp] as const,
    lapRange: (gp: string, driver: string) => ['strategy', 'lap-range', gp, driver] as const,
    lapState: (gp: string, driver: string, lap: number) =>
      ['strategy', 'lap-state', gp, driver, lap] as const,
    paceRange: (gp: string, driver: string, start: number, end: number) =>
      ['strategy', 'pace-range', gp, driver, start, end] as const,
    agent: (agent: string, gp: string, driver: string, lap: number) =>
      ['strategy', 'agent', agent, gp, driver, lap] as const,
  },
} as const
