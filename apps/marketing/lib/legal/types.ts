/**
 * Legal content model (MARKETING-DESIGN §3.14, ADR-0045 v4.9 — F-067). Legal copy is
 * typed data so the honesty rule is testable: a `counsel` block is the ONLY way to
 * state an unresolved fact, and `tests/legal-content.test.ts` pins the placeholder set
 * against the tracked table in `.harness/plans/F-067-legal-pages.md`.
 */

/**
 * The closed set of counsel-review placeholders (the F-067 tracked table). A fabricated
 * fact cannot silently replace a placeholder (the pinned unit test fails), and a new
 * unknown cannot appear without widening this union deliberately.
 */
export const COUNSEL_IDS = [
  'entity',
  'address',
  'representative',
  'register-number',
  'jurisdiction',
  'contact-email',
  'dpo',
  'processors',
  'retention',
  'transfers',
  'supervisory-authority',
  'oss-license',
  'payments',
  'rights-phrasing',
] as const;

export type CounselId = (typeof COUNSEL_IDS)[number];

export type LegalBlock =
  | { kind: 'heading'; level: 2 | 3; id: string; text: string }
  /** `text` may carry inline same-site links as `[label](/path)` — resolved by LegalArticle. */
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered?: boolean; items: readonly string[] }
  | {
      kind: 'table';
      caption: string;
      head: readonly string[];
      rows: readonly (readonly string[])[];
    }
  /** The ONLY way to state an unresolved fact — renders as the CounselReview callout. */
  | { kind: 'counsel'; id: CounselId; summary: string; detail: string };

export interface LegalDoc {
  slug: 'privacy' | 'terms' | 'cookies' | 'imprint';
  eyebrow: string;
  title: string;
  lead: string;
  /** Real ISO revision date (YYYY-MM-DD) — never a future "effective" claim. */
  updated: string;
  blocks: readonly LegalBlock[];
}
