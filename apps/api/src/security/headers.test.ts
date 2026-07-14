import { describe, expect, it } from 'vitest';
import { securityHeaders } from './headers.js';

describe('securityHeaders (F-044)', () => {
  it('emits the baseline hardening headers with no HSTS by default', () => {
    const headers = securityHeaders();
    expect(headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['strict-transport-security']).toBeUndefined();
  });

  it('adds HSTS only when enabled, honoring a custom max-age', () => {
    const headers = securityHeaders({ hsts: true, hstsMaxAgeSeconds: 1000 });
    expect(headers['strict-transport-security']).toBe('max-age=1000; includeSubDomains');
  });

  it('uses a sensible default HSTS max-age when enabled without one', () => {
    const headers = securityHeaders({ hsts: true });
    expect(headers['strict-transport-security']).toMatch(/^max-age=\d+; includeSubDomains$/);
  });

  it('does not mutate a shared object across calls', () => {
    const a = securityHeaders({ hsts: true });
    const b = securityHeaders();
    expect(a['strict-transport-security']).toBeDefined();
    expect(b['strict-transport-security']).toBeUndefined();
  });
});
