import { messages, type MessageKey } from './en';

export { messages, type MessageKey };

/** Values substitutable into a message's `{placeholder}` slots. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** Matches `{name}` placeholders. Deliberately narrow: no formatting, no nesting, no expressions. */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Resolve a message (F-064; NFR-14).
 *
 * `key` is typed as {@link MessageKey}, so a typo is a build error rather than a blank in the UI —
 * which is the main thing externalising strings can get wrong. There is no fallback-to-key behaviour
 * for the same reason: a fallback turns a missing message into something that *looks* shipped.
 *
 * Interpolation is `{name}` substitution and nothing more. Plurals, dates, numbers and gendered
 * forms are what an ICU runtime is for, and NFR-14 asks for readiness rather than a translation
 * stack; `lib/format.ts` already owns locale-aware number and date formatting. An unmatched
 * placeholder is left verbatim so it is visible in review instead of silently emptying.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template: string = messages[key];
  if (params === undefined) return template;
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
