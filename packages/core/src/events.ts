/** A map of event name → payload type. Define one per domain to get a typed bus. */
export type EventMap = Record<string, unknown>;

/** An event handler; may be sync or async. */
export type EventHandler<T> = (payload: T) => void | Promise<void>;

export interface EventBus<TEvents extends EventMap> {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof TEvents>(type: K, handler: EventHandler<TEvents[K]>): () => void;
  /** Unsubscribe a previously-registered handler. */
  off<K extends keyof TEvents>(type: K, handler: EventHandler<TEvents[K]>): void;
  /** Emit an event; resolves once all handlers (run concurrently) have settled. */
  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): Promise<void>;
}

/**
 * Create an in-process, typed event bus. Local-mode default; a distributed transport can
 * implement the same interface later (ports & adapters).
 */
export function createEventBus<TEvents extends EventMap>(): EventBus<TEvents> {
  // Handlers are stored under an erased payload type; the public methods are the type-safe edge,
  // so the two casts below are localized and sound.
  type AnyHandler = EventHandler<TEvents[keyof TEvents]>;
  const handlers = new Map<keyof TEvents, Set<AnyHandler>>();

  function off<K extends keyof TEvents>(type: K, handler: EventHandler<TEvents[K]>): void {
    handlers.get(type)?.delete(handler as AnyHandler);
  }

  return {
    on(type, handler) {
      let set = handlers.get(type);
      if (set === undefined) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as AnyHandler);
      return () => {
        off(type, handler);
      };
    },
    off,
    async emit(type, payload) {
      const set = handlers.get(type);
      if (set === undefined || set.size === 0) return;
      await Promise.all([...set].map((handler) => handler(payload as TEvents[keyof TEvents])));
    },
  };
}
