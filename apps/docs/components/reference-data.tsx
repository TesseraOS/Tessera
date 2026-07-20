import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import cliReference from '@/generated/cli-reference.json';
import envReference from '@/generated/env-reference.json';
import mcpTools from '@/generated/mcp-tools.json';

/**
 * Server components rendering the reference sections FROM the generated, drift-gated
 * artifacts (ADR-0054 §4) — the MCP tool catalog, the CLI command list, and the
 * environment-variable reference. No fact on these pages is hand-copied.
 */

// --- JSON-schema flattening (MCP tool inputs) ----------------------------------------------------

interface SchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  additionalProperties?: SchemaNode | boolean;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

interface FlatParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

function typeLabel(schema: SchemaNode): string {
  if (schema.enum !== undefined) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const base = Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'unknown');
  if (base === 'array') return `${schema.items ? typeLabel(schema.items) : 'unknown'}[]`;
  return base;
}

function constraintNotes(schema: SchemaNode): string {
  const notes: string[] = [];
  if (schema.minLength !== undefined) notes.push(`min length ${schema.minLength}`);
  if (schema.maxLength !== undefined) notes.push(`max length ${schema.maxLength}`);
  if (schema.minimum !== undefined) notes.push(`min ${schema.minimum}`);
  if (schema.maximum !== undefined) notes.push(`max ${schema.maximum}`);
  if (schema.default !== undefined) notes.push(`default ${JSON.stringify(schema.default)}`);
  return notes.join(', ');
}

/** Flatten object properties into dotted rows, two levels deep — enough for every tool. */
function flattenParams(schema: SchemaNode, prefix = '', depth = 0): FlatParam[] {
  if (schema.properties === undefined || depth > 2) return [];
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).flatMap(([key, child]) => {
    const name = prefix === '' ? key : `${prefix}.${key}`;
    const notes = constraintNotes(child);
    const row: FlatParam = {
      name,
      type: typeLabel(child),
      required: prefix === '' && required.has(key),
      description: [child.description, notes === '' ? undefined : `(${notes})`]
        .filter(Boolean)
        .join(' '),
    };
    const children =
      child.type === 'object' || child.properties !== undefined
        ? flattenParams(child, name, depth + 1)
        : child.type === 'array' && child.items?.properties !== undefined
          ? flattenParams(child.items, `${name}[]`, depth + 1)
          : [];
    return [row, ...children];
  });
}

function ParamTable({ schema }: { schema: SchemaNode }) {
  const rows = flattenParams(schema);
  if (rows.length === 0) return <p>This tool takes no arguments.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Required</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>
              <code>{row.type}</code>
            </td>
            <td>{row.required ? 'yes' : 'no'}</td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The full MCP tool catalog — 1 heading + description + parameter table per tool. */
export function McpToolCatalog() {
  return (
    <>
      {mcpTools.tools.map((tool) => (
        <section key={tool.name}>
          <h2 id={tool.name}>
            <code>{tool.name}</code>
          </h2>
          <p>{tool.description}</p>
          <ParamTable schema={tool.inputSchema as SchemaNode} />
        </section>
      ))}
    </>
  );
}

/** Tool count, so prose never hand-copies the number. */
export function McpToolCount() {
  return <>{mcpTools.toolCount}</>;
}

// --- CLI reference -------------------------------------------------------------------------------

/** Every `tessera` command: summary + full usage text, from the CLI's own table. */
export function CliReference() {
  return (
    <>
      {cliReference.commands.map((command) => (
        <section key={command.name}>
          <h2 id={command.name}>
            <code>
              {cliReference.bin} {command.name}
            </code>
          </h2>
          <p>{command.summary}</p>
          <DynamicCodeBlock lang="text" code={command.usage} />
        </section>
      ))}
    </>
  );
}

// --- Environment reference -----------------------------------------------------------------------

/** Every documented environment variable, grouped by .env.example section. */
export function EnvReference() {
  return (
    <>
      {envReference.sections.map((section) => (
        <section key={section.section}>
          <h2>{section.section}</h2>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Default</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {section.vars.map(
                (variable: {
                  name: string;
                  default: string;
                  optional: boolean;
                  note?: string;
                  description?: string;
                }) => (
                  <tr key={variable.name}>
                    <td>
                      <code>{variable.name}</code>
                    </td>
                    <td>{variable.default === '' ? '—' : <code>{variable.default}</code>}</td>
                    <td>
                      {[variable.description, variable.note].filter(Boolean).join(' — ') ||
                        (variable.optional ? 'Optional.' : '')}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
