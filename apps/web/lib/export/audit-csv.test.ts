import { describe, expect, it } from 'vitest';
import { auditExportFilename, csvCell, toCsv, toJson } from '@/lib/export/audit-csv';
import type { AuditEvent } from '@/lib/api/types';

function event(over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'evt-1',
    tenantId: 'acme',
    actor: { principalId: 'admin@acme.test', kind: 'user' },
    action: 'memory.write',
    target: '/v1/memory',
    outcome: 'success',
    at: '2026-07-17T10:00:00.000Z',
    ...over,
  };
}

describe('csvCell — formula injection', () => {
  it('neutralizes every formula prefix a spreadsheet would execute', () => {
    // Not theoretical: `=HYPERLINK(...)` exfiltrates the row on click, and audit cells are NOT
    // trusted — principalId comes from an OIDC/token identity, target from a route URL.
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(
      `"'=HYPERLINK(""http://evil"",""click"")"`,
    );
    expect(csvCell('+1+1')).toBe(`"'+1+1"`);
    expect(csvCell('-1+1')).toBe(`"'-1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('\tinjected')).toBe(`"'\tinjected"`);
    expect(csvCell('\rinjected')).toBe(`"'\rinjected"`);
  });

  it('leaves ordinary text alone', () => {
    expect(csvCell('memory.write')).toBe('"memory.write"');
    expect(csvCell('admin@acme.test')).toBe('"admin@acme.test"'); // @ mid-string is not a prefix
  });

  it('quotes per RFC 4180 — commas, quotes and newlines survive a round trip', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders absent values as an empty cell, never "undefined"', () => {
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(null)).toBe('""');
  });
});

describe('toCsv', () => {
  it('emits a header and one row per event', () => {
    const csv = toCsv([event()]);
    const lines = csv.trimEnd().split('\r\n');

    expect(lines[0]).toBe('"at","actor","actorKind","action","target","outcome","tenantId","id"');
    expect(lines[1]).toContain('"admin@acme.test"');
    expect(lines[1]).toContain('"memory.write"');
    expect(lines).toHaveLength(2);
  });

  it('renders a missing target as an empty cell', () => {
    // `target` is exact-optional, so an absent one means the key is ABSENT — not set to undefined.
    const withoutTarget: AuditEvent = {
      id: 'evt-2',
      tenantId: 'acme',
      actor: { principalId: 'admin@acme.test', kind: 'user' },
      action: 'search',
      outcome: 'success',
      at: '2026-07-17T10:00:00.000Z',
    };
    const csv = toCsv([withoutTarget]);

    expect(csv).toContain('"","success"');
    expect(csv).not.toContain('undefined');
  });

  it('survives a malicious actor id end to end', () => {
    const csv = toCsv([event({ actor: { principalId: '=1+1', kind: 'token' }, target: '",\nx' })]);

    // The formula is neutralized...
    expect(csv).toContain(`"'=1+1"`);
    // ...and the embedded quote/comma/newline are quoted rather than breaking the row structure.
    expect(csv).toContain('""",\nx"');
    // Header + exactly one record: the injected newline did NOT create a third row.
    expect(csv.split('\r\n').filter((l) => l.length > 0)).toHaveLength(2);
  });

  it('emits just a header for no events', () => {
    expect(toCsv([]).trimEnd()).toBe(
      '"at","actor","actorKind","action","target","outcome","tenantId","id"',
    );
  });
});

describe('toJson', () => {
  it('round-trips the events exactly', () => {
    const events = [event()];
    expect(JSON.parse(toJson(events))).toEqual(events);
  });
});

describe('auditExportFilename', () => {
  it('is filesystem-safe and timestamped', () => {
    const name = auditExportFilename('csv', new Date('2026-07-17T10:20:30.000Z'));
    expect(name).toBe('tessera-audit-2026-07-17T10-20-30.csv');
    expect(name).not.toContain(':'); // a colon is an NTFS alternate-data-stream separator
  });
});
