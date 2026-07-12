import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cookiesDoc } from '../lib/legal/cookies';
import { imprintDoc } from '../lib/legal/imprint';
import { privacyDoc } from '../lib/legal/privacy';
import { termsDoc } from '../lib/legal/terms';
import { COUNSEL_IDS } from '../lib/legal/types';
import type { CounselId, LegalBlock, LegalDoc } from '../lib/legal/types';

/**
 * LEGAL-CONTENT PROOF (F-067, plan: .harness/plans/F-067-legal-pages.md).
 *
 * The honesty rule made executable: every unresolved legal fact must render as a
 * counsel placeholder (pinned per doc AND as a union against the plan's tracked
 * table), and no fabricated fact may appear anywhere in the copy (tripwires). Because
 * design-lint's hype/exclamation patterns scan .tsx only, this suite re-applies the
 * manifest's regexes to lib/legal/*.ts — coverage extended, no contract weakened.
 */

const DOCS: readonly LegalDoc[] = [privacyDoc, termsDoc, cookiesDoc, imprintDoc];

/** The tracked counsel-review table from the F-067 plan — pinned exactly, per doc. */
const EXPECTED_PLACEHOLDERS: Record<LegalDoc['slug'], readonly CounselId[]> = {
  privacy: [
    'entity',
    'address',
    'contact-email',
    'retention',
    'processors',
    'transfers',
    'rights-phrasing',
    'dpo',
    'supervisory-authority',
  ],
  terms: ['entity', 'payments', 'jurisdiction', 'oss-license'],
  cookies: ['contact-email'],
  imprint: [
    'entity',
    'representative',
    'address',
    'register-number',
    'contact-email',
    'jurisdiction',
  ],
};

const counselBlocks = (doc: LegalDoc) =>
  doc.blocks.filter((block): block is Extract<LegalBlock, { kind: 'counsel' }> => {
    return block.kind === 'counsel';
  });

/** Every human-readable string in a doc (counsel text included — it must be clean too). */
function allText(doc: LegalDoc): string[] {
  const texts: string[] = [doc.eyebrow, doc.title, doc.lead];
  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'heading':
        texts.push(block.text);
        break;
      case 'paragraph':
        texts.push(block.text);
        break;
      case 'list':
        texts.push(...block.items);
        break;
      case 'table':
        texts.push(block.caption, ...block.head, ...block.rows.flat());
        break;
      case 'counsel':
        texts.push(block.summary, block.detail);
        break;
    }
  }
  return texts;
}

describe('legal content: counsel-review placeholder pinning', () => {
  for (const doc of DOCS) {
    it(`${doc.slug} carries exactly the tracked placeholder set`, () => {
      const actual = new Set(counselBlocks(doc).map((block) => block.id));
      expect([...actual].sort()).toEqual([...new Set(EXPECTED_PLACEHOLDERS[doc.slug])].sort());
    });
  }

  it('the union across all docs equals the closed CounselId set (nothing dropped, nothing new)', () => {
    const union = new Set(DOCS.flatMap((doc) => counselBlocks(doc).map((block) => block.id)));
    expect([...union].sort()).toEqual([...COUNSEL_IDS].sort());
  });
});

describe('legal content: fabrication tripwires (no invented legal facts, anywhere)', () => {
  const TRIPWIRES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: 'entity suffix (no entity exists)', pattern: /\b(?:GmbH|LLC|Ltd)\b|\bInc\./ },
    {
      name: 'register-number / street shape (no registration exists)',
      pattern: /\bHRB ?\d|\b\d{1,4} [A-Z][a-z]+ (?:Street|St\.|Avenue|Ave\.|Road|Rd\.)/,
    },
    { name: 'email address (no mailbox exists)', pattern: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
    {
      name: 'hardcoded tessera domain (TLD undecided)',
      pattern: /tessera\.(?:dev|com|io|ai|app)/i,
    },
    {
      name: 'compliance claim (none exists)',
      pattern: /SOC ?2|ISO ?27001|GDPR[- ]compliant/i,
    },
  ];

  for (const doc of DOCS) {
    for (const tripwire of TRIPWIRES) {
      it(`${doc.slug} contains no ${tripwire.name}`, () => {
        const hits = allText(doc).filter((text) => tripwire.pattern.test(text));
        expect(hits).toEqual([]);
      });
    }
  }
});

describe('legal content: structure', () => {
  for (const doc of DOCS) {
    it(`${doc.slug} eyebrow follows the archetype (§3.14)`, () => {
      expect(doc.eyebrow).toBe(`legal — ${doc.slug}`);
    });

    it(`${doc.slug} title respects the ≤8-word headline rule`, () => {
      expect(doc.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    });

    it(`${doc.slug} lead stays inside the ≤56ch measure discipline (≤3 lines)`, () => {
      expect(doc.lead.length).toBeLessThanOrEqual(3 * 56);
    });

    it(`${doc.slug} opens with a level-2 heading`, () => {
      const first = doc.blocks[0];
      expect(first?.kind).toBe('heading');
      expect(first?.kind === 'heading' ? first.level : undefined).toBe(2);
    });

    it(`${doc.slug} heading ids are unique and levels never skip`, () => {
      const headings = doc.blocks.filter(
        (block): block is Extract<LegalBlock, { kind: 'heading' }> => block.kind === 'heading',
      );
      const ids = headings.map((heading) => heading.id);
      expect(new Set(ids).size).toBe(ids.length);

      let seenLevelTwo = false;
      for (const heading of headings) {
        if (heading.level === 2) seenLevelTwo = true;
        else expect(seenLevelTwo, `h3 "${heading.id}" appears before any h2`).toBe(true);
      }
    });

    it(`${doc.slug} table rows match their head width`, () => {
      for (const block of doc.blocks) {
        if (block.kind !== 'table') continue;
        expect(block.caption.length).toBeGreaterThan(0);
        for (const row of block.rows) {
          expect(row.length).toBe(block.head.length);
        }
      }
    });

    it(`${doc.slug} updated is a real ISO date, not in the future`, () => {
      expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const updated = new Date(`${doc.updated}T00:00:00Z`);
      expect(Number.isNaN(updated.getTime())).toBe(false);
      expect(updated.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it(`${doc.slug} inline links are same-site root-relative paths`, () => {
      for (const text of allText(doc)) {
        for (const match of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
          expect(match[2], `link "${match[0]}" must be root-relative`).toMatch(/^\//);
        }
      }
    });
  }
});

describe('legal content: voice (manifest regexes extended to lib/legal/*.ts)', () => {
  interface BannedPattern {
    id: string;
    pattern: string;
    flags?: string;
  }

  const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(
    readFileSync(
      join(APP_ROOT, '..', '..', 'docs', 'design', 'marketing-design.manifest.json'),
      'utf8',
    ),
  ) as { enforcement: { bannedPatterns: BannedPattern[] } };

  const LEGAL_DIR = join(APP_ROOT, 'lib', 'legal');
  const legalFiles = readdirSync(LEGAL_DIR)
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => ({
      path: `lib/legal/${entry}`,
      content: readFileSync(join(LEGAL_DIR, entry), 'utf8'),
    }));

  it('scans a non-empty legal content tree', () => {
    expect(legalFiles.length).toBeGreaterThanOrEqual(5);
  });

  for (const id of ['hype-vocabulary', 'exclamation-in-copy'] as const) {
    it(`${id} holds for legal copy (design-lint scans .tsx only — same regex, wider net)`, () => {
      const banned = manifest.enforcement.bannedPatterns.find((pattern) => pattern.id === id);
      expect(banned, `manifest pattern ${id} must exist`).toBeDefined();
      if (!banned) return;
      const regex = new RegExp(banned.pattern, banned.flags ?? '');
      const violations: string[] = [];
      for (const file of legalFiles) {
        file.content.split('\n').forEach((line, index) => {
          if (regex.test(line)) violations.push(`${file.path}:${index + 1}  ${line.trim()}`);
        });
      }
      expect(violations).toEqual([]);
    });
  }
});
