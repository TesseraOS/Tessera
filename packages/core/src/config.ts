/**
 * Deployment profile selecting which adapters/providers are wired (ADR-0003).
 * The full, validated config loader is a later feature (F-015); these are the shared types.
 */
export type DeploymentProfile = 'local' | 'self-hosted' | 'cloud';

/** All deployment profiles, in increasing order of managed infrastructure. */
export const DEPLOYMENT_PROFILES: readonly DeploymentProfile[] = ['local', 'self-hosted', 'cloud'];

export type Environment = 'development' | 'test' | 'production';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Minimal core configuration shape shared across packages. */
export interface CoreConfig {
  readonly profile: DeploymentProfile;
  readonly env: Environment;
  readonly logLevel: LogLevel;
}

/** Type guard for a valid {@link DeploymentProfile}. */
export function isDeploymentProfile(value: unknown): value is DeploymentProfile {
  return typeof value === 'string' && (DEPLOYMENT_PROFILES as readonly string[]).includes(value);
}
