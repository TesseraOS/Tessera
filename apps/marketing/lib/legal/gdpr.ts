import type { LegalDoc } from './types';

/**
 * /legal/gdpr — "GDPR at Tessera" (F-067 v2): a POSTURE page, never a compliance
 * claim (the fabrication tripwire banning GDPR-compliance wording applies here too).
 * Roles are stated only where they are structural truths (ADR-0003 deployment
 * profiles); everything cloud-operational is future tense; DPA, transfers, and the
 * supervisory authority are counsel placeholders.
 */
export const gdprDoc: LegalDoc = {
  slug: 'gdpr',
  eyebrow: 'legal — gdpr',
  title: 'GDPR at Tessera',
  lead: 'How Tessera relates to the GDPR today — roles by deployment profile, the rights model, and the open items counsel must resolve before launch.',
  updated: '2026-07-12',
  blocks: [
    { kind: 'heading', level: 2, id: 'posture', text: 'Where Tessera stands' },
    {
      kind: 'paragraph',
      text: 'This page describes how Tessera relates to the GDPR today. It is a statement of posture and architecture, not a certification: the sections marked “pending counsel review” are unresolved, and nothing here claims a certified status.',
    },
    { kind: 'heading', level: 2, id: 'roles', text: 'Controller and processor roles' },
    { kind: 'heading', level: 3, id: 'roles-self-hosted', text: 'Local and self-hosted' },
    {
      kind: 'paragraph',
      text: 'In the local and self-hosted profiles, the engine runs on infrastructure you control, and your content never reaches us. You — or your organization — remain the controller of the personal data your repositories and memory contain, and no Tessera operator acts as your processor, because nothing is transmitted to one.',
    },
    { kind: 'heading', level: 3, id: 'roles-cloud', text: 'Managed cloud' },
    {
      kind: 'paragraph',
      text: 'The managed cloud is not generally available. When it launches, the operating entity will process hosted workspace content on customers’ behalf — the classic processor role — under a data processing agreement published before general availability.',
    },
    {
      kind: 'counsel',
      id: 'dpa',
      summary: 'Data processing agreement',
      detail:
        'A DPA — processor obligations, subprocessor terms, breach-notification windows, audit rights — will be published before the managed cloud becomes generally available. It requires an operating entity and counsel review first.',
    },
    {
      kind: 'heading',
      level: 2,
      id: 'rights',
      text: 'Data-subject rights (articles 15–21)',
    },
    {
      kind: 'paragraph',
      text: 'The table below maps the GDPR’s data-subject rights onto the two ways Tessera runs. For self-hosted deployments the honest answer is structural: the data lives with you, so the rights are exercised against your own deployment, not against us.',
    },
    {
      kind: 'table',
      caption: 'Rights and where they stand today',
      head: ['Right', 'Article', 'Self-hosted', 'Managed cloud'],
      rows: [
        ['Access', '15', 'Your deployment holds the data', 'Pre-GA; tooling planned'],
        ['Rectification', '16', 'Edit at the source you control', 'Pre-GA'],
        ['Erasure', '17', 'Delete within your deployment', 'Pre-GA; retention pending counsel'],
        ['Restriction', '18', 'You control processing directly', 'Pre-GA'],
        ['Portability', '20', 'The data is already yours', 'Pre-GA; export planned'],
        ['Objection', '21', 'You are the controller', 'Pre-GA'],
      ],
    },
    {
      kind: 'counsel',
      id: 'rights-phrasing',
      summary: 'Rights wording sign-off',
      detail:
        'The mapping above is architectural; the operative wording for the cloud service’s rights procedures requires counsel sign-off before launch.',
    },
    { kind: 'heading', level: 2, id: 'website', text: 'This website' },
    {
      kind: 'paragraph',
      text: 'The marketing site you are reading collects no personal data of its own — no accounts, no forms, no cookies, no analytics. The [privacy policy](/legal/privacy) and the [cookie policy](/legal/cookies) state this in full, and the cookie page’s claims are verified by automated tests against the production build.',
    },
    { kind: 'heading', level: 2, id: 'transfers', text: 'International transfers' },
    {
      kind: 'counsel',
      id: 'transfers',
      summary: 'International-transfer mechanism',
      detail:
        'Whether and how cloud data crosses borders — and under which mechanism, for example standard contractual clauses — depends on hosting decisions that are not final and require counsel review.',
    },
    { kind: 'heading', level: 2, id: 'authority', text: 'Supervisory authority' },
    {
      kind: 'counsel',
      id: 'supervisory-authority',
      summary: 'Competent supervisory authority',
      detail:
        'The competent authority follows from where the operating entity is established, which is not yet decided; it will be referenced here after counsel review.',
    },
    { kind: 'heading', level: 2, id: 'changes', text: 'Changes' },
    {
      kind: 'paragraph',
      text: 'This page will be revised as the operating entity, hosting, and the DPA take shape; the date at the top reflects the latest revision. Sections marked “pending counsel review” must be resolved before the managed cloud serves customers.',
    },
  ],
};
