import type { LegalDoc } from './types';

/**
 * /legal/terms — the SaaS + open-core split (F-067): service terms for the managed
 * cloud (honestly marked as not yet generally available) vs the repository license for
 * local/self-hosted use. Plan limits are LINKED to /pricing, never restated (E-019
 * untouched); the concrete OSS license is a counsel placeholder until a LICENSE file
 * exists (PRD OQ4 resolved the model, not the text).
 */
export const termsDoc: LegalDoc = {
  slug: 'terms',
  eyebrow: 'legal — terms',
  title: 'Terms of service',
  lead: 'How Tessera is provided — service terms for the managed cloud and the open-source license that governs self-hosted use, with open items marked for counsel.',
  updated: '2026-07-12',
  blocks: [
    { kind: 'heading', level: 2, id: 'two-ways', text: 'Two ways to run Tessera' },
    {
      kind: 'paragraph',
      text: 'Tessera is open core. The engine — ingestion, memory, the knowledge graph, the context compiler, and the MCP server — is open source and runs entirely inside your own deployment. The managed cloud, which hosts the same engine as a multi-tenant service, is the paid layer. Different terms govern each, and this page keeps them separate.',
    },
    {
      kind: 'counsel',
      id: 'entity',
      summary: 'Who you contract with',
      detail:
        'The legal entity that will provide the managed cloud — the contracting party for these terms — has not been finalized and will be named here after incorporation details are confirmed by counsel.',
    },
    { kind: 'heading', level: 2, id: 'service-terms', text: 'Service terms — managed cloud' },
    {
      kind: 'paragraph',
      text: 'The managed cloud is not generally available. Nothing on this page grants access to a live service today; these sections exist so the structure of the eventual terms is public early.',
    },
    { kind: 'heading', level: 3, id: 'accounts', text: 'Accounts' },
    {
      kind: 'paragraph',
      text: 'When the cloud service opens, using it will require an account. You will be responsible for activity under your credentials, and registration information must be accurate.',
    },
    { kind: 'heading', level: 3, id: 'acceptable-use', text: 'Acceptable use' },
    {
      kind: 'list',
      items: [
        'No probing or breaching tenant isolation or the service’s security boundaries',
        'No ingesting content you have no right to process',
        'No interfering with the service’s operation or other tenants’ use of it',
        'No reselling access without a written agreement',
      ],
    },
    { kind: 'heading', level: 3, id: 'plan-limits', text: 'Plan limits' },
    {
      kind: 'paragraph',
      text: 'Plans, prices, and entitlements are published on the [pricing page](/pricing) and rendered from the same catalog the service enforces. This document does not restate numbers that page already owns.',
    },
    { kind: 'heading', level: 3, id: 'payments', text: 'Payments and billing' },
    {
      kind: 'counsel',
      id: 'payments',
      summary: 'Payment processing and merchant of record',
      detail:
        'Payment-processing and merchant-of-record specifics are not final — the managed cloud is not generally available and no payments are collected today. The processor and billing terms will be named here before launch.',
    },
    { kind: 'heading', level: 3, id: 'liability', text: 'Disclaimers and liability' },
    {
      kind: 'paragraph',
      text: 'Warranty disclaimers and liability caps depend on governing law, so they are stated only after counsel review rather than copied from a template.',
    },
    {
      kind: 'counsel',
      id: 'jurisdiction',
      summary: 'Governing law and venue',
      detail:
        'Governing law, venue, and the liability and disclaimer provisions that depend on them require counsel review before these terms take effect.',
    },
    {
      kind: 'heading',
      level: 2,
      id: 'repository-license',
      text: 'Repository license — local and self-hosted',
    },
    {
      kind: 'paragraph',
      text: 'Self-hosted and local use is governed by the repository’s open-source license, not by these service terms. The open-core model is decided; the exact license text is not yet committed to the repository, and nothing is licensed by implication until it is.',
    },
    {
      kind: 'counsel',
      id: 'oss-license',
      summary: 'The exact repository license',
      detail:
        'A concrete permissive license has not been chosen and no LICENSE file exists yet. Once one is committed, the license file governs and this section will cite it — nothing is cited before then.',
    },
    { kind: 'heading', level: 2, id: 'changes', text: 'Changes to these terms' },
    {
      kind: 'paragraph',
      text: 'These terms are a draft and will change before the managed cloud opens. The date at the top reflects the latest revision; sections marked “pending counsel review” must be resolved before any of this binds a customer.',
    },
  ],
};
