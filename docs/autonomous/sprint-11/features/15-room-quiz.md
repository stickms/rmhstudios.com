# 15 — Quiz your study room on a deck

Surface: an RMHStudy room (`/rmhstudy/$roomId`): the host's "Quiz the room" on a break, the quiz panel every member
sees, the standings at the end. Wave 4. Namespace `room-quiz`. App tier (L8): RMHStudy keeps its own look.

## User story

As someone hosting a study room with classmates, I want to run a short multiple-choice quiz on one of our flashcard
decks during the break, with everyone answering at once and a standings list at the end, so that the break turns into a
quick check of what we learned instead of everyone drifting off.

## Requirements elicitation

- **What exists (verified):**
  - Rooms run on the socket hub (`server/socket-server/handlers/rmhstudy.ts`, about 1,670 lines): a host (`hostUserId`),
    members, a Pomodoro timer with phases `idle | working | short_break | long_break`, a shared task list and chat
    (`lib/rmhstudy/events.ts`). Nothing in a room touches flashcards.
  - Practice tests (sprint 02 04) build questions from a deck's cards with a pure builder:
    `buildTest(cards, options, seed)` and `scoreQuestion` in `lib/study/practice-test.ts`, kinds
    `multiple-choice | written | true-false | matching`; `getTestCards(deckId, viewerId)` (`lib/study.server.ts`) reads
    a deck's cards for one viewer, with pictures and the owner's own sounds.
  - Decks a member may study: their own, public decks, and after 10 (wave 2) decks they co-edit
    (`lib/study/deck-access.server.ts`).
- **Decisions:**
  - **When:** only while the room's timer is `idle` or on a break; starting a work phase ends a quiz in progress with
    the standings so far. One quiz at a time; only the host starts or stops it.
  - **What:** the host picks a deck they may study and 5, 10 or 15 questions. Questions are multiple choice only (four
    answers, everyone can answer quickly, and it is the one kind a room can mark together), built on the server by
    `buildTest` from the deck's text cards (basic, reversible and cloze; picture and occlusion cards are left out, and a
    deck with fewer than four distinct answers cannot be used, as the practice test already rules).
  - **Privacy:** a quiz shows a deck's cards to everyone in the room, so the rule is who may show them. A **public**
    deck may be quizzed by any host who may study it. A **private** deck may be quizzed only by its **owner**
    (`deckRole` is `'owner'`), after confirming ("Everyone in this room will see these cards"): an editor of a private
    deck (10) studies it but may not show it to a room, since the owner never agreed to that, and a private deck the
    host may not study is refused like any other. The check runs on the server at start, against the deck as it is then.
    Card sounds and pictures are never sent.
  - **Answering:** each question shows to all members at once with 20 seconds to answer; a member answers once; the
    server marks it (`scoreQuestion`), never the client (the correct answer is not sent until the reveal). After 20
    seconds or when everyone present has answered, the answer is revealed with how many chose each option.
  - **Scoring:** one point per correct answer; ties share a place. The standings show at the end with each member's
    score; nothing is stored (no table, no XP, no history): the quiz lives in the room's memory and ends with it.
  - **Joining late:** a member who joins during a quiz watches from the next question and appears in the standings from
    their first answer.
  - **Moderation:** members the host kicked or banned from the room are out of the quiz as they are out of the room; the
    room's existing rules apply.

## Functional requirements

1. FR-1 `lib/rmhstudy/quiz.ts` (pure, client-safe): the quiz state machine (question, reveal, end), the public view of a
   question (no answer), tallying, standings.
2. FR-2 Socket events `rmhstudy:quiz:start`, `:answer`, `:stop` (client to server) and `:question`, `:reveal`, `:end`,
   `:state` (server to client) in `lib/rmhstudy/events.ts`; each client-to-server event gets an entry in
   `SOCKET_RATE_LIMITS` (`server/socket-server/config.ts`: `rmhstudy:quiz:start` 5 a minute, `:answer` 60, `:stop` 10),
   since an event with no entry is not limited.
3. FR-3 The handler loads cards with a deck-access check for the host (relative import of a small server module
   `lib/rmhstudy/quiz-cards.server.ts` that wraps `getTestCards` and the access rule), builds questions with
   `buildTest`, runs the timers (cleared with the room), and ends the quiz when a work phase starts or the host leaves.
4. FR-4 UI: `components/rmhstudy/RoomQuizPanel.tsx` (question, four answer buttons, the reveal, the standings) and
   `QuizStartDialog.tsx` (the host's deck picker, which lists decks through the existing study decks contract with React
   Query, and the question count); the room page shows the panel while a quiz runs.

## Non-functional requirements

- **Integrity:** answers are marked on the server; a second answer to one question is ignored; the reveal comes after
  the deadline.
- **Server load:** at most 15 questions in memory per room; timers cleared on every exit path.
- **Accessibility:** answers are buttons with their text; the time left is announced at 10 and 5 seconds, not every
  second; the reveal is announced politely.

## Data model and API

- No schema change. No HTTP endpoint (the deck list uses the existing study contract).
- New `lib/rmhstudy/quiz.ts`, `lib/rmhstudy/quiz-cards.server.ts`, `components/rmhstudy/RoomQuizPanel.tsx`,
  `QuizStartDialog.tsx`. Edits `lib/rmhstudy/events.ts`, `lib/rmhstudy/types.ts`, `lib/rmhstudy/store.ts`,
  `server/socket-server/handlers/rmhstudy.ts`, `server/socket-server/config.ts` (three rate-limit entries),
  `components/rmhstudy/RmhStudyRoomPage.tsx`.

## Testing requirements

- Product suite `lib/rmhstudy/__tests__/quiz.product.test.ts`: the state machine (start, answer once, reveal at the
  deadline or when all answered, end), tallies, tied standings, the public view never carries the answer.
- Main suite `server/socket-server/handlers/__tests__/rmhstudy-quiz.test.ts` (beside `rmhstudy-window.test.ts`): only
  the host starts or stops; refused during a work phase; a work phase ends the quiz; a deck the host may not study is
  refused; a private deck is refused for an editor and needs the confirmation flag from its owner; no picture or sound
  field is emitted; timers cleared when the room closes.
- Escape-hatch ratchet, `useEffect` ratchet.

## Acceptance criteria

- [ ] During a short break, the host quizzes four members on a public deck with 10 questions; each sees the questions at
      once and the standings at the end.
- [ ] A member who answers wrongly sees the right answer at the reveal.
- [ ] Starting the next work phase ends the quiz.
- [ ] Nothing about the quiz is saved.

## Out of scope

Written or matching questions, saved quiz history, quizzes outside rooms, picture cards.
