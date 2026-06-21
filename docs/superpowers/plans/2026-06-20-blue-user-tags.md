# Blue User Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `@mention` user tags in posts in blue so they stand out from body text.

**Architecture:** Render-only change. All post text flows through one component, `components/feed/RMHarkContent.tsx`, which tokenizes text and styles `@mentions`. Switch the mention className from the purple site accent to the same blue already used for hashtags.

**Tech Stack:** React, TanStack Router, Tailwind CSS v4.

## Global Constraints

- Tailwind CSS v4, utility classes inline in `className` (no config file).
- No new theme tokens; reuse existing `text-sky-400` / `text-sky-300`.
- Only mentions change; URLs keep `text-site-accent`.

---

### Task 1: Color mentions blue

**Files:**
- Modify: `components/feed/RMHarkContent.tsx:35`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (visual change only).

- [ ] **Step 1: Change the mention className**

In the `@mention` branch (the `if (/^@\w+$/.test(part))` block), change the `<Link>` className from:

```tsx
className="text-site-accent hover:underline"
```

to (matching the hashtag styling on the adjacent branch):

```tsx
className="text-sky-400 hover:text-sky-300 hover:underline"
```

- [ ] **Step 2: Verify it compiles / lints**

Run: `npx tsc --noEmit` (or the project's typecheck/lint command)
Expected: no new errors. This is a className string change, so types are unaffected.

- [ ] **Step 3: Visual verification**

Render a post containing an `@handle` (feed card, post detail, or comment) and confirm the mention shows blue, matching hashtags, with hover still working. No unit test — a Tailwind class swap has no meaningful assertable logic (per spec).

- [ ] **Step 4: Commit**

```bash
git add components/feed/RMHarkContent.tsx
git commit -m "feat(feed): render @mention user tags in blue"
```

---

## Self-Review

- **Spec coverage:** Spec's single change (mention className → blue) is covered by Task 1. ✓
- **Placeholder scan:** None. ✓
- **Type consistency:** No types involved; className string only. ✓
