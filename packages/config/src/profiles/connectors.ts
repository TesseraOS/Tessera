import { ValidationError } from '@tessera/core';
import {
  createFilesystemConnector,
  createGitConnector,
  type Connector,
  type SourceRecord,
} from '@tessera/ingestion';

/**
 * The connector kinds a source can be built from (FR-6/FR-7).
 *
 * Profile-independent: which connectors exist is a product fact, not a deployment one — a git repo is
 * scanned the same way whether the index behind it is SQLite or Postgres.
 */
export const SUPPORTED_SOURCE_KINDS = ['filesystem', 'git'] as const;

/** Build the connector for a registered source; throws for an unsupported kind or a missing root. */
export function connectorForRecord(record: SourceRecord): Connector {
  const root = record.config['root'];
  if (typeof root !== 'string' || root.length === 0) {
    throw new ValidationError('source config.root must be a non-empty string', {
      details: { kind: record.kind },
    });
  }
  switch (record.kind) {
    case 'filesystem':
      return createFilesystemConnector({ root });
    case 'git':
      return createGitConnector({ root });
    default:
      throw new ValidationError(`unsupported source kind "${record.kind}"`, {
        details: { kind: record.kind, supported: SUPPORTED_SOURCE_KINDS },
      });
  }
}
