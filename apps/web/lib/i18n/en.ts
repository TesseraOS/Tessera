/**
 * The English message catalog (F-064; NFR-14).
 *
 * **Flat, dotted keys, one object.** Nested objects read nicely and index badly: `t()` would need a
 * path walker, the key type would stop being a plain union, and a typo would resolve to `undefined`
 * at runtime instead of failing the build. A flat record gives `keyof typeof messages` for free, so
 * an unknown key is a type error.
 *
 * **Values are byte-identical to the strings they replaced.** That is deliberate: it means the
 * migration cannot change what a user sees, and any test that breaks during it is reporting a real
 * regression rather than churn.
 *
 * NFR-14 asks for *readiness*, not translation — one locale, no runtime library, no negotiation.
 * What it buys is that the strings are now in one place and a guard can keep them there.
 */
export const messages = {
  // --- navigation (the app shell) ---
  'nav.overview': 'Overview',
  'nav.search': 'Search',
  'nav.inspector': 'Inspector',
  'nav.graph': 'Knowledge graph',
  'nav.memory': 'Memory',
  'nav.timeline': 'Timeline',
  'nav.sources': 'Sources',
  'nav.analytics': 'Analytics',
  'nav.audit': 'Audit log',
  'nav.governance': 'Governance',
  'nav.billing': 'Billing',
  'nav.settings': 'Settings',

  // --- keyboard shortcuts overlay ---
  'shortcuts.title': 'Keyboard shortcuts',
  'shortcuts.group.global': 'Global',
  'shortcuts.group.global.scope': 'Anywhere in the dashboard',
  'shortcuts.group.search': 'Search results',
  'shortcuts.group.search.scope': 'While the results list has focus',
  'shortcuts.palette': 'Open the command palette',
  'shortcuts.sidebar': 'Show or hide the sidebar',
  'shortcuts.help': 'Show this list',
  'shortcuts.dismiss': 'Close the open dialog, sheet, or menu',
  'shortcuts.next': 'Move to the next result',
  'shortcuts.previous': 'Move to the previous result',
  'shortcuts.first': 'Jump to the first result',
  'shortcuts.last': 'Jump to the last result',
  'shortcuts.open': 'Open the focused result',

  // --- settings ---
  'settings.deployment.title': 'Deployment',
  'settings.deployment.description': 'Live connection and dependency health for this workspace.',
  'settings.flags.title': 'Feature flags',
  'settings.flags.description':
    'Progressive rollout for this workspace, evaluated per tenant. Declared in deployment configuration — this view is read-only.',
  'settings.flags.empty': 'This deployment declares no feature flags.',
  'settings.flags.error': 'Could not load feature flags',
  'settings.flags.column.flag': 'Flag',
  'settings.flags.column.description': 'Description',
  'settings.flags.column.source': 'Source',
  'settings.flags.column.state': 'State',
  'settings.flags.source.override': 'Override for this workspace',
  'settings.flags.source.default': 'Default',
  'settings.flags.on': 'On',
  'settings.flags.off': 'Off',

  // --- row context menu ---
  'row.copy': 'Copy {label}',
  'row.open': 'Open',
  'row.showEffects': 'Show effects',
  'row.copied': 'Copied {label}',

  // --- shared ---
  'common.apiUnreachable': 'Is the Tessera API running?',
} as const;

export type MessageKey = keyof typeof messages;
