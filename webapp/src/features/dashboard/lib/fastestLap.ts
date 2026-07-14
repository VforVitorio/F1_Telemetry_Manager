import type { LapTime } from '@/lib/api/telemetry'

/**
 * Each driver's fastest lap NUMBER (by `lap_time`), computed from the full
 * (unfiltered) lap set — the outlier/invalid toggles must not hide a driver's
 * genuine fastest lap. Drives both the SELECT FASTEST LAPS button and the
 * auto-load-on-selection behaviour.
 */
export function fastestLapPerDriver(
  lapTimes: LapTime[],
  drivers: string[],
): Record<string, number> {
  const fastest: Record<string, number> = {}
  for (const driver of drivers) {
    const driverLaps = lapTimes.filter((lap) => lap.driver === driver)
    if (driverLaps.length === 0) continue
    const quickest = driverLaps.reduce((best, lap) => (lap.lap_time < best.lap_time ? lap : best))
    fastest[driver] = quickest.lap_number
  }
  return fastest
}
