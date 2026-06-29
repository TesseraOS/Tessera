import { describe, expect, it } from 'vitest';
import { redactSecrets } from './redact.js';

// Fixtures use well-known DOCUMENTATION/EXAMPLE values, not real secrets.
const AWS_EXAMPLE_KEY = 'AKIAIOSFODNN7EXAMPLE'; // AWS's own documented example access key id.
const GITHUB_EXAMPLE = `ghp_${'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'}`; // ghp_ + 36 chars.

describe('redactSecrets', () => {
  it('removes an AWS access key id and records the finding', () => {
    const input = `const key = "${AWS_EXAMPLE_KEY}";`;

    const { text, findings } = redactSecrets(input);

    expect(text).not.toContain(AWS_EXAMPLE_KEY);
    expect(text).toContain('[redacted:aws-access-key-id]');
    expect(findings).toContainEqual({ detector: 'aws-access-key-id', count: 1 });
  });

  it('removes a GitHub token', () => {
    const { text } = redactSecrets(`token: ${GITHUB_EXAMPLE}`);

    expect(text).not.toContain(GITHUB_EXAMPLE);
    expect(text).toContain('[redacted:github-token]');
  });

  it('redacts a PEM private key block while preserving surrounding text', () => {
    const input = [
      'before',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0ExampleNotARealKeyJustFixtureBytes==',
      '-----END RSA PRIVATE KEY-----',
      'after',
    ].join('\n');

    const { text, findings } = redactSecrets(input);

    expect(text).toContain('before');
    expect(text).toContain('after');
    expect(text).not.toContain('PRIVATE KEY');
    expect(findings).toContainEqual({ detector: 'private-key-block', count: 1 });
  });

  it('redacts the password in a basic-auth URL but keeps scheme/user/host', () => {
    const { text } = redactSecrets('postgres://admin:s3cr3tP4ss@db.internal:5432/app');

    expect(text).not.toContain('s3cr3tP4ss');
    expect(text).toContain('postgres://admin:');
    expect(text).toContain('@db.internal:5432/app');
  });

  it('redacts a quoted credential assignment but keeps the key', () => {
    const { text } = redactSecrets('api_key = "abcd1234efgh5678"');

    expect(text).not.toContain('abcd1234efgh5678');
    expect(text).toContain('api_key');
    expect(text).toContain('[redacted:credential-assignment]');
  });

  it('does not mangle ordinary unquoted code', () => {
    const code = 'const token = getToken(userId);';

    const { text, findings } = redactSecrets(code);

    expect(text).toBe(code);
    expect(findings).toEqual([]);
  });

  it('reports counts only and never the secret value in findings', () => {
    const { findings } = redactSecrets(`a=${AWS_EXAMPLE_KEY} b=${AWS_EXAMPLE_KEY}`);

    expect(findings).toContainEqual({ detector: 'aws-access-key-id', count: 2 });
    expect(JSON.stringify(findings)).not.toContain(AWS_EXAMPLE_KEY);
  });

  it('returns text unchanged and no findings when there is nothing to redact', () => {
    const clean = 'export function add(a: number, b: number) { return a + b; }';

    expect(redactSecrets(clean)).toEqual({ text: clean, findings: [] });
  });
});
