# Site-wide Emoji Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-08-emoji-support-design.md`

**Goal:** Emoji picker button on every compose input, `:shortcode:` autocomplete/instant-conversion while typing, and right-click emoji reactions on feed posts, comments, DMs, and group messages.

**Architecture:** Three independent, sequential parts (each ends in a PR). Part 1 adds a lazy-loaded `emoji-picker-react` popover button plus a shared caret-insertion helper, wired into every compose surface. Part 2 adds a committed gemoji-derived shortcode JSON, pure matcher functions, a `:` trigger inside `MentionTextarea`, and a standalone hook for the non-Mention inputs. Part 3 adds four per-target Prisma reaction tables (mirroring the `RMHarkLike` pattern), toggle API routes, payload/SSE plumbing, and a right-click/long-press reaction menu + chips UI.

**Tech Stack:** TanStack Start/Router, React 19, Tailwind v4 (`site-*` tokens), Prisma 7 + Postgres, Vitest (node env only), `emoji-picker-react` (already installed), `gemoji` (new devDependency, build-time only).

## Global Constraints

- **Command wrappers:** `pnpm test`/`pnpm typecheck` wrappers are blocked in this environment — run binaries directly: `./node_modules/.bin/vitest run <file>`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`.
- **No DOM test env:** Vitest runs `environment: 'node'` with an include allowlist (`lib/__tests__/**/*.test.ts`, `testing/**/*.test.ts`). Only pure functions get unit tests; components are verified by typecheck + browser playtest. Put all new unit tests in `lib/__tests__/`.
- **Two onChange conventions coexist:** `MentionTextarea` and `GifPicker.onSelect` pass a **string**; `GhostTextArea` and raw `<textarea>/<input>` pass a **DOM event**. Match the convention of the file you're editing.
- **Route tree is generated:** new files under `app/routes/api/` must appear in `app/routes/routeTree.gen.ts`. Never hand-edit it — regenerate by running the dev server or build once (check `package.json` for a route-gen script first), then commit the regenerated file.
- **i18n:** user-visible strings use `useTranslation('feed')` + `t('key', { defaultValue: '...' })` inline, matching surrounding code.
- **Legacy naming:** `RMHark*` tables map to `rmheet*` and the post FK column is `rmheetId` (e.g. `RMHarkLike.rmheetId`, unique key `rmheetId_userId`). New reaction models MUST follow this.
- **Styling:** use `site-*` tokens (`bg-site-bg`, `border-site-border`, `text-site-text-dim`, `rounded-site`, accent `site-accent`) — never raw colors.
- **Commits:** one commit per task, message style matches repo history (imperative, no scope prefix required). End commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

# Part 1 — Emoji picker button on all inputs (PR 1)

### Task 1: Caret-insertion helper (pure) + tests

**Files:**
- Create: `lib/emoji/insert-at-caret.ts`
- Test: `lib/__tests__/insert-at-caret.test.ts`

**Interfaces:**
- Produces: `insertAtCaret(value: string, insertion: string, start: number, end: number): { next: string; caret: number }` — used by Task 2's hook and Part 2's suggestion insertion.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/insert-at-caret.test.ts
import { describe, it, expect } from 'vitest';
import { insertAtCaret } from '@/lib/emoji/insert-at-caret';

describe('insertAtCaret', () => {
  it('inserts at a caret in the middle of the text', () => {
    expect(insertAtCaret('hello world', '🔥', 5, 5)).toEqual({
      next: 'hello🔥 world',
      caret: 7, // '🔥' is 2 UTF-16 units
    });
  });

  it('appends at the end', () => {
    expect(insertAtCaret('hi', '😀', 2, 2)).toEqual({ next: 'hi😀', caret: 4 });
  });

  it('replaces an active selection', () => {
    expect(insertAtCaret('abcdef', '❤️', 1, 4)).toEqual({ next: 'a❤️ef', caret: 3 });
  });

  it('clamps out-of-range offsets', () => {
    expect(insertAtCaret('ab', '😀', 10, 20)).toEqual({ next: 'ab😀', caret: 4 });
    expect(insertAtCaret('ab', '😀', -1, 0)).toEqual({ next: '😀ab', caret: 2 });
  });

  it('treats end < start as a collapsed caret at start', () => {
    expect(insertAtCaret('abcd', 'x', 2, 1)).toEqual({ next: 'abxcd', caret: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run lib/__tests__/insert-at-caret.test.ts`
Expected: FAIL — cannot resolve `@/lib/emoji/insert-at-caret`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/emoji/insert-at-caret.ts
/**
 * Insert `insertion` into `value`, replacing the [start, end) selection.
 * Offsets are UTF-16 code-unit indices, matching textarea selectionStart/End.
 */
export function insertAtCaret(
  value: string,
  insertion: string,
  start: number,
  end: number,
): { next: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  const next = value.slice(0, s) + insertion + value.slice(e);
  return { next, caret: s + insertion.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run lib/__tests__/insert-at-caret.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/emoji/insert-at-caret.ts lib/__tests__/insert-at-caret.test.ts
git commit -m "Add caret-insertion helper for emoji input"
```

---

### Task 2: EmojiPickerPanel, EmojiPickerButton, useEmojiInsert

**Files:**
- Create: `components/shared/EmojiPickerPanel.tsx`
- Create: `components/shared/EmojiPickerButton.tsx`
- Create: `lib/emoji/use-emoji-insert.ts`

**Interfaces:**
- Consumes: `insertAtCaret` from Task 1.
- Produces:
  - `EmojiPickerPanel` (default export): `{ onSelect: (emoji: string) => void; width?: number | string; height?: number }` — the raw picker panel, also reused by Part 3's ReactionMenu.
  - `EmojiPickerButton` (named export): `{ onSelect: (emoji: string) => void; direction?: 'up' | 'down'; className?: string }` — self-contained trigger button + popover.
  - `useEmojiInsert(ref, value, onChange): (emoji: string) => void` — caret-aware insert callback.

**Why two components:** `emoji-picker-react` is ~1MB. `EmojiPickerPanel` imports it eagerly (including the `Theme`/`EmojiStyle` enums, which are runtime values); `EmojiPickerButton` loads the panel with `React.lazy`, so the library only downloads when a picker is first opened.

- [ ] **Step 1: Write EmojiPickerPanel**

```tsx
// components/shared/EmojiPickerPanel.tsx
/**
 * Raw emoji picker panel (emoji-picker-react, Twemoji style to match the
 * global TwemojiProvider). Eagerly imports the library — always load this
 * component via React.lazy so the ~1MB picker stays out of the main bundle.
 */
'use client';

import { useCallback } from 'react';
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';

interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void;
  width?: number | string;
  height?: number;
}

export default function EmojiPickerPanel({
  onSelect,
  width = 300,
  height = 360,
}: EmojiPickerPanelProps) {
  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => onSelect(emojiData.emoji),
    [onSelect],
  );

  return (
    <EmojiPicker
      onEmojiClick={handleEmojiClick}
      theme={Theme.AUTO}
      emojiStyle={EmojiStyle.TWITTER}
      width={width}
      height={height}
      searchPlaceholder="Search emojis…"
      previewConfig={{ showPreview: false }}
      skinTonesDisabled={false}
      lazyLoadEmojis={true}
    />
  );
}
```

- [ ] **Step 2: Write useEmojiInsert**

```ts
// lib/emoji/use-emoji-insert.ts
import type { RefObject } from 'react';
import { insertAtCaret } from './insert-at-caret';

type TextField = HTMLTextAreaElement | HTMLInputElement;

/**
 * Returns a callback that inserts an emoji at the field's current caret
 * (replacing any selection), then restores focus and caret position.
 * Falls back to appending when the ref isn't mounted.
 */
export function useEmojiInsert(
  ref: RefObject<TextField | null>,
  value: string,
  onChange: (next: string) => void,
): (emoji: string) => void {
  return (emoji: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { next, caret } = insertAtCaret(value, emoji, start, end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };
}
```

- [ ] **Step 3: Write EmojiPickerButton**

```tsx
// components/shared/EmojiPickerButton.tsx
'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));

interface EmojiPickerButtonProps {
  onSelect: (emoji: string) => void;
  /** Which way the popover opens relative to the button. Default 'up' (compose bars sit at the bottom). */
  direction?: 'up' | 'down';
  className?: string;
}

export function EmojiPickerButton({
  onSelect,
  direction = 'up',
  className = '',
}: EmojiPickerButtonProps) {
  const { t } = useTranslation('feed');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('emoji-picker-open', { defaultValue: 'Add emoji' })}
        aria-expanded={open}
        className="p-1.5 text-site-text-dim hover:text-site-accent transition-colors"
      >
        <Smile className="w-5 h-5" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 ${
            direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <Suspense
            fallback={
              <div className="w-[300px] h-[360px] rounded-site border border-site-border bg-site-bg animate-pulse" />
            }
          >
            <EmojiPickerPanel onSelect={onSelect} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
```

Note: the popover intentionally stays open after a selection so multiple emoji can be inserted; Escape or clicking outside closes it.

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/shared/EmojiPickerPanel.tsx components/shared/EmojiPickerButton.tsx lib/emoji/use-emoji-insert.ts
git commit -m "Add lazy-loaded emoji picker button and insert hook"
```

---

### Task 3: Wire picker into feed compose (ComposeBox, ComposeModal, EditPostModal)

**Files:**
- Modify: `components/feed/ComposeBox.tsx` (state at line 41, textarea at 367-381, GIF area near 495-528)
- Modify: `components/feed/ComposeModal.tsx`
- Modify: `components/feed/EditPostModal.tsx`

**Interfaces:**
- Consumes: `EmojiPickerButton`, `useEmojiInsert` (Task 2).

- [ ] **Step 1: ComposeBox**

Add imports:

```tsx
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
```

ComposeBox already has `const [content, setContent] = useState('');` (line 41) and a `textareaRef` passed to `MentionTextarea` (line 368). Below the state declarations add:

```tsx
const insertEmoji = useEmojiInsert(textareaRef, content, setContent);
```

Find the toolbar row containing the GIF toggle button (the button that sets `attachment` to `'gif'` — search for `attachment` in the action row below the textarea) and add, immediately next to that button:

```tsx
<EmojiPickerButton direction="down" onSelect={insertEmoji} />
```

`direction="down"` because ComposeBox sits at the top of the feed with room below.

- [ ] **Step 2: ComposeModal and EditPostModal**

These mirror ComposeBox. In each file: locate the `MentionTextarea` (or textarea) and its `value`/`onChange` state pair, ensure a ref is attached (add `const textareaRef = useRef<HTMLTextAreaElement>(null);` and `ref={textareaRef}` if missing), add the same two imports, create `const insertEmoji = useEmojiInsert(textareaRef, <stateVar>, <setStateVar>);` with that file's actual state names, and place `<EmojiPickerButton direction="down" onSelect={insertEmoji} />` in the toolbar row next to the existing GIF/attachment button. If a modal has no toolbar row, place the button in the footer row next to the submit button.

- [ ] **Step 3: Typecheck**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/feed/ComposeBox.tsx components/feed/ComposeModal.tsx components/feed/EditPostModal.tsx
git commit -m "Add emoji picker to post compose surfaces"
```

---

### Task 4: Wire picker into comment replies (CommentItem)

**Files:**
- Modify: `components/feed/CommentItem.tsx` (reply input at 377-443, GIF button at ~415)

- [ ] **Step 1: Add ref + hook**

`CommentItem` renders `MentionTextarea` without a ref (line 377). Add imports (as in Task 3), then near the reply state (lines 77-80):

```tsx
const replyRef = useRef<HTMLTextAreaElement>(null);
const insertEmoji = useEmojiInsert(replyRef, replyContent, setReplyContent);
```

Attach `ref={replyRef}` to the reply `MentionTextarea` (line 377).

- [ ] **Step 2: Add button next to the GIF toggle**

Next to the GIF toggle button (line ~415, the one with `<ImageIcon />` that flips `showGifPicker`):

```tsx
<EmojiPickerButton direction="up" onSelect={insertEmoji} />
```

- [ ] **Step 3: Typecheck, commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — expected clean.

```bash
git add components/feed/CommentItem.tsx
git commit -m "Add emoji picker to comment replies"
```

---

### Task 5: Wire picker into DMs and group chats

**Files:**
- Modify: `components/feed/ConversationView.tsx` (inputRef at 65, input state at 51, GhostTextArea at 698-718, attach menu at 719-750)
- Modify: `components/feed/GroupChatView.tsx` (input state at 52, MentionTextarea at 471-485, attach menu at 431-469)

- [ ] **Step 1: ConversationView**

It already has `const inputRef = useRef<HTMLTextAreaElement>(null);` (line 65) and `input` state (line 51). Add imports (Task 3), then:

```tsx
const insertEmoji = useEmojiInsert(inputRef, input, setInput);
```

In the compose row (the flex row containing the attach `+` menu at 719-750 and the send button at 751-759), add next to the attach button:

```tsx
<EmojiPickerButton direction="up" onSelect={insertEmoji} />
```

- [ ] **Step 2: GroupChatView**

The `MentionTextarea` at line 471 has no ref. Add:

```tsx
const inputRef = useRef<HTMLTextAreaElement>(null);
const insertEmoji = useEmojiInsert(inputRef, input, setInput);
```

Attach `ref={inputRef}` to the `MentionTextarea`, and add `<EmojiPickerButton direction="up" onSelect={insertEmoji} />` in the compose row next to the attach `+` menu (431-469).

- [ ] **Step 3: Typecheck, commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — expected clean.

```bash
git add components/feed/ConversationView.tsx components/feed/GroupChatView.tsx
git commit -m "Add emoji picker to DMs and group chats"
```

---

### Task 6: Wire picker into realtime chat panels and profile bio

**Files:**
- Modify: `components/shared/ChatPanel.tsx` (input form at 328-357)
- Modify: `components/rmhtube/ChatPanel.tsx` (input form at 563-591, `inputRef` exists at 95)
- Modify: `components/feed/ProfileEditModal.tsx` (bio textarea at 448-455)

- [ ] **Step 1: shared/ChatPanel**

The input is a raw `<input type="text">` bound to `message`/`setMessage` with no ref. Add imports (Task 3), plus:

```tsx
const inputRef = useRef<HTMLInputElement>(null);
const insertEmoji = useEmojiInsert(inputRef, message, setMessage);
```

Attach `ref={inputRef}` to the input, and add `<EmojiPickerButton direction="up" onSelect={insertEmoji} />` inside the `<form>` between the input and the send button. `useEmojiInsert` accepts `HTMLInputElement` — no changes needed.

- [ ] **Step 2: rmhtube/ChatPanel**

`inputRef` already exists (line 95, `HTMLInputElement`). Add `const insertEmoji = useEmojiInsert(inputRef, message, setMessage);` and place `<EmojiPickerButton direction="up" onSelect={insertEmoji} />` next to the existing GIF-toggle button (576-583).

- [ ] **Step 3: ProfileEditModal bio**

The bio field is a raw `<textarea>` (line 448) with event-style onChange. Add imports, plus:

```tsx
const bioRef = useRef<HTMLTextAreaElement>(null);
const insertBioEmoji = useEmojiInsert(bioRef, bio, setBio);
```

Attach `ref={bioRef}` to the textarea. In the row under the textarea that shows `{bioRemaining}` (line 456-458), wrap counter + button in a flex row:

```tsx
<div className="flex items-center justify-between">
  <EmojiPickerButton direction="down" onSelect={insertBioEmoji} />
  <span className={`text-xs font-mono ${bioRemaining <= 20 ? 'text-site-warning' : 'text-site-text-dim'}`}>
    {bioRemaining}
  </span>
</div>
```

- [ ] **Step 4: Typecheck, commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — expected clean.

```bash
git add components/shared/ChatPanel.tsx components/rmhtube/ChatPanel.tsx components/feed/ProfileEditModal.tsx
git commit -m "Add emoji picker to realtime chats and profile bio"
```

---

### Task 7: Part 1 verification + PR checkpoint

- [ ] **Step 1: Full test run**

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass (including the new insert-at-caret suite).

- [ ] **Step 2: Typecheck + build**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`, then the repo build (`pnpm build` if permitted, else `./node_modules/.bin/vite build`).
Expected: both clean.

- [ ] **Step 3: Browser smoke test**

Start the dev server, then verify: (a) ComposeBox — open picker, insert emoji mid-text, caret lands after emoji, post renders Twemoji; (b) DM — picker opens upward, insert works; (c) shared ChatPanel input; (d) profile bio. Verify the picker bundle loads only when first opened (network tab: emoji-picker chunk absent until click).

- [ ] **Step 4: Review + PR**

Run the `senior-swe-reviewer` agent on the branch diff; address findings. Then create PR 1: "Emoji picker on all compose inputs".

---

# Part 2 — Shortcode autocomplete (PR 2)

### Task 8: Shortcode dataset (gemoji) + lazy loader

**Files:**
- Create: `scripts/generate-emoji-shortcodes.mjs`
- Create: `lib/emoji/shortcodes.json` (generated, committed)
- Create: `lib/emoji/shortcodes.ts`
- Modify: `package.json` (devDependency `gemoji`)

**Interfaces:**
- Produces:
  - `loadShortcodes(): Promise<Record<string, string>>` — lazy dynamic import of the JSON (name → emoji, GitHub shortcode names).
  - `getShortcodesSync(): Record<string, string> | null` — returns the map only once loaded (used for keystroke-time instant conversion).

- [ ] **Step 1: Install gemoji**

Run: `pnpm add -D gemoji`
(If the pnpm wrapper is blocked, add `"gemoji": "^8.1.0"` to `devDependencies` in `package.json` and run `pnpm install` from a permitted context.)

- [ ] **Step 2: Write the generation script**

```js
// scripts/generate-emoji-shortcodes.mjs
// Regenerate lib/emoji/shortcodes.json from the gemoji dataset (GitHub
// shortcode names, e.g. "fire" -> 🔥, including aliases like "+1"/"thumbsup").
import { writeFileSync } from 'node:fs';
import { gemoji } from 'gemoji';

const map = {};
for (const entry of gemoji) {
  for (const name of entry.names) map[name] = entry.emoji;
}

writeFileSync(
  new URL('../lib/emoji/shortcodes.json', import.meta.url),
  JSON.stringify(map),
);
console.log(`Wrote ${Object.keys(map).length} shortcodes`);
```

- [ ] **Step 3: Generate the dataset**

Run: `node scripts/generate-emoji-shortcodes.mjs`
Expected: `Wrote ~1900 shortcodes`; `lib/emoji/shortcodes.json` exists (~60-120KB, single line).

- [ ] **Step 4: Write the loader**

```ts
// lib/emoji/shortcodes.ts
export type ShortcodeMap = Record<string, string>;

let cache: ShortcodeMap | null = null;
let pending: Promise<ShortcodeMap> | null = null;

/** The map if already loaded, else null. Used for synchronous keystroke-time conversion. */
export function getShortcodesSync(): ShortcodeMap | null {
  return cache;
}

/** Lazy-load the shortcode JSON (kept out of the main bundle via dynamic import). */
export function loadShortcodes(): Promise<ShortcodeMap> {
  if (cache) return Promise.resolve(cache);
  pending ??= import('./shortcodes.json').then((mod) => {
    cache = mod.default as ShortcodeMap;
    return cache;
  });
  return pending;
}
```

If `tsc` complains about the JSON import, confirm `resolveJsonModule: true` in `tsconfig.json` (add it if absent).

- [ ] **Step 5: Typecheck + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — expected clean.

```bash
git add scripts/generate-emoji-shortcodes.mjs lib/emoji/shortcodes.json lib/emoji/shortcodes.ts package.json pnpm-lock.yaml
git commit -m "Add emoji shortcode dataset and lazy loader"
```

---

### Task 9: Shortcode matcher (pure) + tests

**Files:**
- Create: `lib/emoji/shortcode-matcher.ts`
- Test: `lib/__tests__/shortcode-matcher.test.ts`

**Interfaces:**
- Produces (all pure; the map is passed in so tests use a tiny fixture):
  - `findShortcodeTrigger(text: string, caret: number): { query: string; start: number } | null` — active `:que` token before caret (`start` = index of the `:`).
  - `searchShortcodes(query: string, map: ShortcodeMap, limit?: number): Array<{ name: string; emoji: string }>` — prefix matches first, then substring; deduped by emoji; default limit 8.
  - `replaceCompletedShortcode(text: string, caret: number, map: ShortcodeMap): { next: string; caret: number } | null` — replaces a just-completed `:name:` before the caret.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/shortcode-matcher.test.ts
import { describe, it, expect } from 'vitest';
import {
  findShortcodeTrigger,
  searchShortcodes,
  replaceCompletedShortcode,
} from '@/lib/emoji/shortcode-matcher';

const MAP = { fire: '🔥', smile: '😄', smiley: '😃', sweat_smile: '😅', '+1': '👍', thumbsup: '👍' };

describe('findShortcodeTrigger', () => {
  it('matches a partial shortcode at the caret', () => {
    expect(findShortcodeTrigger('hello :fi', 9)).toEqual({ query: 'fi', start: 6 });
  });
  it('matches at the start of the text', () => {
    expect(findShortcodeTrigger(':sm', 3)).toEqual({ query: 'sm', start: 0 });
  });
  it('requires 2+ query characters', () => {
    expect(findShortcodeTrigger('hey :f', 6)).toBeNull();
  });
  it('does not fire inside times or URLs', () => {
    expect(findShortcodeTrigger('meet at 10:30', 13)).toBeNull();
    expect(findShortcodeTrigger('https://ex', 10)).toBeNull();
  });
  it('only looks at text before the caret', () => {
    expect(findShortcodeTrigger(':fire later', 3)).toEqual({ query: 'fi', start: 0 });
  });
});

describe('searchShortcodes', () => {
  it('ranks prefix matches before substring matches', () => {
    const names = searchShortcodes('smile', MAP).map((r) => r.name);
    expect(names[0]).toBe('smile');
    expect(names).toContain('sweat_smile');
  });
  it('dedupes aliases pointing at the same emoji', () => {
    const thumbs = searchShortcodes('1', MAP).filter((r) => r.emoji === '👍');
    expect(thumbs).toHaveLength(1);
  });
  it('respects the limit', () => {
    expect(searchShortcodes('s', MAP, 2)).toHaveLength(2);
  });
});

describe('replaceCompletedShortcode', () => {
  it('replaces a completed shortcode at the caret', () => {
    expect(replaceCompletedShortcode('nice :fire:', 11, MAP)).toEqual({
      next: 'nice 🔥',
      caret: 7,
    });
  });
  it('preserves text after the caret', () => {
    expect(replaceCompletedShortcode(':fire: later', 6, MAP)).toEqual({
      next: '🔥 later',
      caret: 2,
    });
  });
  it('is case-insensitive on the name', () => {
    expect(replaceCompletedShortcode(':FIRE:', 6, MAP)?.next).toBe('🔥');
  });
  it('returns null for unknown names and non-shortcodes', () => {
    expect(replaceCompletedShortcode(':notreal:', 9, MAP)).toBeNull();
    expect(replaceCompletedShortcode('10:30:', 6, MAP)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run lib/__tests__/shortcode-matcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/emoji/shortcode-matcher.ts
import type { ShortcodeMap } from './shortcodes';

export interface ShortcodeTrigger {
  query: string;
  /** Index of the ':' in the text. */
  start: number;
}

// A ':' that starts the string or follows whitespace/open bracket, then 2+
// shortcode chars up to the caret. The boundary requirement keeps times
// (10:30) and URLs (https://) from triggering.
const TRIGGER_REGEX = /(?:^|[\s([{]):([a-z0-9_+-]{2,})$/i;
const COMPLETED_REGEX = /(?:^|[\s([{]):([a-z0-9_+-]+):$/i;

export function findShortcodeTrigger(text: string, caret: number): ShortcodeTrigger | null {
  const before = text.slice(0, caret);
  const match = before.match(TRIGGER_REGEX);
  if (!match) return null;
  const query = match[1].toLowerCase();
  return { query, start: caret - query.length - 1 };
}

export function searchShortcodes(
  query: string,
  map: ShortcodeMap,
  limit = 8,
): Array<{ name: string; emoji: string }> {
  const q = query.toLowerCase();
  const hits: Array<{ name: string; emoji: string; isPrefix: boolean }> = [];
  for (const [name, emoji] of Object.entries(map)) {
    if (name.includes(q)) hits.push({ name, emoji, isPrefix: name.startsWith(q) });
  }
  hits.sort(
    (a, b) => Number(b.isPrefix) - Number(a.isPrefix) || a.name.length - b.name.length,
  );
  const seen = new Set<string>();
  const results: Array<{ name: string; emoji: string }> = [];
  for (const hit of hits) {
    if (seen.has(hit.emoji)) continue;
    seen.add(hit.emoji);
    results.push({ name: hit.name, emoji: hit.emoji });
    if (results.length >= limit) break;
  }
  return results;
}

export function replaceCompletedShortcode(
  text: string,
  caret: number,
  map: ShortcodeMap,
): { next: string; caret: number } | null {
  const before = text.slice(0, caret);
  const match = before.match(COMPLETED_REGEX);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const emoji = map[name];
  if (!emoji) return null;
  const start = caret - name.length - 2; // ':' + name + ':'
  const next = text.slice(0, start) + emoji + text.slice(caret);
  return { next, caret: start + emoji.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run lib/__tests__/shortcode-matcher.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/emoji/shortcode-matcher.ts lib/__tests__/shortcode-matcher.test.ts
git commit -m "Add pure shortcode matcher with tests"
```

---

### Task 10: `:` trigger inside MentionTextarea

**Files:**
- Modify: `components/feed/MentionTextarea.tsx`

This gives posts, comments, and group chats shortcode support in one place (they all use MentionTextarea).

**Interfaces:**
- Consumes: `findShortcodeTrigger`, `searchShortcodes`, `replaceCompletedShortcode` (Task 9); `loadShortcodes`, `getShortcodesSync` (Task 8).
- Produces: no API change — `MentionTextarea` props are unchanged.

- [ ] **Step 1: Extend types and trigger detection**

Add imports:

```tsx
import { loadShortcodes, getShortcodesSync } from '@/lib/emoji/shortcodes';
import {
  findShortcodeTrigger,
  searchShortcodes,
  replaceCompletedShortcode,
} from '@/lib/emoji/shortcode-matcher';
```

Change the `Trigger` type (line 31-36) to:

```ts
type Trigger = {
  type: '@' | '#' | ':';
  query: string;
  /** Index of the trigger char ('@', '#', or ':') in the value. */
  start: number;
};
```

Extend `Suggestion` (line 38-40):

```ts
type Suggestion =
  | { kind: 'user'; user: UserSuggestion }
  | { kind: 'tag'; tag: TagSuggestion }
  | { kind: 'emoji'; name: string; emoji: string };
```

In `syncTrigger` (line 98-115), after the existing `TRIGGER_REGEX` check fails, try the emoji trigger before closing:

```ts
const match = before.match(TRIGGER_REGEX);
if (!match) {
  const emojiTrigger = findShortcodeTrigger(el.value, caret);
  if (emojiTrigger) {
    setTrigger({ type: ':', query: emojiTrigger.query, start: emojiTrigger.start });
    const caretCoords = getCaretCoordinates(el, emojiTrigger.start);
    setPosition({ top: caretCoords.top + caretCoords.height + 2, left: caretCoords.left });
    return;
  }
  close();
  return;
}
```

- [ ] **Step 2: Local suggestions for `:` (no fetch)**

In the suggestions effect (line 118-159), branch at the top:

```ts
useEffect(() => {
  if (!trigger) return;
  const seq = ++requestSeq.current;
  if (trigger.type === ':') {
    setLoading(true);
    loadShortcodes().then((map) => {
      if (seq !== requestSeq.current) return;
      setSuggestions(
        searchShortcodes(trigger.query, map).map(({ name, emoji }) => ({
          kind: 'emoji' as const,
          name,
          emoji,
        })),
      );
      setActiveIndex(0);
      setLoading(false);
    });
    return;
  }
  // ... existing @/# fetch logic unchanged ...
}, [trigger, priorityUsers]);
```

- [ ] **Step 3: Apply emoji suggestions**

In `applySuggestion` (line 161-181), extend the `insertion` computation:

```ts
const insertion =
  suggestion.kind === 'user'
    ? `@${suggestion.user.handle ?? suggestion.user.username ?? ''}`
    : suggestion.kind === 'tag'
      ? `#${suggestion.tag.tag}`
      : suggestion.emoji;
```

The rest of `applySuggestion` (replace from `trigger.start` to caret, append a space, restore caret) works unchanged for emoji.

- [ ] **Step 4: Instant conversion + shortcode preload in onChange**

Replace the textarea's `onChange` (line 223-226) with:

```tsx
onChange={(e) => {
  const el = e.target;
  const caret = el.selectionStart ?? el.value.length;
  const map = getShortcodesSync();
  const converted = map ? replaceCompletedShortcode(el.value, caret, map) : null;
  if (converted) {
    onChange(converted.next);
    close();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(converted.caret, converted.caret);
    });
    return;
  }
  onChange(el.value);
  syncTrigger(el);
}}
```

Add an `onFocus` to warm the dataset so `getShortcodesSync()` is ready by the time anyone finishes typing a code:

```tsx
onFocus={(e) => {
  void loadShortcodes();
  props.onFocus?.(e);
}}
```

(Remove `onFocus` from the `{...props}` spread conflict by declaring it after the spread, like `onBlur` already is.)

- [ ] **Step 5: Render emoji suggestion rows**

In the suggestion list render (line 246-309), handle the new kind before the tag branch:

```tsx
if (suggestion.kind === 'emoji') {
  return (
    <button
      key={suggestion.name}
      type="button"
      className={rowClass}
      onMouseEnter={() => setActiveIndex(i)}
      onClick={() => applySuggestion(suggestion)}
    >
      <span className="w-7 h-7 shrink-0 flex items-center justify-center text-lg">
        {suggestion.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-site-text truncate">
          :{highlightMatch(suggestion.name, query)}:
        </span>
      </span>
    </button>
  );
}
```

- [ ] **Step 6: Typecheck + existing tests**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` and `./node_modules/.bin/vitest run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add components/feed/MentionTextarea.tsx
git commit -m "Add :shortcode autocomplete and instant conversion to MentionTextarea"
```

---

### Task 11: useEmojiShortcodes hook for non-Mention inputs

**Files:**
- Create: `lib/emoji/use-emoji-shortcodes.tsx`
- Modify: `components/feed/ConversationView.tsx` (GhostTextArea at 698-718)
- Modify: `components/shared/ChatPanel.tsx` (input form at 328-357)
- Modify: `components/rmhtube/ChatPanel.tsx` (input form at 563-591)

**Interfaces:**
- Consumes: Task 8 loader, Task 9 matchers, Task 1 `insertAtCaret`.
- Produces:

```ts
useEmojiShortcodes(opts: {
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
}): {
  onValueChange: (next: string) => void;  // call instead of onChange in the input's change handler
  onKeyDown: (e: React.KeyboardEvent) => boolean;  // returns true when it consumed the key
  menu: ReactNode;  // render inside a `relative` wrapper around the input
  dismiss: () => void;
}
```

- [ ] **Step 1: Write the hook**

```tsx
// lib/emoji/use-emoji-shortcodes.tsx
'use client';

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { loadShortcodes, getShortcodesSync } from './shortcodes';
import {
  findShortcodeTrigger,
  searchShortcodes,
  replaceCompletedShortcode,
  type ShortcodeTrigger,
} from './shortcode-matcher';

type TextField = HTMLTextAreaElement | HTMLInputElement;

interface UseEmojiShortcodesOptions {
  ref: RefObject<TextField | null>;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Shortcode autocomplete for inputs that don't use MentionTextarea.
 * Call `onValueChange` from the input's change handler (instead of setting
 * state directly), route `onKeyDown` first, and render `menu` inside a
 * position:relative wrapper around the input (it opens above the field).
 */
export function useEmojiShortcodes({ ref, value, onChange }: UseEmojiShortcodesOptions) {
  const [trigger, setTrigger] = useState<ShortcodeTrigger | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; emoji: string }>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const dismiss = useCallback(() => {
    setTrigger(null);
    setSuggestions([]);
    setActiveIndex(0);
  }, []);

  const onValueChange = useCallback(
    (next: string) => {
      const el = ref.current;
      const caret = el?.selectionStart ?? next.length;
      const map = getShortcodesSync();
      const converted = map ? replaceCompletedShortcode(next, caret, map) : null;
      if (converted) {
        onChange(converted.next);
        dismiss();
        requestAnimationFrame(() => {
          el?.focus();
          el?.setSelectionRange(converted.caret, converted.caret);
        });
        return;
      }
      onChange(next);
      const nextTrigger = findShortcodeTrigger(next, caret);
      setTrigger(nextTrigger);
      if (nextTrigger) void loadShortcodes();
    },
    [ref, onChange, dismiss],
  );

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    loadShortcodes().then((map) => {
      if (cancelled) return;
      setSuggestions(searchShortcodes(trigger.query, map));
      setActiveIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [trigger]);

  const apply = useCallback(
    (choice: { name: string; emoji: string }) => {
      const el = ref.current;
      if (!trigger) return;
      const caret = el?.selectionStart ?? value.length;
      const next = `${value.slice(0, trigger.start)}${choice.emoji} ${value.slice(caret)}`;
      onChange(next);
      dismiss();
      const nextCaret = trigger.start + choice.emoji.length + 1;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [ref, trigger, value, onChange, dismiss],
  );

  const isOpen = trigger !== null && suggestions.length > 0;

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        apply(suggestions[activeIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return true;
      }
      return false;
    },
    [isOpen, suggestions, activeIndex, apply, dismiss],
  );

  const menu: ReactNode = isOpen ? (
    <div
      className="absolute bottom-full left-0 z-50 mb-1 w-64 max-h-64 overflow-y-auto bg-site-bg border border-site-border rounded-site shadow-xl py-1"
      onMouseDown={(e) => e.preventDefault()}
    >
      {suggestions.map((s, i) => (
        <button
          key={s.name}
          type="button"
          className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors ${
            i === activeIndex ? 'bg-site-surface' : 'hover:bg-site-surface/60'
          }`}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => apply(s)}
        >
          <span className="w-7 h-7 shrink-0 flex items-center justify-center text-lg">{s.emoji}</span>
          <span className="text-sm text-site-text truncate">:{s.name}:</span>
        </button>
      ))}
    </div>
  ) : null;

  return { onValueChange, onKeyDown, menu, dismiss };
}
```

- [ ] **Step 2: Wire into ConversationView**

```tsx
const shortcodes = useEmojiShortcodes({ ref: inputRef, value: input, onChange: setInput });
```

Change the `GhostTextArea` handlers (698-718):

```tsx
onChange={(e) => {
  shortcodes.onValueChange(e.target.value);
  if (e.target.value.trim()) handleTyping();
  else stopTyping();
}}
onKeyDown={(e) => {
  if (shortcodes.onKeyDown(e)) return;
  handleKeyDown(e);
}}
```

Wrap the `GhostTextArea` in a `relative` container (if the compose row isn't already `relative`) and render `{shortcodes.menu}` inside it, as a sibling of the textarea.

- [ ] **Step 3: Wire into both ChatPanels**

Same pattern in `components/shared/ChatPanel.tsx` and `components/rmhtube/ChatPanel.tsx`: create the hook with each panel's `inputRef`/`message`/`setMessage`, replace the input's `onChange` body with `shortcodes.onValueChange(e.target.value)` (preserving any existing side effects in the handler, e.g. rmhtube's `handleInputChange` logic), add the `onKeyDown` guard before existing key handling, wrap the input in a `relative` container, and render `{shortcodes.menu}`.

- [ ] **Step 4: Typecheck + tests, commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` and `./node_modules/.bin/vitest run` — expected clean.

```bash
git add lib/emoji/use-emoji-shortcodes.tsx components/feed/ConversationView.tsx components/shared/ChatPanel.tsx components/rmhtube/ChatPanel.tsx
git commit -m "Add shortcode autocomplete to DM and realtime chat inputs"
```

---

### Task 12: Part 2 verification + PR checkpoint

- [ ] **Step 1:** `./node_modules/.bin/vitest run` — all pass.
- [ ] **Step 2:** `./node_modules/.bin/tsc -p tsconfig.json --noEmit` + build — clean.
- [ ] **Step 3: Browser smoke test** — in ComposeBox: type `:fi` → dropdown appears with 🔥 first; Enter inserts `🔥 `. Type `:joy:` fully → converts instantly. Verify `10:30` and pasted URLs never trigger. Repeat the dropdown check in a DM (GhostTextArea) and a realtime chat input. Confirm shortcodes JSON loads lazily (network tab).
- [ ] **Step 4:** senior-swe-reviewer on the diff; address findings; PR 2: "Emoji shortcode autocomplete (:fire: → 🔥)".

---

# Part 3 — Emoji reactions on posts, comments, DMs, group messages (PR 3)

### Task 13: Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma` (RMHark at 1263, RMHarkComment at 1337, DirectMessage at 1892, GroupMessage at 2081, User model)
- Create: `prisma/migrations/20260708120000_add_emoji_reactions/migration.sql`

**Interfaces:**
- Produces: prisma delegates `prisma.rMHarkReaction`, `prisma.rMHarkCommentReaction`, `prisma.directMessageReaction`, `prisma.groupMessageReaction`, each with compound unique `(<targetId>, userId, emoji)`.

- [ ] **Step 1: Add the four models to schema.prisma**

Place each next to its target's Like/message model. Note the legacy `rmheetId` naming on the post model:

```prisma
model RMHarkReaction {
  id        String   @id @default(cuid())
  rmheetId  String
  userId    String
  emoji     String   @db.VarChar(32)
  createdAt DateTime @default(now())

  rmhark RMHark @relation(fields: [rmheetId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([rmheetId, userId, emoji])
  @@index([rmheetId])
  @@map("rmheet_reaction")
}

model RMHarkCommentReaction {
  id        String   @id @default(cuid())
  commentId String
  userId    String
  emoji     String   @db.VarChar(32)
  createdAt DateTime @default(now())

  comment RMHarkComment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([commentId, userId, emoji])
  @@index([commentId])
  @@map("rmheet_comment_reaction")
}

model DirectMessageReaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String   @db.VarChar(32)
  createdAt DateTime @default(now())

  message DirectMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("direct_message_reaction")
}

model GroupMessageReaction {
  id        String   @id @default(cuid())
  messageId String
  userId    String
  emoji     String   @db.VarChar(32)
  createdAt DateTime @default(now())

  message GroupMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("group_message_reaction")
}
```

Add back-relations:
- `RMHark`: `reactions RMHarkReaction[]`
- `RMHarkComment`: `reactions RMHarkCommentReaction[]`
- `DirectMessage`: `reactions DirectMessageReaction[]`
- `GroupMessage`: `reactions GroupMessageReaction[]`
- `User`: `rmharkReactions RMHarkReaction[]`, `rmharkCommentReactions RMHarkCommentReaction[]`, `directMessageReactions DirectMessageReaction[]`, `groupMessageReactions GroupMessageReaction[]`

- [ ] **Step 2: Create the migration**

Preferred: `./node_modules/.bin/prisma migrate dev --name add_emoji_reactions` (requires a dev `DATABASE_URL`), then rename the generated folder to the repo's fixed-suffix convention (`20260708120000_add_emoji_reactions`) if it differs. If no dev DB is reachable, write the SQL by hand:

```sql
-- prisma/migrations/20260708120000_add_emoji_reactions/migration.sql
CREATE TABLE "rmheet_reaction" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmheet_reaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rmheet_reaction_rmheetId_idx" ON "rmheet_reaction"("rmheetId");
CREATE UNIQUE INDEX "rmheet_reaction_rmheetId_userId_emoji_key" ON "rmheet_reaction"("rmheetId", "userId", "emoji");
ALTER TABLE "rmheet_reaction" ADD CONSTRAINT "rmheet_reaction_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmheet_reaction" ADD CONSTRAINT "rmheet_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "rmheet_comment_reaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmheet_comment_reaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rmheet_comment_reaction_commentId_idx" ON "rmheet_comment_reaction"("commentId");
CREATE UNIQUE INDEX "rmheet_comment_reaction_commentId_userId_emoji_key" ON "rmheet_comment_reaction"("commentId", "userId", "emoji");
ALTER TABLE "rmheet_comment_reaction" ADD CONSTRAINT "rmheet_comment_reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "rmheet_comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmheet_comment_reaction" ADD CONSTRAINT "rmheet_comment_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "direct_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_message_reaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "direct_message_reaction_messageId_idx" ON "direct_message_reaction"("messageId");
CREATE UNIQUE INDEX "direct_message_reaction_messageId_userId_emoji_key" ON "direct_message_reaction"("messageId", "userId", "emoji");
ALTER TABLE "direct_message_reaction" ADD CONSTRAINT "direct_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_message_reaction" ADD CONSTRAINT "direct_message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_message_reaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_message_reaction_messageId_idx" ON "group_message_reaction"("messageId");
CREATE UNIQUE INDEX "group_message_reaction_messageId_userId_emoji_key" ON "group_message_reaction"("messageId", "userId", "emoji");
ALTER TABLE "group_message_reaction" ADD CONSTRAINT "group_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "group_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_message_reaction" ADD CONSTRAINT "group_message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Before committing hand-written SQL, verify the referenced table names (`"rmheet"`, `"rmheet_comment"`, `"direct_message"`, `"group_message"`, `"user"`) against `@@map` values in the schema and column types against an existing migration.

- [ ] **Step 3: Regenerate the client**

Run: `./node_modules/.bin/prisma generate`
Expected: success; `prisma.rMHarkReaction` etc. now typecheck.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260708120000_add_emoji_reactions/migration.sql
git commit -m "Add emoji reaction tables for posts, comments, and messages"
```

---

### Task 14: Reactions pure library + tests

**Files:**
- Create: `lib/social/reactions.ts` (pure — importable client-side and in tests without prisma)
- Test: `lib/__tests__/reactions.test.ts`

**Interfaces:**
- Produces:
  - `interface ReactionSummary { emoji: string; count: number; reactedByMe: boolean }`
  - `interface ReactionRow { emoji: string; userId: string }`
  - `groupReactions(rows: ReactionRow[], viewerId: string | null): ReactionSummary[]` — grouped, sorted by count desc.
  - `applyReactionToggle(reactions: ReactionSummary[], emoji: string): ReactionSummary[]` — optimistic client-side toggle.
  - `isValidReactionEmoji(emoji: string): boolean` — single RGI emoji, ≤32 UTF-16 units.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/reactions.test.ts
import { describe, it, expect } from 'vitest';
import {
  groupReactions,
  applyReactionToggle,
  isValidReactionEmoji,
} from '@/lib/social/reactions';

describe('groupReactions', () => {
  it('groups rows by emoji with counts, sorted by count desc', () => {
    const rows = [
      { emoji: '🔥', userId: 'a' },
      { emoji: '❤️', userId: 'a' },
      { emoji: '🔥', userId: 'b' },
    ];
    expect(groupReactions(rows, null)).toEqual([
      { emoji: '🔥', count: 2, reactedByMe: false },
      { emoji: '❤️', count: 1, reactedByMe: false },
    ]);
  });

  it('marks reactedByMe for the viewer', () => {
    const rows = [{ emoji: '🔥', userId: 'me' }, { emoji: '🔥', userId: 'other' }];
    expect(groupReactions(rows, 'me')[0].reactedByMe).toBe(true);
    expect(groupReactions(rows, 'other2')[0].reactedByMe).toBe(false);
  });

  it('returns [] for no rows', () => {
    expect(groupReactions([], 'me')).toEqual([]);
  });
});

describe('applyReactionToggle', () => {
  it('adds a new emoji as reactedByMe with count 1', () => {
    expect(applyReactionToggle([], '🔥')).toEqual([{ emoji: '🔥', count: 1, reactedByMe: true }]);
  });

  it('increments an existing emoji I have not reacted with', () => {
    const input = [{ emoji: '🔥', count: 2, reactedByMe: false }];
    expect(applyReactionToggle(input, '🔥')).toEqual([{ emoji: '🔥', count: 3, reactedByMe: true }]);
  });

  it('decrements and unsets when I had reacted', () => {
    const input = [{ emoji: '🔥', count: 2, reactedByMe: true }];
    expect(applyReactionToggle(input, '🔥')).toEqual([{ emoji: '🔥', count: 1, reactedByMe: false }]);
  });

  it('removes the chip when my toggle-off empties it', () => {
    const input = [{ emoji: '🔥', count: 1, reactedByMe: true }];
    expect(applyReactionToggle(input, '🔥')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [{ emoji: '🔥', count: 1, reactedByMe: false }];
    applyReactionToggle(input, '🔥');
    expect(input[0].count).toBe(1);
  });
});

describe('isValidReactionEmoji', () => {
  it('accepts simple emoji, ZWJ sequences, flags, and keycaps', () => {
    expect(isValidReactionEmoji('🔥')).toBe(true);
    expect(isValidReactionEmoji('❤️')).toBe(true);
    expect(isValidReactionEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isValidReactionEmoji('🇮🇩')).toBe(true);
    expect(isValidReactionEmoji('1️⃣')).toBe(true);
    expect(isValidReactionEmoji('👍🏽')).toBe(true);
  });

  it('rejects empty, plain text, multi-emoji, and oversized input', () => {
    expect(isValidReactionEmoji('')).toBe(false);
    expect(isValidReactionEmoji('abc')).toBe(false);
    expect(isValidReactionEmoji('🔥🔥')).toBe(false);
    expect(isValidReactionEmoji('a🔥')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./node_modules/.bin/vitest run lib/__tests__/reactions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// lib/social/reactions.ts
// Pure reaction helpers shared by server payload mapping and client
// optimistic updates. No prisma imports — keep this file client-safe.

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface ReactionRow {
  emoji: string;
  userId: string;
}

export const MAX_REACTION_EMOJI_LENGTH = 32;

// \p{RGI_Emoji} (property-of-strings, needs the v flag) matches exactly one
// well-formed emoji including ZWJ families, flags, keycaps, and skin tones.
// Constructed lazily via new RegExp so bundlers/older engines that can't
// parse a v-flag literal don't fail at module load; falls back to a looser
// pictographic check where the v flag is unsupported.
let rgiEmojiRegex: RegExp | null | undefined;
function getRgiEmojiRegex(): RegExp | null {
  if (rgiEmojiRegex === undefined) {
    try {
      rgiEmojiRegex = new RegExp(String.raw`^\p{RGI_Emoji}$`, 'v');
    } catch {
      rgiEmojiRegex = null;
    }
  }
  return rgiEmojiRegex;
}

const FALLBACK_EMOJI_REGEX =
  /^[\p{Extended_Pictographic}\p{Emoji_Component}\u{FE0F}\u{200D}]+$/u;

export function isValidReactionEmoji(emoji: string): boolean {
  if (!emoji || emoji.length > MAX_REACTION_EMOJI_LENGTH) return false;
  const rgi = getRgiEmojiRegex();
  if (rgi) return rgi.test(emoji);
  return FALLBACK_EMOJI_REGEX.test(emoji);
}

export function groupReactions(
  rows: ReactionRow[],
  viewerId: string | null,
): ReactionSummary[] {
  const byEmoji = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const row of rows) {
    const entry = byEmoji.get(row.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (viewerId !== null && row.userId === viewerId) entry.reactedByMe = true;
    byEmoji.set(row.emoji, entry);
  }
  return [...byEmoji.entries()]
    .map(([emoji, entry]) => ({ emoji, ...entry }))
    .sort((a, b) => b.count - a.count);
}

/** Optimistically toggle the viewer's reaction in a grouped summary list. */
export function applyReactionToggle(
  reactions: ReactionSummary[],
  emoji: string,
): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) {
    return [...reactions, { emoji, count: 1, reactedByMe: true }];
  }
  return reactions
    .map((r) => {
      if (r.emoji !== emoji) return r;
      return r.reactedByMe
        ? { ...r, count: r.count - 1, reactedByMe: false }
        : { ...r, count: r.count + 1, reactedByMe: true };
    })
    .filter((r) => r.count > 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./node_modules/.bin/vitest run lib/__tests__/reactions.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/social/reactions.ts lib/__tests__/reactions.test.ts
git commit -m "Add pure reaction grouping, toggle, and validation helpers"
```

---

### Task 15: Server toggle functions + API routes

**Files:**
- Create: `lib/social/reactions.server.ts`
- Create: `app/routes/api/rmharks/$id/react.ts`
- Create: `app/routes/api/comments/$id/react.ts`
- Create: `app/routes/api/messages/$conversationId/react.ts`
- Create: `app/routes/api/group-chats/$id/react.ts`
- Modify: `app/routes/routeTree.gen.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `isValidReactionEmoji` (Task 14), prisma delegates (Task 13).
- Produces: `togglePostReaction / toggleCommentReaction / toggleDmReaction / toggleGroupMessageReaction`, each `(userId: string, targetId: string, emoji: string) => Promise<{ found: boolean; reacted: boolean; rows: ReactionRow[] }>` where `rows` is the target's fresh reaction rows after the toggle (used for SSE fan-out and responses).

**Pattern to mirror:** `app/routes/api/rmharks/$id/like.ts` (createFileRoute + `server.handlers`, `auth.api.getSession`, `rateLimit`) and `lib/social/engagement.server.ts` (`togglePostLike`). Open both before writing.

- [ ] **Step 1: Write reactions.server.ts**

```ts
// lib/social/reactions.server.ts
import { prisma } from '@/lib/prisma.server';
import type { ReactionRow } from '@/lib/social/reactions';

interface ToggleResult {
  found: boolean;
  reacted: boolean;
  rows: ReactionRow[];
}

const ROW_SELECT = { emoji: true, userId: true } as const;

export async function togglePostReaction(
  userId: string,
  postId: string,
  emoji: string,
): Promise<ToggleResult> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.rMHarkReaction.findUnique({
    where: { rmheetId_userId_emoji: { rmheetId: postId, userId, emoji } },
  });
  if (existing) {
    await prisma.rMHarkReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.rMHarkReaction.create({ data: { rmheetId: postId, userId, emoji } });
  }
  const rows = await prisma.rMHarkReaction.findMany({
    where: { rmheetId: postId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows };
}

export async function toggleCommentReaction(
  userId: string,
  commentId: string,
  emoji: string,
): Promise<ToggleResult> {
  const comment = await prisma.rMHarkComment.findUnique({
    where: { id: commentId },
    select: { id: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.rMHarkCommentReaction.findUnique({
    where: { commentId_userId_emoji: { commentId, userId, emoji } },
  });
  if (existing) {
    await prisma.rMHarkCommentReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.rMHarkCommentReaction.create({ data: { commentId, userId, emoji } });
  }
  const rows = await prisma.rMHarkCommentReaction.findMany({
    where: { commentId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows };
}

export async function toggleDmReaction(
  userId: string,
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { conversationId?: string; senderId?: string }> {
  const message = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true },
  });
  if (!message) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.directMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
  if (existing) {
    await prisma.directMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.directMessageReaction.create({ data: { messageId, userId, emoji } });
  }
  const rows = await prisma.directMessageReaction.findMany({
    where: { messageId },
    select: ROW_SELECT,
  });
  return {
    found: true,
    reacted: !existing,
    rows,
    conversationId: message.conversationId,
    senderId: message.senderId,
  };
}

export async function toggleGroupMessageReaction(
  userId: string,
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { groupId?: string }> {
  const message = await prisma.groupMessage.findUnique({
    where: { id: messageId },
    select: { id: true, groupId: true },
  });
  if (!message) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.groupMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
  if (existing) {
    await prisma.groupMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.groupMessageReaction.create({ data: { messageId, userId, emoji } });
  }
  const rows = await prisma.groupMessageReaction.findMany({
    where: { messageId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows, groupId: message.groupId };
}
```

Note: create/delete can race with a concurrent duplicate request; wrap the create in a try/catch that treats a P2002 unique-violation as "already reacted" (fetch rows and return `reacted: true`) if the reviewer flags it — otherwise the unique index already guarantees no duplicate data.

- [ ] **Step 2: Post reaction route**

Copy the structure of `app/routes/api/rmharks/$id/like.ts` verbatim (imports, `createFileRoute('/api/rmharks/$id/react')`, session lookup, IP extraction) and swap the POST body:

```ts
// inside POST handler, after auth (userId) and rate limit:
// rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'reaction' })
const body = await request.json().catch(() => null);
const parsed = z.object({ emoji: z.string().min(1).max(32) }).safeParse(body);
if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
  return Response.json({ error: 'Invalid emoji' }, { status: 400 });
}
const result = await togglePostReaction(userId, id, parsed.data.emoji);
if (!result.found) return Response.json({ error: 'Not found' }, { status: 404 });
return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
```

No GET handler needed (reactions ship with the post payload, Task 16).

- [ ] **Step 3: Comment reaction route**

`app/routes/api/comments/$id/react.ts` — identical shape, calling `toggleCommentReaction`.

- [ ] **Step 4: DM reaction route**

`app/routes/api/messages/$conversationId/react.ts` — POST body `{ messageId: z.string(), emoji: z.string().min(1).max(32) }`. **Copy the participant-check block verbatim from the GET handler in `app/routes/api/messages/$conversationId.ts` (lines 28-60)** — the viewer must be a participant of `conversationId`. Then verify `result.conversationId === conversationId` (403 otherwise), and after a successful toggle, notify the other participant over SSE using the same `notifyUser` import/pattern as that file's POST handler (lines 113-253):

```ts
notifyUser(otherParticipantId, {
  type: 'message-reaction',
  conversationId,
  messageId: parsed.data.messageId,
  reactions: result.rows,
});
```

Response: `{ success: true, reacted, reactions: result.rows }`.

- [ ] **Step 5: Group reaction route**

`app/routes/api/group-chats/$id/react.ts` — POST body `{ messageId, emoji }`. **Copy the membership-check block from `app/routes/api/group-chats/$id/messages.ts` (GET, lines 32-62).** Verify `result.groupId === id`. Publish the update over the group SSE stream using the same publisher module as `publishGroupMessage` in that file — add/emit an event shaped:

```ts
{ type: 'reaction', messageId: parsed.data.messageId, reactions: result.rows }
```

(If the publisher only supports message payloads, add a `publishGroupEvent(groupId, payload)` alongside `publishGroupMessage` in the same module, reusing its channel plumbing.)

- [ ] **Step 6: Regenerate route tree**

Run the dev server or build once so `app/routes/routeTree.gen.ts` picks up the four new routes; confirm they appear.

- [ ] **Step 7: Typecheck + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — clean.

```bash
git add lib/social/reactions.server.ts app/routes/api/rmharks/\$id/react.ts app/routes/api/comments/\$id/react.ts app/routes/api/messages/\$conversationId/react.ts app/routes/api/group-chats/\$id/react.ts app/routes/routeTree.gen.ts
git commit -m "Add reaction toggle server functions and API routes"
```

---

### Task 16: Include reactions in fetch payloads

**Files:**
- Modify: `lib/feed/map-feed-item.server.ts` (`rmharkInclude` at 41-65, `mapRmharkToFeedItem` at 81-114)
- Modify: the `FeedItem` type (follow `mapRmharkToFeedItem`'s return type to its definition)
- Modify: the comment list endpoint (search for `rMHarkComment.findMany` under `app/routes/api` / `lib`) and the comment type consumed by `CommentItem`
- Modify: `app/routes/api/messages/$conversationId.ts` (GET select at 62-76, POST payload)
- Modify: `lib/group-chat/serialize.server.ts` (`groupMessageSelect` at 10-19)

**Interfaces:**
- Produces: `FeedItem.reactions: ReactionSummary[]`; comment payloads gain `reactions: ReactionSummary[]`; DM/group message payloads gain raw `reactions: ReactionRow[]` (grouped client-side so SSE updates stay cheap).

- [ ] **Step 1: Feed posts**

In `rmharkInclude`, add (for all viewers, not just signed-in):

```ts
reactions: { select: { emoji: true, userId: true } },
```

In `mapRmharkToFeedItem`, add to the returned object:

```ts
reactions: groupReactions(r.reactions ?? [], viewerId),
```

importing `groupReactions` from `@/lib/social/reactions`. Add `reactions: ReactionSummary[]` to the `FeedItem` type. Check every other construction site of `FeedItem` the typecheck flags and default them to `[]`.

- [ ] **Step 2: Comments**

In the comment list query, add the same `reactions: { select: { emoji: true, userId: true } }` include, map through `groupReactions(rows, viewerId)`, and add `reactions: ReactionSummary[]` to the comment DTO type used by `CommentItem`.

- [ ] **Step 3: DMs**

In the GET select (lines 62-76) add `reactions: { select: { emoji: true, userId: true } }` and pass the rows through in the mapped response objects. In the POST handler's created-message payload, add `reactions: []`.

- [ ] **Step 4: Group messages**

Add `reactions: { select: { emoji: true, userId: true } }` to `groupMessageSelect` and pass through in `serializeGroupMessages`.

- [ ] **Step 5: Typecheck + tests + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` and `./node_modules/.bin/vitest run` — clean.

```bash
git add -A
git commit -m "Include reactions in post, comment, and message payloads"
```

---

### Task 17: Reaction UI components (menu, chips, trigger hook)

**Files:**
- Create: `components/shared/ReactionMenu.tsx`
- Create: `components/shared/ReactionChips.tsx`
- Create: `lib/emoji/use-reaction-trigger.ts`

**Interfaces:**
- Consumes: `CHAT_REACTION_EMOJIS` (`lib/shared/chat-constants.ts`), `EmojiPickerPanel` (Task 2), `ReactionSummary` (Task 14).
- Produces:
  - `ReactionMenu`: `{ x: number; y: number; onSelect: (emoji: string) => void; onClose: () => void }` — portal, fixed at (x, y), quick row + "+" to full picker.
  - `ReactionChips`: `{ reactions: ReactionSummary[]; onToggle: (emoji: string) => void; className?: string }`.
  - `useReactionTrigger(onOpen: (x: number, y: number) => void)` → `{ onContextMenu, onTouchStart, onTouchMove, onTouchEnd }` spreadable handlers.

- [ ] **Step 1: useReactionTrigger**

```ts
// lib/emoji/use-reaction-trigger.ts
import { useRef } from 'react';
import type React from 'react';

const LONG_PRESS_MS = 500;
const DEBOUNCE_MS = 300;

/**
 * Right-click (desktop) / long-press (touch) trigger for the reaction menu.
 * Android fires contextmenu on long-press natively; the touch timer covers
 * iOS Safari. A short debounce prevents double-opens when both fire.
 */
export function useReactionTrigger(onOpen: (x: number, y: number) => void) {
  const timer = useRef<number | null>(null);
  const lastOpen = useRef(0);

  const open = (x: number, y: number) => {
    const now = performance.now();
    if (now - lastOpen.current < DEBOUNCE_MS) return;
    lastOpen.current = now;
    onOpen(x, y);
  };

  const clear = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      open(e.clientX, e.clientY);
    },
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      clear();
      const { clientX, clientY } = touch;
      timer.current = window.setTimeout(() => open(clientX, clientY), LONG_PRESS_MS);
    },
    onTouchMove: clear,
    onTouchEnd: clear,
  };
}
```

- [ ] **Step 2: ReactionMenu**

```tsx
// components/shared/ReactionMenu.tsx
'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CHAT_REACTION_EMOJIS } from '@/lib/shared/chat-constants';

const EmojiPickerPanel = lazy(() => import('./EmojiPickerPanel'));

interface ReactionMenuProps {
  x: number;
  y: number;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionMenu({ x, y, onSelect, onClose }: ReactionMenuProps) {
  const { t } = useTranslation('feed');
  const [showFull, setShowFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const width = showFull ? 300 : 280;
  const height = showFull ? 380 : 52;
  const style = {
    top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
  };

  return createPortal(
    <div ref={rootRef} className="fixed z-[100]" style={style}>
      {showFull ? (
        <Suspense
          fallback={
            <div className="w-[300px] h-[360px] rounded-site border border-site-border bg-site-bg animate-pulse" />
          }
        >
          <EmojiPickerPanel
            onSelect={(emoji) => {
              onSelect(emoji);
              onClose();
            }}
          />
        </Suspense>
      ) : (
        <div className="flex items-center gap-1 rounded-full border border-site-border bg-site-bg px-2 py-1.5 shadow-xl">
          {CHAT_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-lg leading-none hover:scale-125 transition-transform"
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            aria-label={t('reaction-more', { defaultValue: 'More emoji' })}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-site-surface text-site-text-dim hover:text-site-text transition-colors"
            onClick={() => setShowFull(true)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 3: ReactionChips**

```tsx
// components/shared/ReactionChips.tsx
'use client';

import type { ReactionSummary } from '@/lib/social/reactions';

interface ReactionChipsProps {
  reactions: ReactionSummary[];
  onToggle: (emoji: string) => void;
  className?: string;
}

export function ReactionChips({ reactions, onToggle, className = '' }: ReactionChipsProps) {
  if (reactions.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.emoji);
          }}
          aria-pressed={r.reactedByMe}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
            r.reactedByMe
              ? 'border-site-accent bg-site-accent/15 text-site-accent'
              : 'border-site-border bg-site-surface/60 text-site-text-dim hover:border-site-text-dim'
          }`}
        >
          <span className="text-sm leading-none">{r.emoji}</span>
          <span className="font-mono">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — clean.

```bash
git add components/shared/ReactionMenu.tsx components/shared/ReactionChips.tsx lib/emoji/use-reaction-trigger.ts
git commit -m "Add reaction menu, chips, and right-click/long-press trigger"
```

---

### Task 18: Wire reactions into the feed (posts + comments)

**Files:**
- Modify: `components/feed/RMHarkCard.tsx` (card root at 288-297, actions at 607)
- Modify: `components/feed/CommentItem.tsx` (comment root at 228, actions row 319-366)

- [ ] **Step 1: RMHarkCard**

Add state + handlers (skip entirely when `item.pending` or `item.deletedAt`):

```tsx
const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number } | null>(null);
const reactionTrigger = useReactionTrigger((x, y) => setReactionMenu({ x, y }));

const toggleReaction = async (emoji: string) => {
  const prev = item.reactions;
  updateItem(item.id, { reactions: applyReactionToggle(item.reactions, emoji) });
  try {
    const res = await fetch(`/api/rmharks/${item.id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error('react failed');
  } catch {
    updateItem(item.id, { reactions: prev });
  }
};
```

`updateItem` is the same feed-store updater `RMHarkActions` uses for optimistic likes (see `components/feed/RMHarkActions.tsx:57-65`) — import/access it the same way. Spread the trigger onto the card root div (line 289):

```tsx
<div
  {...(item.pending || item.deletedAt ? {} : reactionTrigger)}
  className={...existing...}
  ...
>
```

Render chips between the content block and `<RMHarkActions />` (line ~607):

```tsx
{!item.deletedAt && (
  <ReactionChips reactions={item.reactions} onToggle={toggleReaction} className="mt-2" />
)}
```

And the menu at the end of the card:

```tsx
{reactionMenu && (
  <ReactionMenu
    x={reactionMenu.x}
    y={reactionMenu.y}
    onSelect={toggleReaction}
    onClose={() => setReactionMenu(null)}
  />
)}
```

Note: right-click on a post card now opens reactions instead of the native menu — that is the designed behavior; text selection inside the card still allows native copy via keyboard.

- [ ] **Step 2: CommentItem**

Same pattern with local state (comments hold local `liked`/`likeCount` state already, lines 83-84):

```tsx
const [reactions, setReactions] = useState<ReactionSummary[]>(comment.reactions ?? []);
const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number } | null>(null);
const reactionTrigger = useReactionTrigger((x, y) => setReactionMenu({ x, y }));

const toggleReaction = async (emoji: string) => {
  const prev = reactions;
  setReactions(applyReactionToggle(prev, emoji));
  try {
    const res = await fetch(`/api/comments/${comment.id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) throw new Error('react failed');
  } catch {
    setReactions(prev);
  }
};
```

Spread `{...reactionTrigger}` on the comment root (`<div className="py-3">`, line 228), render `<ReactionChips reactions={reactions} onToggle={toggleReaction} className="mt-1.5" />` between the content (line 312) and the actions row (line 319), and the `ReactionMenu` conditional at the end.

- [ ] **Step 3: Typecheck + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — clean.

```bash
git add components/feed/RMHarkCard.tsx components/feed/CommentItem.tsx
git commit -m "Wire emoji reactions into feed posts and comments"
```

---

### Task 19: Wire reactions into DMs and group chats (incl. SSE)

**Files:**
- Modify: `components/feed/ConversationView.tsx` (Message type, bubble at 578-608, SSE handler at ~252)
- Modify: `components/feed/GroupChatView.tsx` (Msg type, bubble at 342-369, SSE handler at ~155)

- [ ] **Step 1: ConversationView**

Extend the local `Message` type with `reactions?: ReactionRow[]`. Add per-view state:

```tsx
const [reactionMenu, setReactionMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
```

Toggle (optimistic on raw rows — add/remove the viewer's row):

```tsx
const toggleReaction = async (messageId: string, emoji: string) => {
  const myId = session.user.id;
  setMessages((prev) =>
    prev.map((m) => {
      if (m.id !== messageId) return m;
      const rows = m.reactions ?? [];
      const mine = rows.some((r) => r.emoji === emoji && r.userId === myId);
      return {
        ...m,
        reactions: mine
          ? rows.filter((r) => !(r.emoji === emoji && r.userId === myId))
          : [...rows, { emoji, userId: myId }],
      };
    }),
  );
  await fetch(`/api/messages/${encodeURIComponent(conversationId)}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, emoji }),
  }).catch(() => {});
};
```

Per-message trigger: `useReactionTrigger` is a hook, so it can't be called per message in the map — instead attach `onContextMenu`/touch handlers inline on the bubble div (line 578):

```tsx
onContextMenu={(e) => {
  e.preventDefault();
  setReactionMenu({ x: e.clientX, y: e.clientY, messageId: msg.id });
}}
```

plus a small shared long-press: store `touchTimer = useRef<number | null>(null)` at component level and set `onTouchStart={(e) => { const t = e.touches[0]; touchTimer.current = window.setTimeout(() => setReactionMenu({ x: t.clientX, y: t.clientY, messageId: msg.id }), 500); }}` with `onTouchMove`/`onTouchEnd` clearing it.

Chips under the bubble (~line 607), grouping rows client-side:

```tsx
{(msg.reactions?.length ?? 0) > 0 && (
  <ReactionChips
    reactions={groupReactions(msg.reactions ?? [], session.user.id)}
    onToggle={(emoji) => toggleReaction(msg.id, emoji)}
    className={`mt-1 ${isSelf ? 'justify-end' : ''}`}
  />
)}
```

Menu render (once, at component root):

```tsx
{reactionMenu && (
  <ReactionMenu
    x={reactionMenu.x}
    y={reactionMenu.y}
    onSelect={(emoji) => toggleReaction(reactionMenu.messageId, emoji)}
    onClose={() => setReactionMenu(null)}
  />
)}
```

SSE: in the existing `EventSource` message handler (~line 252), add a case for `type === 'message-reaction'`:

```ts
if (data.type === 'message-reaction' && data.conversationId === conversationId) {
  setMessages((prev) =>
    prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)),
  );
  return;
}
```

- [ ] **Step 2: GroupChatView**

Same shape: extend `Msg` with `reactions?: ReactionRow[]`, same `reactionMenu` state, same inline `onContextMenu`/long-press on the message bubble (content div at 351-358), same optimistic row toggle POSTing to `/api/group-chats/${group.id}/react`, chips under the bubble grouped via `groupReactions(rows, currentUserId)`, and an SSE case for `type === 'reaction'` in the group stream handler (~line 155) updating the matching message's rows.

- [ ] **Step 3: Typecheck + commit**

Run: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — clean.

```bash
git add components/feed/ConversationView.tsx components/feed/GroupChatView.tsx
git commit -m "Wire emoji reactions into DMs and group chats with SSE updates"
```

---

### Task 20: Part 3 verification + PR checkpoint

- [ ] **Step 1: Tests + typecheck + build** — `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`, build. All clean.
- [ ] **Step 2: Apply the migration to the dev DB** (`./node_modules/.bin/prisma migrate dev` or the repo's `db:migrate` flow) and confirm the four tables exist.
- [ ] **Step 3: Browser end-to-end** — (a) right-click a feed post → quick row appears at cursor; pick 🔥 → chip appears instantly; refresh → persists; (b) "+" opens full picker, pick an arbitrary emoji; (c) toggle off via chip click; (d) comment reactions; (e) DM: react in one browser session, second session sees the chip via SSE without reload; (f) group chat same; (g) long-press on a touch device/emulator opens the menu; (h) native right-click is NOT hijacked outside posts/messages.
- [ ] **Step 4:** senior-swe-reviewer on the diff; address findings; PR 3: "Emoji reactions on posts, comments, DMs, and group chats".

---

## Self-review checklist (run after writing, before execution)

- Spec coverage: picker on all 8+ surfaces (Tasks 3-6) ✓; shortcode autocomplete + instant convert on MentionTextarea/GhostTextArea/chat inputs (Tasks 10-11) ✓; reactions with right-click/long-press, quick set + full picker, chips, per-target tables, payload includes, SSE (Tasks 13-19) ✓; out-of-scope items (notifications, grapheme counts, realtime-chat migration) intentionally absent ✓.
- Known intentional deviation: "who reacted" hover tooltips are deferred — counts + own-state only in v1 (payloads carry userIds for messages, so DM/group tooltips can be added client-side later). Flag in the PR description.
