/** Project control-plane module (FR-66, ADR-0037): domain model, persistence port, and service. */
export {
  DEFAULT_PROJECT_NAME,
  MAX_PROJECT_NAME_LENGTH,
  defaultProjectFor,
  isDefaultProject,
  type Project,
} from './model.js';
export { createInMemoryProjectStore, type ProjectStore } from './store.js';
export { tenantProjectIds } from './enumerate.js';
export {
  createProjectService,
  type CreateProjectInput,
  type ProjectService,
  type RenameProjectInput,
} from './service.js';
