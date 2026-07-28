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

  'settings.deployment.apiEndpoint': 'API endpoint',
  'settings.deployment.liveness': 'Liveness',
  'settings.deployment.readiness': 'Readiness',
  'settings.deployment.live': 'Live',
  'settings.deployment.unreachable': 'Unreachable',
  'settings.deployment.ready': 'Ready',
  'settings.deployment.notReady': 'Not ready',
  'settings.deployment.ok': 'OK',
  'settings.deployment.down': 'Down',
  'settings.deployment.column.dependency': 'Dependency',
  'settings.deployment.column.detail': 'Detail',
  'settings.deployment.column.status': 'Status',
  'settings.plans.title': 'Plans & budgets',
  'settings.plans.error': 'Could not load plans',
  'settings.plans.column.plan': 'Plan',
  'settings.plans.column.price': 'Price',
  'settings.plans.column.compileBudget': 'Compile budget',
  'settings.plans.column.monthlyCompiles': 'Monthly compiles',
  'settings.plans.column.seats': 'Seats',
  'settings.plans.profileLink': 'Profile',
  'settings.plans.unlimited': 'Unlimited',
  'settings.plans.free': 'Free',
  'settings.governance.title': 'Governance & retention',

  'settings.plans.descriptionLead':
    'Entitlements that bound compilation, enforced server-side per plan. This is the catalog — the plan this workspace is on is shown under',
  'settings.governance.description':
    'How access and history are controlled. Set by server configuration — read-only here.',
  'settings.governance.access': 'Access control',
  'settings.governance.accessValue': 'Role-based, least privilege',
  'settings.governance.audit': 'Audit trail',
  'settings.governance.auditValue': 'Append-only, per tenant',
  'settings.governance.retention': 'Retention',
  'settings.governance.retentionValue': 'By max age & max entries',
  'settings.governance.link': 'View roles & retention posture',

  'header.openPalette': 'Open command palette',
  'header.searchPlaceholder': 'Search context…',
  'header.notifications': 'Notifications',
  'header.markAllRead': 'Mark all as read',
  'header.loading': 'Loading notifications…',
  'header.loadFailed': 'Notifications could not be loaded.',
  'header.retry': 'Try again',
  'header.emptyTitle': 'Nothing here yet',
  'header.emptyBody':
    'Scans, compiles, and captured memories land here — and stay here across reloads.',
  'header.recentNotifications': 'Recent notifications',

  // --- notifications (F-065) — the API sends kinds, not prose; the sentences live here ---
  'notifications.kind.memoryCaptured.title': 'Memory captured',
  'notifications.kind.memoryCaptured.body': 'A new entry was recorded to the workspace memory.',
  'notifications.kind.scanCompleted.title': 'Source scan finished',
  'notifications.kind.scanCompleted.body': 'New and changed content is indexed and searchable.',
  'notifications.kind.scanFailed.title': 'Source scan failed',
  'notifications.kind.scanFailed.body':
    'Indexing stopped before finishing; open Sources for detail.',
  'notifications.kind.tokenChanged.title': 'API token changed',
  'notifications.kind.tokenChanged.body': 'A token was issued or revoked for this workspace.',
  'notifications.kind.planChanged.title': 'Plan changed',
  'notifications.kind.planChanged.body': 'The subscription or payment details were updated.',
  'notifications.markRead': '{title} — mark as read',
  'notifications.settings.title': 'Notifications',
  'notifications.settings.description':
    'Which events raise a notification for you. Applies to the bell and to agents reading your notifications — and to every device you sign in from.',
  'notifications.settings.loadFailed': 'Notification preferences could not be loaded.',
  'notifications.settings.saveFailed': 'That change could not be saved. Try again.',
  'notifications.settings.severityError': 'Error',
  'notifications.settings.severityWarning': 'Security',
  'memory.title': 'Memory',
  'memory.description':
    'Browse the decisions, lessons, and incidents your agents rely on. Every memory is versioned — edits append a new version, never overwrite.',
  'memory.new': 'New memory',
  'memory.filterKind': 'Filter by kind',
  'memory.allKinds': 'All kinds',
  'memory.filterScope': 'Filter by scope',
  'memory.allScopes': 'All scopes',
  'memory.loadFailed': 'Could not load memories',
  'memory.listLabel': 'Memories',

  // --- row context menu ---
  'row.copy': 'Copy {label}',
  'row.open': 'Open',
  'row.showEffects': 'Show effects',
  'row.copied': 'Copied {label}',

  // --- shared ---
  'common.apiUnreachable': 'Is the Tessera API running?',
} as const;

export type MessageKey = keyof typeof messages;
