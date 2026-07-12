import type { LegalDoc } from './types';

/**
 * /legal/privacy — GDPR/CCPA-aware structure over real facts only (F-067). Present
 * tense is reserved for shipped architecture (static site, local/self-hosted engine);
 * everything cloud-operational is future tense; every unresolved fact is a counsel
 * block. The placeholder set is pinned by tests/legal-content.test.ts.
 */
export const privacyDoc: LegalDoc = {
  slug: 'privacy',
  eyebrow: 'legal — privacy',
  title: 'Privacy policy',
  lead: 'What this website and the product process, what they do not, and the rights you have — unresolved facts are marked for counsel review.',
  updated: '2026-07-12',
  blocks: [
    { kind: 'heading', level: 2, id: 'who-we-are', text: 'Who we are' },
    {
      kind: 'paragraph',
      text: 'Tessera is a context and memory system for AI coding agents. This policy covers the Tessera marketing website — the site you are reading — and, where explicitly noted, the product itself. It is a draft: every section marked “pending counsel review” requires sign-off before this policy governs a live service.',
    },
    {
      kind: 'counsel',
      id: 'entity',
      summary: 'Operating legal entity (the controller)',
      detail:
        'The legal entity that operates Tessera — its name and corporate form — has not been finalized. This section will identify the data controller once incorporation details are confirmed by counsel.',
    },
    {
      kind: 'counsel',
      id: 'address',
      summary: 'Registered address',
      detail:
        'A registered business address will be published here once the operating entity is established.',
    },
    {
      kind: 'counsel',
      id: 'contact-email',
      summary: 'Privacy contact',
      detail:
        'A dedicated privacy mailbox does not exist yet — the operating domain itself is undecided. A monitored contact channel will be published here before launch.',
    },
    { kind: 'heading', level: 2, id: 'scope', text: 'Scope' },
    {
      kind: 'paragraph',
      text: 'This policy describes the marketing site as it ships today, plus structural facts about how the product handles data. The managed cloud service is not generally available; before it launches, this policy will be revised and re-dated to cover its operation in full.',
    },
    { kind: 'heading', level: 2, id: 'website-data', text: 'Data on this website' },
    {
      kind: 'paragraph',
      text: 'This site is statically generated. It has no accounts, no forms, no comment fields, and no analytics, and it sets no cookies — the [cookie policy](/legal/cookies) covers browser storage in detail. Fonts and every other asset are served from the site’s own origin; no request leaves for a third party.',
    },
    {
      kind: 'table',
      caption: 'Data categories on the marketing site',
      head: ['Category', 'On this site'],
      rows: [
        ['Account or profile data', 'None — no accounts exist on this surface'],
        ['Form submissions', 'None — the site has no forms'],
        [
          'Cookies and similar storage',
          'No cookies; one optional localStorage entry for your theme choice',
        ],
        ['Analytics and tracking', 'None — no third-party scripts load'],
        [
          'Server logs',
          'Standard request logs at whichever provider hosts the site (see processors below)',
        ],
      ],
    },
    {
      kind: 'paragraph',
      text: 'Like any website served over the public internet, this one is delivered by hosting infrastructure that necessarily receives the requests your browser makes — typically the requesting IP address, user agent, and requested URL, held as operational server logs.',
    },
    { kind: 'heading', level: 2, id: 'product-data', text: 'Data in the product' },
    {
      kind: 'heading',
      level: 3,
      id: 'local-self-hosted',
      text: 'Local and self-hosted deployments',
    },
    {
      kind: 'paragraph',
      text: 'In the local and self-hosted profiles, the engine — ingestion, memory, the knowledge graph, and the context compiler — runs entirely inside your own deployment. Your repositories, decisions, and memory are stored and processed there; they are not transmitted to us. Secret patterns are scrubbed before content persists, and reads and writes of context are recorded in your deployment’s own audit trail.',
    },
    { kind: 'heading', level: 3, id: 'managed-cloud', text: 'Managed cloud' },
    {
      kind: 'paragraph',
      text: 'The managed cloud is not generally available. When it launches, it will process account data, billing data, and the content that workspaces choose to host there — under terms, notices, and retention schedules published before launch.',
    },
    {
      kind: 'counsel',
      id: 'retention',
      summary: 'Managed-cloud retention schedules',
      detail:
        'Retention periods for managed-cloud data will be defined and published before the cloud service becomes generally available.',
    },
    { kind: 'heading', level: 2, id: 'purposes', text: 'Purposes and legal bases' },
    {
      kind: 'paragraph',
      text: 'For the marketing site, the only processing is what serving a website requires: responding to your browser’s requests and keeping the service secure and available. We understand this to rest on a legitimate interest in operating a public website; the full legal-basis analysis — for this site and for the future cloud service — is part of the counsel review noted throughout this page.',
    },
    { kind: 'heading', level: 2, id: 'processors', text: 'Processors and subprocessors' },
    {
      kind: 'counsel',
      id: 'processors',
      summary: 'Processor and subprocessor list',
      detail:
        'The list of processors — including the provider that hosts this website — and their roles and retention terms will be published here once contracts are in place and reviewed by counsel.',
    },
    { kind: 'heading', level: 2, id: 'transfers', text: 'International transfers' },
    {
      kind: 'counsel',
      id: 'transfers',
      summary: 'International-transfer mechanism',
      detail:
        'The mechanism for any cross-border processing — for example standard contractual clauses — requires counsel review before it can be stated.',
    },
    { kind: 'heading', level: 2, id: 'your-rights', text: 'Your rights' },
    {
      kind: 'paragraph',
      text: 'Depending on where you live, data-protection law gives you rights over personal data. This site collects nothing it could sell, and nothing here is sold. The rights below are stated generally; their precise wording is pending counsel sign-off.',
    },
    {
      kind: 'list',
      items: [
        'Access, rectification, and erasure (GDPR articles 15–17)',
        'Restriction of processing and data portability (GDPR articles 18 and 20)',
        'Objection to processing based on legitimate interest (GDPR article 21)',
        'Under the CCPA: the rights to know, to delete, and to opt out of the sale of personal information',
      ],
    },
    {
      kind: 'counsel',
      id: 'rights-phrasing',
      summary: 'Rights wording sign-off',
      detail:
        'The precise wording of the GDPR and CCPA rights descriptions above requires counsel sign-off before this policy takes effect.',
    },
    { kind: 'heading', level: 2, id: 'exercising', text: 'Exercising your rights' },
    {
      kind: 'paragraph',
      text: 'Requests will be answerable through a published contact channel. That channel does not exist yet, and this page will not invent one.',
    },
    {
      kind: 'counsel',
      id: 'contact-email',
      summary: 'Rights-request contact channel',
      detail:
        'A monitored mailbox for privacy and rights requests will be published here before launch; until then no contact address exists.',
    },
    { kind: 'heading', level: 2, id: 'dpo', text: 'Data protection officer' },
    {
      kind: 'counsel',
      id: 'dpo',
      summary: 'DPO / EU representative',
      detail:
        'Whether a data protection officer or an EU representative is required — and who fills the role — is pending counsel assessment.',
    },
    { kind: 'heading', level: 2, id: 'supervisory-authority', text: 'Supervisory authority' },
    {
      kind: 'counsel',
      id: 'supervisory-authority',
      summary: 'Competent supervisory authority',
      detail:
        'The competent supervisory authority depends on where the operating entity is established and will be referenced here after counsel review.',
    },
    { kind: 'heading', level: 2, id: 'changes', text: 'Changes to this policy' },
    {
      kind: 'paragraph',
      text: 'We will revise this policy as the product and the operating entity take shape; the date at the top reflects the latest revision. Every section marked “pending counsel review” must be resolved before this policy governs a live service.',
    },
  ],
};
