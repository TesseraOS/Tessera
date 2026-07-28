/**
 * Files whose user-facing copy has NOT yet moved into `lib/i18n` (F-064; NFR-14).
 *
 * An enumerated list, not a warning level. A warning lets the count grow silently; an allowlist keeps
 * the remaining migration countable and makes shrinking it the only way to touch these files without
 * turning the rule off. **Entries are only ever removed, never added.**
 *
 * When the guard landed the dashboard had 52 files carrying user-facing copy outside the
 * catalog. Migrating all of them in one sweep was considered and rejected by the lead: the risk is
 * not difficulty but silent UI regressions across surfaces with no failing test to catch them, so the
 * remainder is tracked as its own feature and this list is its checklist.
 */
export const I18N_ALLOWLIST = [
  'app/not-found.tsx',
  'app/signin/page.tsx',
  'components/activity-chart.tsx',
  'components/activity-feed.tsx',
  'components/activity-sync.test.tsx',
  'components/analytics/analytics-view.tsx',
  'components/app-shell.tsx',
  'components/appearance-switcher.tsx',
  'components/audit/audit-export.tsx',
  'components/audit/audit-view.tsx',
  'components/billing/billing-view.tsx',
  'components/command-palette.tsx',
  'components/custom-sidebar-trigger.tsx',
  'components/dashboard.tsx',
  'components/empty-state.test.tsx',
  'components/error-state.tsx',
  'components/governance/governance-view.tsx',
  'components/graph/graph-canvas-impl.tsx',
  'components/graph/graph-side-panel.tsx',
  'components/graph/graph-view.tsx',
  'components/inspector/compile-form.tsx',
  'components/inspector/fragment-card.tsx',
  'components/inspector/inspector-view.tsx',
  'components/inspector/package-export.tsx',
  'components/inspector/package-guidance.tsx',
  'components/inspector/recent-compiles.tsx',
  'components/memory/memory-authoring-dialog.tsx',
  'components/memory/memory-detail.tsx',
  'components/nav-user.tsx',
  'components/profile/members-card.tsx',
  'components/profile/profile-view.tsx',
  'components/profile/tokens-panel.tsx',
  'components/project-switcher.tsx',
  'components/project/create-project-dialog.tsx',
  'components/provenance/signal-badge.tsx',
  'components/quick-create-menu.tsx',
  'components/row-context-menu.test.tsx',
  'components/search/search-detail.tsx',
  'components/search/search-view.tsx',
  'components/settings/appearance-settings.tsx',
  'components/shortcuts-overlay.tsx',
  'components/sources/register-source-dialog.tsx',
  'components/sources/sources-view.tsx',
  'components/timeline/timeline-view.tsx',
  'components/ui/breadcrumb.tsx',
  'components/ui/data-table.test.tsx',
  'components/ui/dialog.tsx',
  'components/ui/sheet.tsx',
  'components/ui/sidebar.tsx',
];
