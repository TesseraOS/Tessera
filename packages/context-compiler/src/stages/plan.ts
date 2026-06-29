import type { CompileRequest, Need } from '../domain.js';

/**
 * Plan stage: turn a task into information needs with budget allocation (ARCHITECTURE §9). R0 emits
 * a single need for the whole task with the full budget; the interface supports multi-need
 * decomposition (and per-need budget splitting) when later strategies need it.
 */
export function planNeeds(request: CompileRequest): Need[] {
  return [{ text: request.task, budget: request.budget }];
}
