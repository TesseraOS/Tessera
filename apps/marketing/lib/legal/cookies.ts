import type { LegalDoc } from './types';

/**
 * /legal/cookies — the executable one (F-067): every claim here is asserted by
 * tests/e2e/legal.spec.ts against the production build. Verified against the installed
 * next-themes 0.4.6 source: initialization only READS localStorage; the `theme` key is
 * written exclusively by setTheme — i.e. when the visitor uses the footer toggle. Word
 * changes here must keep the e2e truth test green.
 */
export const cookiesDoc: LegalDoc = {
  slug: 'cookies',
  eyebrow: 'legal — cookies',
  title: 'Cookie policy',
  lead: 'This site sets no cookies. One localStorage entry stores your theme choice if you set one, and every request stays on this site’s own origin.',
  updated: '2026-07-12',
  blocks: [
    { kind: 'heading', level: 2, id: 'no-cookies', text: 'No cookies' },
    {
      kind: 'paragraph',
      text: 'This website sets no cookies — first-party or third-party. There is no consent banner because there is nothing to consent to: no advertising cookies, no analytics cookies, no session cookies. You can verify this in your browser’s developer tools; the cookie store for this site stays empty.',
    },
    {
      kind: 'heading',
      level: 2,
      id: 'browser-storage',
      text: 'What this site stores in your browser',
    },
    {
      kind: 'paragraph',
      text: 'The footer has a theme toggle (dusk / noon). On first load nothing is written: the site follows your system’s color-scheme preference and stores nothing. Only when you pick a theme with the toggle does the site write a single localStorage entry, so your choice survives the next visit.',
    },
    {
      kind: 'table',
      caption: 'Browser storage used by this site',
      head: ['Key', 'Type', 'Written', 'Purpose'],
      rows: [
        [
          'theme',
          'localStorage',
          'Only when you use the footer theme toggle',
          'Remembers whether you chose the dusk or noon theme',
        ],
      ],
    },
    { kind: 'heading', level: 2, id: 'third-party', text: 'Third-party requests' },
    {
      kind: 'paragraph',
      text: 'This site makes no third-party requests. Fonts are self-hosted, there are no analytics or advertising scripts, no embedded players, and no cross-origin frames. Every request your browser makes for this page goes to the same origin that served it.',
    },
    { kind: 'heading', level: 2, id: 'clearing', text: 'Clearing the stored preference' },
    {
      kind: 'list',
      items: [
        'Clear this site’s data in your browser settings (usually under privacy or site settings), or',
        'Remove the theme entry from localStorage in your browser’s developer tools',
      ],
    },
    {
      kind: 'paragraph',
      text: 'After clearing, the site returns to following your system preference.',
    },
    { kind: 'heading', level: 2, id: 'scope', text: 'Scope' },
    {
      kind: 'paragraph',
      text: 'This notice covers the marketing website only. The dashboard and documentation surfaces are separate applications and carry their own notices.',
    },
    { kind: 'heading', level: 2, id: 'questions', text: 'Questions' },
    {
      kind: 'counsel',
      id: 'contact-email',
      summary: 'Contact channel',
      detail:
        'A monitored contact mailbox does not exist yet — the operating domain is undecided. A contact channel for questions about this notice will be published here before launch.',
    },
  ],
};
