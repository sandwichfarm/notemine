Purpose
- Unify the home page ("/") feed with the richer feed at "/feed".
- Ensure the feed appears under the composer on home.
- Fix anon behavior: hide selector, force WoT feed only.
- Make feed selector UI more compact.

Scope
- GUI only: `packages/gui/src/pages/Home.tsx`, `packages/gui/src/pages/Feed.tsx`.
- No changes to core/mining; no unrelated refactors.

Contracts / APIs
- `Feed` page accepts optional props: `{ showHeader?: boolean }`.
- When `user.isAnon === true`, the effective feed mode is WoT, selector hidden.

Data Types
- `FeedMode = 'global' | 'wot'` (unchanged).

Control Flow
- Home renders `NoteComposer` then an embedded `Feed` with `showHeader=false`.
- `Feed` computes `effectiveMode = isAnon ? 'wot' : feedMode()` and renders accordingly.
- LocalStorage feedMode persists only for non-anon users.

Edge Cases
- If a previous `feedMode` in localStorage is `global`, anon users still see WoT.
- If no user exists (unlikely), fallback remains safe (no selector; global prompt rules unchanged).

Diagnostics
- None added; use existing debug logs.

Tests / Acceptance
- Home shows composer and, below it, the same feed experience as /feed.
- Selector buttons are visibly more compact.
- When anon: selector hidden; WoT items render if available; no blank page.
- /feed route continues to work unchanged aside from compact buttons.
