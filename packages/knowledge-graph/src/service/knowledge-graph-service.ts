import { NotFoundError, ValidationError } from '@tessera/core';
import type { z } from 'zod';
import {
  EFFECT_LINK_KIND,
  edgeIdFor,
  nodeIdFor,
  type EffectHit,
  type GraphEdge,
  type GraphNode,
  type NodeId,
} from '../domain.js';
import type { GetEffectsOptions, GraphStore } from '../ports/graph-store.js';
import { staticEffectLinksFrom } from '../effects/static-derivation.js';
import {
  assertEffectLinkSchema,
  nodeRefSchema,
  upsertEdgeSchema,
  upsertNodeSchema,
  type AssertEffectLinkInput,
  type NodeRef,
  type UpsertEdgeInput,
  type UpsertNodeInput,
} from '../validation.js';

/** Parse with a domain schema, raising a typed {@link ValidationError} on failure. */
function parseOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message: string,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(message, { details: { issues: result.error.issues } });
  }
  return result.data as z.output<TSchema>;
}

/** The knowledge-graph domain service — the surface REST (F-011) and MCP (F-012) expose. */
export interface KnowledgeGraphService {
  /** Upsert a node (idempotent by `(kind, key)`). */
  upsertNode(input: UpsertNodeInput): Promise<GraphNode>;
  /** Upsert a structural edge between two nodes (idempotent). */
  upsertEdge(input: UpsertEdgeInput): Promise<GraphEdge>;
  /** Assert an effect-link manually (FR-17/18). */
  assertEffectLink(input: AssertEffectLinkInput): Promise<GraphEdge>;
  /** Derive effect-links from the stored dependency edges (FR-18); returns the count added. */
  deriveStaticEffectLinks(): Promise<number>;
  /** What is affected if the referenced node changes — ranked dependents with paths (FR-19). */
  getEffects(node: NodeRef, options?: GetEffectsOptions): Promise<readonly EffectHit[]>;
}

/** Create a {@link KnowledgeGraphService} backed by a {@link GraphStore}. */
export function createKnowledgeGraphService(store: GraphStore): KnowledgeGraphService {
  function refToId(ref: { kind: GraphNode['kind']; key: string }): NodeId {
    return nodeIdFor(ref.kind, ref.key);
  }

  return {
    async upsertNode(input) {
      const parsed = parseOrThrow(upsertNodeSchema, input, 'invalid node');
      const node: GraphNode = {
        id: nodeIdFor(parsed.kind, parsed.key),
        kind: parsed.kind,
        key: parsed.key,
        label: parsed.label,
        metadata: parsed.metadata,
      };
      await store.addNode(node);
      return node;
    },

    async upsertEdge(input) {
      const parsed = parseOrThrow(upsertEdgeSchema, input, 'invalid edge');
      const from = refToId(parsed.from);
      const to = refToId(parsed.to);
      const edge: GraphEdge = {
        id: edgeIdFor(from, to, parsed.kind),
        from,
        to,
        kind: parsed.kind,
        rationale: null,
        confidence: null,
        origin: null,
        metadata: parsed.metadata,
      };
      await store.addEdge(edge);
      return edge;
    },

    async assertEffectLink(input) {
      const parsed = parseOrThrow(assertEffectLinkSchema, input, 'invalid effect-link');
      const from = refToId(parsed.from);
      const to = refToId(parsed.to);
      const edge: GraphEdge = {
        id: edgeIdFor(from, to, EFFECT_LINK_KIND),
        from,
        to,
        kind: EFFECT_LINK_KIND,
        rationale: parsed.rationale,
        confidence: parsed.confidence,
        origin: parsed.origin,
        metadata: parsed.metadata,
      };
      await store.addEdge(edge);
      return edge;
    },

    async deriveStaticEffectLinks() {
      const edges = await store.listEdges();
      const links = staticEffectLinksFrom(edges);
      await Promise.all(links.map((link) => store.addEdge(link)));
      return links.length;
    },

    async getEffects(node, options) {
      const ref = parseOrThrow(nodeRefSchema, node, 'invalid node reference');
      const id = nodeIdFor(ref.kind, ref.key);
      if ((await store.getNode(id)) === undefined) {
        throw new NotFoundError('node not found', { details: { kind: ref.kind, key: ref.key } });
      }
      return store.getEffects(id, options);
    },
  };
}
