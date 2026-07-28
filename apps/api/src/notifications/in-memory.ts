import { DEFAULT_TENANT_ID, type TenantId } from '@tessera/core';
import {
  EMPTY_READ_STATE,
  withAllRead,
  withPreferenceDefaults,
  withRead,
  type NotificationKind,
  type NotificationPreferences,
  type NotificationReadState,
} from './model.js';
import type { NotificationStore } from './port.js';

/** One principal's row: read state (with the touch time retention uses) and stored preferences. */
interface Entry {
  readState: NotificationReadState;
  /** When `readState` last changed — the only thing {@link NotificationStore.prune} ages out. */
  readStateUpdatedAt: number;
  /** **Partial** on purpose: only what was explicitly set, so a new kind defaults rather than mutes. */
  preferences: Partial<Record<NotificationKind, boolean>>;
  /** Whether preferences were ever set — distinguishes "chose the defaults" from "never asked". */
  hasPreferences: boolean;
}

function emptyEntry(): Entry {
  return {
    readState: EMPTY_READ_STATE,
    readStateUpdatedAt: 0,
    preferences: {},
    hasPreferences: false,
  };
}

/**
 * In-memory {@link NotificationStore} — the reference adapter the conformance suite runs against, and
 * the default when a deployment wires no persistent one (behaviour is identical; it simply forgets
 * on restart, which for read marks means re-showing rows rather than losing data).
 *
 * State is held per tenant, then per principal, so both isolation guarantees are structural rather
 * than a filter someone has to remember to apply.
 */
export function createInMemoryNotificationStore(): NotificationStore {
  const byTenant = new Map<TenantId, Map<string, Entry>>();

  function principalsFor(tenantId: TenantId): Map<string, Entry> {
    let principals = byTenant.get(tenantId);
    if (principals === undefined) {
      principals = new Map();
      byTenant.set(tenantId, principals);
    }
    return principals;
  }

  function storeFor(tenantId: TenantId): NotificationStore {
    const principals = principalsFor(tenantId);

    function entryFor(principalId: string): Entry {
      let entry = principals.get(principalId);
      if (entry === undefined) {
        entry = emptyEntry();
        principals.set(principalId, entry);
      }
      return entry;
    }

    return {
      readState(principalId) {
        return Promise.resolve(principals.get(principalId)?.readState ?? EMPTY_READ_STATE);
      },

      markRead(principalId, ids) {
        const entry = entryFor(principalId);
        let next = entry.readState;
        for (const id of ids) next = withRead(next, id);
        entry.readState = next;
        entry.readStateUpdatedAt = Date.now();
        return Promise.resolve(next);
      },

      markAllRead(principalId, at) {
        const entry = entryFor(principalId);
        entry.readState = withAllRead(entry.readState, at);
        entry.readStateUpdatedAt = Date.now();
        return Promise.resolve(entry.readState);
      },

      preferences(principalId) {
        const entry = principals.get(principalId);
        return Promise.resolve(
          withPreferenceDefaults(entry?.hasPreferences === true ? entry.preferences : undefined),
        );
      },

      setPreferences(principalId, update) {
        const entry = entryFor(principalId);
        // Merged, not replaced: a client that predates a kind must not mute it by omission.
        entry.preferences = { ...entry.preferences, ...update };
        entry.hasPreferences = true;
        return Promise.resolve(withPreferenceDefaults(entry.preferences));
      },

      forget(principalId) {
        principals.delete(principalId);
        return Promise.resolve();
      },

      prune(policy) {
        if (policy.readStateMaxAgeMs === undefined) return Promise.resolve(0);
        const cutoff = Date.now() - policy.readStateMaxAgeMs;
        let pruned = 0;
        for (const [principalId, entry] of principals) {
          if (entry.readStateUpdatedAt >= cutoff) continue;
          if (entry.readState === EMPTY_READ_STATE) continue;
          entry.readState = EMPTY_READ_STATE;
          entry.readStateUpdatedAt = 0;
          pruned += 1;
          // The row survives when it still carries preferences — those are a setting, not an event,
          // and reverting one because somebody was away is how a muted alert starts firing again.
          if (!entry.hasPreferences) principals.delete(principalId);
        }
        return Promise.resolve(pruned);
      },

      forTenant(next) {
        return storeFor(next);
      },
    };
  }

  return storeFor(DEFAULT_TENANT_ID);
}

/** Re-exported so a caller building an update has the kind union to hand. */
export type { NotificationKind, NotificationPreferences };
