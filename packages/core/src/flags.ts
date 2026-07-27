/**
 * Feature flags (FR-57) — progressive rollout, evaluated **per tenant**.
 *
 * The port lives in `@tessera/core`, the dependency-free base, for the same reason
 * {@link ./tenant.ts} does: the API boundary evaluates flags on every request and must be able to
 * hold the contract without depending on `@tessera/config` (the composition root imports the API,
 * never the reverse). A flag is a product primitive, not a deployment adapter.
 *
 * The shipped adapter is {@link createStaticFlagProvider}, which resolves from operator-declared
 * config. A remote provider (LaunchDarkly, Unleash, an internal service) is a real seam behind the
 * same port — it would stream or poll its own rules and answer the same three questions.
 */

import { ValidationError } from './errors.js';
import type { TenantId } from './tenant.js';

/**
 * What a flag is evaluated against. **Tenant is the unit of rollout** (ADR-0061 §1) — turning a flag
 * on for one org is the case FR-57 exists for. Deliberately not a principal: a flag that varies
 * per-user inside a tenant makes support conversations unanswerable ("it works for my colleague").
 */
export interface FlagEvaluationContext {
  readonly tenantId: TenantId;
}

/** A flag as an operator declared it. */
export interface FlagDefinition {
  /** Stable identifier, e.g. `graph.symbol-extraction`. */
  readonly key: string;
  /** What turning this on does. Shown read-only in the dashboard, so write it for an operator. */
  readonly description: string;
  /** The value for any tenant without an explicit override. */
  readonly defaultEnabled: boolean;
  /** Tenants this flag is explicitly on or off for, overriding {@link defaultEnabled}. */
  readonly tenants: Readonly<Record<TenantId, boolean>>;
}

/** How a flag resolved for one tenant, and **why** — a rollout you cannot explain is one you cannot debug. */
export interface FlagEvaluation {
  readonly key: string;
  readonly description: string;
  /** The resolved value for the evaluated tenant. */
  readonly enabled: boolean;
  /** Which rule decided it. */
  readonly source: 'default' | 'tenant-override';
}

/** Evaluates feature flags for a tenant (FR-57). */
export interface FlagProvider {
  /**
   * Resolve one flag. **An unknown key is `false`** — a flag nobody declared has not been rolled out,
   * and defaulting an unrecognized name to "on" is how a typo ships an unfinished feature.
   */
  evaluate(key: string, context: FlagEvaluationContext): boolean;
  /** Resolve every declared flag for this tenant, with the reason for each. */
  evaluateAll(context: FlagEvaluationContext): readonly FlagEvaluation[];
  /** Every declared flag, tenant-independent — the catalog, not an evaluation. */
  list(): readonly FlagDefinition[];
}

/** A flag as it is written in config, before defaults are applied. */
export interface FlagDefinitionInput {
  readonly key: string;
  readonly description?: string;
  /** Defaults to `false` — a flag you forgot to describe fully is off, never on. */
  readonly defaultEnabled?: boolean;
  readonly tenants?: Readonly<Record<TenantId, boolean>>;
}

/**
 * The static, config-backed {@link FlagProvider} (FR-57). Resolution is: an explicit entry for the
 * evaluated tenant wins; otherwise the flag's default.
 *
 * A duplicate key throws {@link ValidationError} rather than letting one declaration silently win —
 * two rules for the same flag is an operator mistake, and config mistakes should be fatal at load
 * (the process dies before serving) rather than surface as a rollout that half-happened.
 */
export function createStaticFlagProvider(
  definitions: readonly FlagDefinitionInput[] = [],
): FlagProvider {
  const byKey = new Map<string, FlagDefinition>();
  for (const input of definitions) {
    if (byKey.has(input.key)) {
      throw new ValidationError(`duplicate feature flag "${input.key}"`, {
        details: { key: input.key },
      });
    }
    byKey.set(input.key, {
      key: input.key,
      description: input.description ?? '',
      defaultEnabled: input.defaultEnabled ?? false,
      tenants: { ...input.tenants },
    });
  }
  const ordered = [...byKey.values()];

  function resolve(definition: FlagDefinition, tenantId: TenantId): FlagEvaluation {
    const override = definition.tenants[tenantId];
    return {
      key: definition.key,
      description: definition.description,
      enabled: override ?? definition.defaultEnabled,
      source: override === undefined ? 'default' : 'tenant-override',
    };
  }

  return {
    evaluate(key, context) {
      const definition = byKey.get(key);
      return definition === undefined ? false : resolve(definition, context.tenantId).enabled;
    },
    evaluateAll(context) {
      return ordered.map((definition) => resolve(definition, context.tenantId));
    },
    list() {
      return ordered;
    },
  };
}
