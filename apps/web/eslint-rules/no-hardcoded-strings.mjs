/**
 * `no-hardcoded-strings` — user-facing copy must come from the i18n catalog (F-064; NFR-14).
 *
 * Flags two things a user reads:
 *   1. JSX **text nodes** — `<p>Nothing matched</p>`
 *   2. JSX **string attributes** on a curated list of props that render as copy (`title`,
 *      `placeholder`, `aria-label`, …)
 *
 * **Everything else is deliberately out of scope**, because the failure mode of a noisy lint rule is
 * that someone disables it — at which point it protects nothing. So it does not look at object
 * literals, template strings, `const` copy tables, or props it does not recognise; a rule that
 * guessed at those would fire on class names, ids, and test hooks constantly.
 *
 * The `allow` option carries files not yet migrated. An enumerated allowlist rather than a blanket
 * "warn": it keeps the remaining work countable and stops the list growing, which is the property
 * that matters while a migration is in flight.
 */

/** Props whose string value is rendered to, or announced at, a user. */
const COPY_PROPS = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'description',
  'label',
  'okLabel',
  'badLabel',
  'placeholder',
  'title',
]);

/** Text that is punctuation, an entity, or a lone symbol is not copy anyone translates. */
function isCopy(raw) {
  const text = raw.trim();
  if (text.length < 2) return false;
  // Needs at least two consecutive letters — filters '—', '·', '1,234', 'v2', ':'.
  return /\p{L}\p{L}/u.test(text);
}

/** Repo-relative, forward-slashed, so allowlist entries read the same on every platform. */
function relativePath(filename, cwd) {
  return filename.startsWith(cwd) ? filename.slice(cwd.length + 1).replaceAll('\\', '/') : filename;
}

export const noHardcodedStrings = {
  meta: {
    type: 'problem',
    docs: { description: 'User-facing strings must come from the i18n catalog (NFR-14).' },
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
    messages: {
      text: 'Hardcoded user-facing text "{{text}}". Move it to lib/i18n and use t().',
      attribute: 'Hardcoded user-facing `{{name}}` copy. Move it to lib/i18n and use t().',
    },
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);
    const file = relativePath(context.filename, context.cwd);
    if (allow.has(file)) return {};

    return {
      JSXText(node) {
        if (!isCopy(node.value)) return;
        context.report({
          node,
          messageId: 'text',
          data: { text: node.value.trim().slice(0, 40) },
        });
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        const name = node.name.name;
        if (!COPY_PROPS.has(name)) return;
        if (node.value?.type !== 'Literal' || typeof node.value.value !== 'string') return;
        if (!isCopy(node.value.value)) return;
        context.report({ node, messageId: 'attribute', data: { name } });
      },
    };
  },
};

export default { rules: { 'no-hardcoded-strings': noHardcodedStrings } };
