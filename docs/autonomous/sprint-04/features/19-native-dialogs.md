# 19 — Real dialogs instead of the browser's

Surface: about twenty call sites that still use the browser's own
`window.prompt`, `window.confirm` or `alert` (library, admin, arcade,
elections, party, playlists, passkeys, staking, RMHLadder, Versecraft), two
new shared primitives, and a gate test. Wave 7. Namespace: none of its own —
each call site's strings stay in its namespace; the primitives take
translated strings as props.

## User story

As a member using the site in the Discord activity, on a phone, in Arabic, or
with a screen reader, I want every question the site asks me — "name this
collection", "delete this résumé?", "copy this link" — to appear as the
site's own dialog, in my language and theme, so that it works where the
browser's pop-ups are blocked or out of place.

## Requirements elicitation

- **What exists (verified):** the shared confirm dialog
  (`components/ui/confirm-dialog.tsx`: `ConfirmProvider`, `useConfirm`) is
  used across the site, but these call sites still use native dialogs
  (verified by a search for `window.prompt|confirm|alert` and bare
  `prompt(`/`alert(`):
  `components/library/LibraryCollections.tsx` (prompt, alert),
  `components/library/LibraryEditControls.tsx` (alert),
  `app/routes/_site/library/index.tsx` (alert),
  `components/admin/library/QuotaAppealsPanel.tsx` (prompt),
  `components/feed/PlaylistsColumn.tsx` (prompt),
  `components/site/PasskeyManager.tsx` (prompt),
  `app/routes/_site/rmhladder/resume.tsx` (confirm),
  `app/routes/_site/admin/reports.tsx` (two prompts: ban reason and length),
  `app/routes/_site/admin/users.tsx` (two membership prompts; the coin prompt
  is removed by 06 in wave 1),
  `components/wallet/StakingCard.tsx` and `components/feed/ProgressColumn.tsx`
  (alert), and six "copy this link" fallbacks that open a prompt holding the
  text when the clipboard API fails (`components/arcade/BasketPanel.tsx`,
  `RunPanel.tsx`, `components/elections/ShareBar.tsx`,
  `components/elections/room/RoomOverlay.tsx`,
  `components/party/ConnectionsPages.tsx`,
  `components/versecraft/ShareSeed.tsx`).
  Native dialogs are suppressed inside sandboxed iframes without
  `allow-modals` (the Discord activity hosts the site in an iframe —
  `components/rmhbox/RMHboxDiscordActivity.tsx`), their chrome cannot be
  translated or themed, they ignore `dir="rtl"` in some browsers, and they
  block the page's event loop (realtime sockets stall while one is open).
  `components/velum2099/game/` (frozen, `@ts-nocheck`) keeps its two alerts.
- **Decisions:** two primitives next to the confirm dialog, same provider
  pattern, **translated strings as props** (they never read a feature
  namespace): `usePrompt()` → `prompt({ title, label, initialValue,
  confirmLabel, cancelLabel, validate? }) => Promise<string | null>` and
  `useCopyFallback()` → `showCopy({ title, text, copyLabel, closeLabel })`
  (a read-only field, selected on open, with a Copy button). Errors that used
  `alert` become `toast` from `@/lib/toast`. The admin ban flow becomes one
  dialog with reason and length fields. A ratchet test forbids new native
  dialogs.

## Functional requirements

1. FR-1 Every listed call site uses `useConfirm`, `usePrompt`,
   `useCopyFallback` or `toast`, with the same wording it had (existing keys;
   new keys only where a dialog needs a title the native one lacked).
2. FR-2 Cancelling a prompt behaves exactly as cancelling the native one did
   (`null`, nothing happens).
3. FR-3 The admin report actions ask for reason and ban length in one dialog
   with validation ("Enter a number of days or leave blank for permanent").
4. FR-4 The copy fallback selects the text on open and copies on "Copy",
   announcing "Copied".
5. FR-5 `lib/__tests__/native-dialog-ratchet.test.ts` fails on any
   `window.prompt|confirm|alert` or bare `prompt(`/`alert(` call under
   `app/`, `components/`, `features/` outside an allowlist that holds only
   `components/velum2099/game/` (with its reason).

## Non-functional requirements

- **Accessibility:** both primitives are Radix dialogs via
  `components/ui/dialog.tsx`: labelled, focus trapped, focus returned with
  `onCloseAutoFocus` (never `requestAnimationFrame`), Enter submits, Escape
  cancels; validation errors tied with `aria-describedby`.
- **i18n:** call sites pass `t()` strings; the primitives have no strings of
  their own except what the caller passes.
- **Steel:** overlays only (`--site-surface`, 1 px border, 8 px radius, the
  overlay shadow, no blur, scrim `--site-bg` at 80%); one ink primary per
  dialog; 160 ms opacity, no scale. Inside full-screen apps the primitives
  render with the app tier's tokens when mounted under `html.app-route`
  (check how `ConfirmDialogView` handles this and follow it).
- **Behaviour:** no call site changes what it does after the answer.

## Data model and API

- No migration, no endpoint.
- `components/ui/prompt-dialog.tsx` (`PromptProvider`, `usePrompt`) and
  `components/ui/copy-fallback.tsx` (`CopyFallbackProvider`,
  `useCopyFallback`), mounted where `ConfirmProvider` is mounted
  (`components/Providers.tsx`, and the app-tier provider tree if separate).
- `components/admin/BanDialog.tsx` for the reports page.
- The call sites above.
- `lib/__tests__/native-dialog-ratchet.test.ts`.

## Testing requirements

- Main suite: the ratchet test.
- `components/ui/__tests__/prompt-dialog.test.tsx` and
  `copy-fallback.test.tsx`: resolve with the value, resolve `null` on
  cancel and Escape, validation blocks submit, focus returns to the trigger.
- Characterization tests of touched components stay green.

## Acceptance criteria

- [ ] No native dialog remains outside the allowlist (ratchet green).
- [ ] Naming a library collection, renaming a passkey and banning from a
      report all work through site dialogs, keyboard-only.
- [ ] Copy fallbacks work when the clipboard API is denied.
- [ ] Day and Night, 390 px and 1280 px, `ar`; once inside the RMHBox Discord
      activity if available at integration.

## Out of scope

Rewording any message, changing `useConfirm` call sites that already work,
the Velum 2099 data exporter.
