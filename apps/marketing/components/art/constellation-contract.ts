/**
 * The constellation's tiny shared contract — kept separate from the engine so the band
 * can import the type + seed statically without pulling the Canvas engine into the
 * first-load chunk (the engine itself loads ssr:false).
 */
export interface ConstellationTelemetry {
  tokens: number;
  rpm: number;
  agents: number;
}

/** Frozen values under reduced motion — the honest still frame. */
export const TELEMETRY_SEED: ConstellationTelemetry = { tokens: 1_284_312, rpm: 212, agents: 4 };
