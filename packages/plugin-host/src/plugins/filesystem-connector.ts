import { createFilesystemConnector, type Connector } from '@tessera/ingestion';
import { z } from 'zod';
import type { Plugin } from '../domain.js';

const configSchema = z.object({
  root: z.string().min(1),
  ignoredDirectories: z.array(z.string().min(1)).optional(),
});

export type FilesystemConnectorConfig = z.infer<typeof configSchema>;

/**
 * First-party **connector** plugin wrapping `@tessera/ingestion`'s filesystem connector — proof that
 * first-party capabilities use the **same** Plugin SDK contract as third parties (FR-40).
 */
export const filesystemConnectorPlugin: Plugin<FilesystemConnectorConfig, Connector> = {
  manifest: {
    id: 'tessera.connector.filesystem',
    kind: 'connector',
    name: 'Filesystem connector',
    version: '0.0.0',
    configSchema,
    // It walks `config.root` and reads file bodies — and nothing else (FR-60).
    permissions: ['filesystem:read'],
  },
  setup(config, context) {
    // Asked for, not assumed: the connector cannot walk a root it was never granted read access to.
    context.permissions.require('filesystem:read');
    return {
      capability: createFilesystemConnector(
        config.ignoredDirectories === undefined
          ? { root: config.root }
          : { root: config.root, ignoredDirectories: config.ignoredDirectories },
      ),
    };
  },
};
