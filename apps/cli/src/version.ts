/**
 * The CLI's reported version. A constant (matching every sibling package at `0.0.0`) until the npm
 * publish pipeline (F-059) sources it from `package.json` at build time. Kept in one place so
 * `--version` and any future `mcp-config` `npx @tessera/cli@<version>` pin agree.
 */
export const CLI_VERSION = '0.0.0';
