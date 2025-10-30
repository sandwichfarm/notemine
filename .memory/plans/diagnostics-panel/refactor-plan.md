Purpose
- Provide a Diagnostics page to surface runtime health: COI, cache health/metrics, and relay status. Include optional CSP checks to quickly detect blocked sources in production.

Scope
- GUI only: add a new page `Diagnostics.tsx`, route, and a header nav link. No changes to core or wrapper.

Contracts / APIs
- Read-only use of getCacheHealth() and getCacheMetrics() from lib/cache.
- Display relay states via existing RelayStats component.
- Optional checks (on button click): blob worker creation and data: fetch to indicate CSP issues.

Control Flow
- Diagnostics page renders:
  - COI status from window.crossOriginIsolated.
  - Cache health summary and polled metrics (interval).
  - RelayStats list.
  - Button to run CSP checks; results stored in signals.
- Link in header next to Preferences.

Edge Cases
- If cache not initialized (health disabled), page shows disabled status and does not error.
- CSP checks are optional and no-op unless clicked.

Diagnostics
- Surface key numbers (events written, error counts) and a healthy/degraded/unhealthy badge.

Acceptance
- Navigate to /diagnostics and see statuses update without errors.
- Clicking “Run CSP checks” shows pass/fail for blob worker and data fetch.
- Relay list and counts render as in RelayStats.
