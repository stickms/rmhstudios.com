/** Limits shared by the deck editor's client and server code. */

/** Characters allowed on each side of a card (matches `addCardBody`). */
export const CARD_SIDE_MAX = 500;
/** Cards a single bulk import may add. */
export const MAX_IMPORT_CARDS = 500;
/** Cards one deck may hold. */
export const MAX_DECK_CARDS = 2000;
/** Largest import file the browser will read, in bytes. */
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
