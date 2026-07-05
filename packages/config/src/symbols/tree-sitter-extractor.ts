import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import type { ExtractedImport, ExtractedSymbol, SymbolExtractor } from '@tessera/ingestion';
import { Language, Parser, Query } from 'web-tree-sitter';

const require = createRequire(import.meta.url);

/** The grammars we ship (TS/JS first-class, ADR-0041). Others fall through to `undefined` (skipped). */
type LangName = 'typescript' | 'tsx' | 'javascript';

const EXT_TO_LANG: Readonly<Record<string, LangName>> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

const WASM_FILE: Readonly<Record<LangName, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
};

/** tree-sitter query capturing imports + top-level declarations (TS grammar — also drives tsx). */
const TS_QUERY = `
  (import_statement source: (string) @import)
  (export_statement source: (string) @import)
  (function_declaration name: (identifier) @symbol.function)
  (class_declaration name: (_) @symbol.class)
  (interface_declaration name: (_) @symbol.interface)
  (type_alias_declaration name: (_) @symbol.type)
  (enum_declaration name: (_) @symbol.enum)
  (export_statement (lexical_declaration (variable_declarator name: (identifier) @symbol.const)))
`;

/** JS grammar variant (no interface/type/enum; class name is a plain identifier). */
const JS_QUERY = `
  (import_statement source: (string) @import)
  (export_statement source: (string) @import)
  (function_declaration name: (identifier) @symbol.function)
  (class_declaration name: (_) @symbol.class)
  (export_statement (lexical_declaration (variable_declarator name: (identifier) @symbol.const)))
`;

/** Resolve a prebuilt grammar `.wasm` from the installed `tree-sitter-wasms` package. */
function grammarPath(lang: LangName): string {
  const pkg = require.resolve('tree-sitter-wasms/package.json');
  return join(dirname(pkg), 'out', WASM_FILE[lang]);
}

/** Strip the surrounding quote characters from a string-literal node's text. */
function stripQuotes(text: string): string {
  return text.replace(/^['"`]/, '').replace(/['"`]$/, '');
}

interface CompiledLanguage {
  readonly parser: Parser;
  readonly query: Query;
}

/**
 * Code-symbol {@link SymbolExtractor} backed by **tree-sitter (WASM)** — TS/JS first (ADR-0041, resolves
 * OQ5). Parses a source file and captures its imports + top-level declarations (functions/classes/
 * interfaces/types/enums/exported consts) via a tree-sitter query; the graph-extraction sink turns these
 * into `file`/`symbol` nodes + `imports` edges. The parser + grammars load lazily and are cached; parsing
 * is fully offline (prebuilt grammar assets). Unsupported extensions / binary / empty documents → skip.
 */
export function createTreeSitterSymbolExtractor(): SymbolExtractor {
  const cache = new Map<LangName, CompiledLanguage>();
  let initialized: Promise<void> | undefined;

  async function compiledFor(lang: LangName): Promise<CompiledLanguage> {
    const existing = cache.get(lang);
    if (existing !== undefined) return existing;
    initialized ??= Parser.init();
    await initialized;
    const language = await Language.load(grammarPath(lang));
    const parser = new Parser();
    parser.setLanguage(language);
    const query = new Query(language, lang === 'javascript' ? JS_QUERY : TS_QUERY);
    const compiled: CompiledLanguage = { parser, query };
    cache.set(lang, compiled);
    return compiled;
  }

  return {
    async extract(document) {
      const lang = EXT_TO_LANG[extname(document.path).toLowerCase()];
      if (lang === undefined || document.kind === 'binary' || document.text.length === 0) {
        return undefined;
      }
      const { parser, query } = await compiledFor(lang);
      const tree = parser.parse(document.text);
      if (tree === null) return undefined;
      try {
        const symbols: ExtractedSymbol[] = [];
        const imports: ExtractedImport[] = [];
        const seenSymbol = new Set<string>();
        const seenImport = new Set<string>();
        for (const capture of query.captures(tree.rootNode)) {
          if (capture.name === 'import') {
            const specifier = stripQuotes(capture.node.text);
            if (specifier.length > 0 && !seenImport.has(specifier)) {
              seenImport.add(specifier);
              imports.push({ specifier });
            }
          } else if (capture.name.startsWith('symbol.')) {
            const name = capture.node.text;
            const kind = capture.name.slice('symbol.'.length);
            const dedupe = `${kind}:${name}`;
            if (name.length > 0 && !seenSymbol.has(dedupe)) {
              seenSymbol.add(dedupe);
              symbols.push({ name, kind });
            }
          }
        }
        return { symbols, imports };
      } finally {
        tree.delete();
      }
    },
  };
}
