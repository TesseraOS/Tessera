import { describe, expect, it } from 'vitest';
import { DEPLOYMENT_PROFILES, isDeploymentProfile } from './config';

describe('config', () => {
  it('lists the deployment profiles', () => {
    expect(DEPLOYMENT_PROFILES).toEqual(['local', 'self-hosted', 'cloud']);
  });

  it('isDeploymentProfile guards values', () => {
    expect(isDeploymentProfile('local')).toBe(true);
    expect(isDeploymentProfile('cloud')).toBe(true);
    expect(isDeploymentProfile('nope')).toBe(false);
    expect(isDeploymentProfile(5)).toBe(false);
  });
});
