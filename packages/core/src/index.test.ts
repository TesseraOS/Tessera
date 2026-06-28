import { describe, expect, it } from 'vitest';
import { VERSION, coreVersion } from './index';

describe('@tessera/core', () => {
  it('exposes a version string', () => {
    expect(typeof VERSION).toBe('string');
  });

  it('coreVersion() returns VERSION', () => {
    expect(coreVersion()).toBe(VERSION);
  });
});
