import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { captureIo } from '../../tests/support/capture-io.js';
import { run } from '../cli.js';

interface DoctorReport {
  ok: boolean;
  checks: { name: string; status: string; detail: string }[];
}

describe('doctor', () => {
  it('passes on a healthy default install (fake embeddings, writable tmp cwd)', async () => {
    const io = captureIo({ cwd: tmpdir(), env: { TESSERA_EMBEDDINGS_PROVIDER: 'fake' } });
    const code = await run(['doctor', '--json'], io);
    expect(code).toBe(0);
    const report = JSON.parse(io.out()) as DoctorReport;
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === 'node')?.status).not.toBe('fail');
    expect(report.checks.find((c) => c.name === 'embeddings')?.detail).toContain('fake');
  });

  it('fails when the config is invalid (oidc mode without an issuer)', async () => {
    const io = captureIo({ cwd: tmpdir(), env: { TESSERA_AUTH_MODE: 'oidc' } });
    const code = await run(['doctor', '--json'], io);
    expect(code).toBe(1);
    const report = JSON.parse(io.out()) as DoctorReport;
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'config')?.status).toBe('fail');
  });
});
