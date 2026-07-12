import type { LegalDoc } from './types';

/**
 * /legal/imprint — operator identity (F-067). Real facts are limited to what the
 * project publicly is; entity, address, representative, register, contact, and
 * jurisdiction are counsel placeholders — this page is mostly placeholders BY DESIGN
 * (acceptance #3 sanctions exactly that), and it says so.
 */
export const imprintDoc: LegalDoc = {
  slug: 'imprint',
  eyebrow: 'legal — imprint',
  title: 'Imprint',
  lead: 'Operator identity for the Tessera marketing site. Most entries here await incorporation details — every placeholder is marked for counsel review.',
  updated: '2026-07-12',
  blocks: [
    { kind: 'heading', level: 2, id: 'operator', text: 'Operator' },
    {
      kind: 'paragraph',
      text: 'Tessera is a context and memory system for AI coding agents, built as an open-core project: the engine is developed in the open, and a managed cloud service on the same engine is planned. The legal identity behind this site is not yet final — this page is placeholders by design, and it will be completed before any commercial launch.',
    },
    {
      kind: 'counsel',
      id: 'entity',
      summary: 'Operating legal entity',
      detail:
        'The name and corporate form of the entity operating this site will be stated here once incorporation details are confirmed by counsel.',
    },
    {
      kind: 'counsel',
      id: 'representative',
      summary: 'Authorized representative',
      detail: 'The authorized representative(s) of the operating entity will be named here.',
    },
    { kind: 'heading', level: 2, id: 'registered-address', text: 'Registered address' },
    {
      kind: 'counsel',
      id: 'address',
      summary: 'Registered address',
      detail:
        'A registered business address will be published here once the operating entity is established.',
    },
    { kind: 'heading', level: 2, id: 'register-entries', text: 'Register entries' },
    {
      kind: 'counsel',
      id: 'register-number',
      summary: 'Register and tax identifiers',
      detail:
        'Commercial-register and tax identifiers — company number and VAT ID — will be listed here once registration is complete.',
    },
    { kind: 'heading', level: 2, id: 'contact', text: 'Contact' },
    {
      kind: 'counsel',
      id: 'contact-email',
      summary: 'Contact channel',
      detail:
        'No public mailbox exists yet and the operating domain is undecided; a monitored contact channel will be published here before launch.',
    },
    { kind: 'heading', level: 2, id: 'jurisdiction', text: 'Jurisdiction' },
    {
      kind: 'counsel',
      id: 'jurisdiction',
      summary: 'Governing law and venue',
      detail:
        'The governing law and venue for disputes concerning this site depend on where the operating entity is established and require counsel review.',
    },
  ],
};
