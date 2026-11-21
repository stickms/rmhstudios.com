/** Limits shared by the deck editor's client and server code. */

/** Characters allowed on each side of a card (matches `addCardBody`). */
export const CARD_SIDE_MAX = 500;
/** Cards a single bulk import may add. */
export const MAX_IMPORT_CARDS = 500;
/** Cards one deck may hold. */
export const MAX_DECK_CARDS = 2000;
/** Largest import file the browser will read, in bytes. */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
/** Characters allowed in a cloze card's text (all its deletions included). */
export const CLOZE_TEXT_MAX = 1000;
/** Distinct deletion indices (c1, c2, …) one cloze card may use. */
export const CLOZE_MAX_INDICES = 20;
