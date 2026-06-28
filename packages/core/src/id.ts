import { randomUUID } from 'node:crypto';

/**
 * A branded id string. The `Brand` phantom type distinguishes id kinds at compile time
 * (e.g. `Id<'Memory'>` is not assignable to `Id<'Node'>`) without runtime cost.
 */
export type Id<Brand extends string = string> = string & { readonly __brand: Brand };

/** Create a new unique id (UUID v4), optionally branded for a specific entity kind. */
export function newId<Brand extends string = string>(): Id<Brand> {
  return randomUUID() as Id<Brand>;
}

/** Type guard: a usable id is a non-empty string. */
export function isId(value: unknown): value is Id {
  return typeof value === 'string' && value.length > 0;
}
