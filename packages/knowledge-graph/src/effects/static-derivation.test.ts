import { describe, expect, it } from 'vitest';
import { EFFECT_LINK_KIND, edgeIdFor, nodeIdFor, type GraphEdge } from '../domain.js';
import { STATIC_EFFECT_CONFIDENCE, staticEffectLinksFrom } from './static-derivation.js';

function structural(fromKey: string, toKey: string, kind: GraphEdge['kind']): GraphEdge {
  const from = nodeIdFor('file', fromKey);
  const to = nodeIdFor('file', toKey);
  return {
    id: edgeIdFor(from, to, kind),
    from,
    to,
    kind,
    rationale: null,
    confidence: null,
    origin: null,
    metadata: {},
  };
}

describe('staticEffectLinksFrom', () => {
  it('inverts a dependency edge into a static effect-link', () => {
    const links = staticEffectLinksFrom([structural('app.ts', 'util.ts', 'imports')]);

    expect(links).toHaveLength(1);
    expect(links[0]?.from).toBe(nodeIdFor('file', 'util.ts')); // the dependency
    expect(links[0]?.to).toBe(nodeIdFor('file', 'app.ts')); // the dependent
    expect(links[0]?.kind).toBe(EFFECT_LINK_KIND);
    expect(links[0]?.origin).toBe('static');
    expect(links[0]?.confidence).toBe(STATIC_EFFECT_CONFIDENCE);
  });

  it('ignores non-dependency edges', () => {
    expect(staticEffectLinksFrom([structural('a', 'b', 'contains')])).toEqual([]);
  });

  it('is idempotent: the derived edge id is deterministic', () => {
    const first = staticEffectLinksFrom([structural('a', 'b', 'calls')]);
    const second = staticEffectLinksFrom([structural('a', 'b', 'calls')]);

    expect(first[0]?.id).toBe(second[0]?.id);
  });
});
