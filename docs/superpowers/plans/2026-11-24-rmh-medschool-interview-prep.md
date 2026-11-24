# RMH Med Schools: interview prep (roadmap item 6)

## Scope

Three things for a member preparing for interviews: a practice mode with a timer (on a school's Interviews tab and on
a page of general questions), a curated set of general, non-school questions organised by program, and an AI generator
that proposes follow-up questions an interviewer might ask. The school's stored questions and profiles already exist
and are unchanged.

## Where it lives

- **Practice mode** is one presentational component (`ui/practice/PracticePanel.tsx`) used in two places: a fourth
  sub-tab "Practice" of the school's Interviews tab (`?itab=practice`, questions from the school's stored list) and
  `/rmh-medschool/practice` (the general set).
- **Page.** `/rmh-medschool/practice`, a `_site` page like Ask: noindex, in `EXCLUDED_ROUTES`, so no OG card is required.
  Practice itself needs no account, so it is readable signed out; only the follow-up generator asks for sign-in. The
  route file is thin (`definePage` and the component, no loader, no `validateSearch`).
- **Follow-ups endpoint.** `POST /api/medschools/me/interview/followups`, contract `postMedInterviewFollowupsApi`,
  bound with `implement()`, registered with `apiRoute`, `ai` policy at six a minute per member (admins exempt), no
  `cache`.

## Decisions

- **General questions are a static module, not a table.** The roadmap row says "needs a general-question table". Nothing
  about these questions is per user or per school, they change only when RMH edits the wording, and a code change is
  already how that is reviewed, so `engine/general-questions.ts` (versioned, typed data) is the simpler equivalent. Its
  zod shape lives in `engine/general-questions.schema.ts` so the page bundle does not ship zod; the test parses the data
  with it. Each question is `{ id, program: 'REG' | 'PHD', category, text }`, written for RMH, none copied from a prep
  site. Text goes through `t('gq-<id>', { defaultValue })` so every locale can translate it.
- **Notes never leave the page.** They are component state: not sent (the generator takes them in the request body, in
  memory, for that one call), not stored on the server, not in localStorage (so nothing to register in
  `lib/device-data/registry.ts`). Changing the question clears them.
- **Timer.** A pure reducer (`engine/practice.ts`): idle, running, paused, done; 1, 2 or 3 minutes; start, pause, reset,
  tick. The component runs a 1 s `setInterval` only while running, cleared on pause, finish and unmount. No animation, no
  `requestAnimationFrame`; it starts only on the member's press (R5).
- **Picking.** Random (never the same question twice in a row when there is another) or next (wraps). Both pure, with an
  injected random source.
- **Generator reuses the Q&A gates, builds none.** `admitQuestion` from `api/qa/budget.server.ts` runs the shared monthly
  gate (fail closed), the member's own allowance, and the atomic daily reservation, so one generation is one of the
  member's daily questions (25 free, 40 approved, 100 members, admins none). The call runs under `runUnderLease`, the
  thinking toggle is the same `think` flag gated by `thinkingAvailable()`, and spend is metered under the `medschools-qa`
  task, so it is inside the Q&A share. A reply that cannot be read (fewer than two usable follow-ups) refunds the day's
  question, as the tracker import does; a provider failure does not.
- **Grounding.** The model sees `{ question, notes?, examples[] }` as data. `examples` are up to eight other stored
  questions of the named school (most voted first), cleaned by `cleanForPrompt`; no school name, no figure. The prompt
  asks for follow-up questions only, never an answer and never a fact about a school. The server keeps only strings that
  end in a question mark, are not the question itself, hold no URL, and are at most 240 characters, and returns two or
  three of them.
- **Input.** zod: `question` 3 to 500 characters, `notes` at most 2000, optional `slug` (pattern, then checked against
  active schools; an unknown or inactive school is a 400 before anything is reserved), optional `think`.
- **Nothing stored.** Not the notes, the question, the prompt or the output; logs carry counts only. The one trace is the
  `AiUsage` row the provider writes.
- **Response.** `{ followups: string[], tier, remainingToday, dailyCap, thinking }`.

## Standing constraints touched

- **Anonymization.** Stored school questions are already anonymous text; the model is not asked for facts about people or
  schools, and the member's notes are theirs.
- **Budget.** Q&A share only; fail closed.
- **Design.** Steel: rows on rules, `t-*`, tokens, one ink primary (Start), no box, no motion beyond the 1 s digit change.
  Presentational, so item 11 can restyle.
- **i18n.** `medschools` namespace, defaults on every string, including each general question.

## What the tests pin

- `engine/general-questions.test.ts`: schema, unique ids, both programs, text length, version.
- `engine/practice.test.ts`: reducer transitions (start, pause, reset, tick to done, duration change), picking.
- `engine/followups.test.ts`: parsing and filtering of model output.
- `api/qa/followups.server.test.ts`: gates before the model, one reservation, nothing stored, refund on unreadable
  output, no content in logs, grounding input.
- `api/medschools.me.interview.followups.server.test.ts`: 401, 400s, slug validation, rate-limit policy, pinned key set.
- `ui/practice/practice-ui.test.tsx`: practice panel, general page, school sub-tab.
- Integration: the route is added to the signed-out 401 table in `testing/integration/medschools-private.test.ts`.
