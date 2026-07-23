/**
 * Second fixture corpus (F-071). The distinctive term here is "sunstone" — a nonsense word that
 * appears ONLY in this fixture, so a cross-scope isolation assertion can prove that content scanned
 * under one (tenant, project) is invisible to another: a hit for "sunstone" can only come from here.
 */

/** A sunstone beacon reading: a timestamped signal strength. */
export interface SunstoneReading {
  readonly at: string;
  readonly strength: number;
}

/** The peak strength across a run of sunstone readings (0 when there are none). */
export function peakSunstone(readings: readonly SunstoneReading[]): number {
  return readings.reduce((peak, reading) => Math.max(peak, reading.strength), 0);
}
