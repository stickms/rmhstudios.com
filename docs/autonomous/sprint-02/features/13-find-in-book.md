# 13 — Find in book

Surface: the library reader (`/library/$slug`, PDF and EPUB). Wave 7. Namespace
`find-in-book`.

## User story

As a reader of a long PDF or EPUB in the library, I want to search inside it and
jump straight to every page that mentions a word or phrase, so that I can find
the passage I remember without paging through 400 pages.

## Requirements elicitation

- **What exists (verified):** the library reader
  (`components/library/BookReader.tsx`, `EpubReader.tsx`, `ReaderDetails.tsx`,
  `components/reading/ReaderTextView.tsx`) renders PDFs through pdf.js
  (`lib/library/pdf-client.ts`) and EPUBs through `lib/library/epub.ts`;
  `lib/reading/pdf-text.ts` already extracts a page's text for highlights.
  Documents have a table of contents (`LibraryDocument.toc`). **There is no
  search inside a document** (no find, query or match code in
  `components/library` or `lib/library`), and the browser's own find cannot see
  text in a canvas-rendered PDF page.
- **Decisions:** search runs in the browser over text extracted on demand, page
  by page, yielding between pages so the reader stays responsive; the index is
  kept in memory for the open document only. Matching ignores case and
  diacritics, joins words hyphenated across line ends, and treats any run of
  whitespace as one space, so phrases that wrap still match. Mod+F opens the
  panel only while focus is inside the reader; elsewhere the browser keeps it.

## Functional requirements

1. FR-1 A Find button in the reader toolbar opening a search panel (the overlay
   surface on a phone, a side panel at ≥1024 px).
2. FR-2 Typing a query of two or more characters searches (debounced 200 ms);
   options: match case, whole words.
3. FR-3 Results grouped by page (PDF) or chapter (EPUB), each with a snippet of
   about 80 characters around the match and the match marked; a count ("24
   matches on 9 pages"); progress while indexing ("Searching page 120 of 412").
4. FR-4 Selecting a result navigates to the page or chapter and marks the match
   on the text layer where one exists; Next and Previous (Enter and Shift+Enter
   in the field) step through matches in order.
5. FR-5 A new query cancels the running search; closing the panel keeps the
   index for the session.
6. FR-6 Scanned PDFs with no text layer report "This document has no searchable
   text".

## Non-functional requirements

- **Performance:** no main-thread task over 50 ms (extraction is chunked per
  page with idle yielding; matching per page is linear); a 400-page text PDF is
  fully searchable within 10 s on a mid-range phone; memory capped by storing
  normalised page text only.
- **Accessibility:** the panel is a dialog or complementary region with a
  labelled search field; results are a list of links; the result count is
  announced politely; marked matches use `<mark>` styled with tokens.
- **i18n:** strings in `find-in-book`; normalisation via NFKD with combining
  marks removed and `toLocaleLowerCase` for the document language; snippets keep
  `dir="auto"` so Arabic text reads correctly.
- **Design:** the library reader is a full-screen route; it keeps its own look,
  using the tokens its stylesheets already use; flat, no animation beyond the
  overlay's 160 ms opacity.

## Data model and API

None. Pure `lib/library/find.ts` (`normalise`,
`findInPage(text, query, options)`, `snippet`, `joinHyphenated`), a client index
`lib/library/find-index.ts` (extract per page through `pdf-text.ts` / the EPUB
chapter text, cancellable), and `components/library/FindPanel.tsx`.

## Testing requirements

- Product suite `lib/library/__tests__/find.product.test.ts`: case and
  diacritics ignored by default and respected with Match case; whole words; a
  phrase split by a line-end hyphen matches; snippets never cut a surrogate
  pair; Arabic text matches.
- Product suite `lib/library/__tests__/find-index.product.test.ts`: cancelling
  stops further extraction; results arrive in page order.

## Acceptance criteria

- [ ] Searching a word in a 300-page PDF lists every page it is on and jumps to
      the first.
- [ ] "naïve" finds "naive" and the reverse.
- [ ] A phrase split across two lines with a hyphen is found.
- [ ] Typing a new query while indexing restarts the search without freezing the
      page.
- [ ] Usable at 390 px and 1280 px.

## Out of scope

Searching across the whole library, server-side full-text indexing, OCR.
