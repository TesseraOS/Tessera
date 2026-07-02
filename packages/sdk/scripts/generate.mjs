import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { buildServer } from '@tessera/api';

/**
 * Regenerate the SDK's types from the live `/v1` OpenAPI document (FR-39). Boots the API (the doc is
 * built from the static route schemas — handlers never run, so an empty services object suffices),
 * captures `app.swagger()`, writes the spec, and emits the typed `paths` via openapi-typescript.
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const app = buildServer({});
await app.ready();
const document = app.swagger();
await app.close();

await writeFile(join(packageRoot, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);

const ast = await openapiTS(document);
const header =
  '/* eslint-disable */\n' +
  '// AUTO-GENERATED from the /v1 OpenAPI document. Do not edit by hand.\n' +
  '// Regenerate with: pnpm --filter @tessera/sdk generate\n\n';
await mkdir(join(packageRoot, 'src', 'generated'), { recursive: true });
await writeFile(join(packageRoot, 'src', 'generated', 'schema.ts'), header + astToString(ast));

console.log('Generated openapi.json + src/generated/schema.ts');
