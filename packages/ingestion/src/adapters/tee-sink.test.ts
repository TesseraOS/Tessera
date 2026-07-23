import { newId } from '@tessera/core';
import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../domain.js';
import type { DocumentRef, DocumentSink } from '../ports/sink.js';
import { teeSink } from './tee-sink.js';

/** A sink that records the scope it was resolved to, plus the ops it received in that scope. */
function probeSink(
  log: { scope: string; op: string; ref: string }[],
  scope = '(default,default)',
): DocumentSink {
  return {
    upsert(document) {
      log.push({ scope, op: 'upsert', ref: document.id });
      return Promise.resolve();
    },
    remove(ref: DocumentRef) {
      log.push({ scope, op: 'remove', ref: ref.path });
      return Promise.resolve();
    },
    forTenant(tenantId) {
      return probeSink(log, `(${tenantId},default)`);
    },
    forProject(projectId) {
      const [tenant] = scope.slice(1, -1).split(',');
      return probeSink(log, `(${tenant},${projectId})`);
    },
  };
}

const doc = (): ProcessedDocument => ({
  id: newId<'Document'>(),
  source: { id: newId<'Source'>(), kind: 'test', label: 'x' },
  path: 'a.ts',
  kind: 'code',
  contentHash: 'h',
  text: 't',
  metadata: {},
  redactions: [],
});

describe('teeSink scope forwarding (F-071)', () => {
  it('forwards a scoped view to EVERY member — the silent-drop regression guard', async () => {
    const log: { scope: string; op: string; ref: string }[] = [];
    const tee = teeSink(probeSink(log), probeSink(log));

    const document = doc();
    await tee.forTenant('acme').forProject('beta').upsert(document);

    // BOTH members received the upsert, and both in (acme, beta) — not one of them in the default.
    expect(log).toEqual([
      { scope: '(acme,beta)', op: 'upsert', ref: document.id },
      { scope: '(acme,beta)', op: 'upsert', ref: document.id },
    ]);
  });

  it('forwards remove to every member in the resolved scope', async () => {
    const log: { scope: string; op: string; ref: string }[] = [];
    const tee = teeSink(probeSink(log), probeSink(log));

    await tee.forTenant('acme').remove({ sourceId: newId<'Source'>(), path: 'gone.ts' });

    expect(log).toEqual([
      { scope: '(acme,default)', op: 'remove', ref: 'gone.ts' },
      { scope: '(acme,default)', op: 'remove', ref: 'gone.ts' },
    ]);
  });
});
