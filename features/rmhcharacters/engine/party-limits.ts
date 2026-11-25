/** Bounds on a party (RMHCharacters). Plain constants: the server, the zod schemas and the screens all read them. */

/** Players in one party (a game master who brings a character counts as one). */
export const PARTY_MAX_MEMBERS = 8;
/** Parties one member may run. */
export const PARTY_MAX_RUN = 10;
/** Parties one member may play in. */
export const PARTY_MAX_PLAYING = 20;
export const PARTY_NAME_MAX = 60;
/** Named extras in the turn order ("Goblin 1"), beside the party's own characters. */
export const PARTY_MAX_EXTRAS = 20;
/** The turn order's size: the largest party plus the extras. */
export const PARTY_MAX_ORDER = PARTY_MAX_MEMBERS + PARTY_MAX_EXTRAS;
export const PARTY_EXTRA_NAME_MAX = 40;
export const PARTY_ORDER_VALUE_MAX = 999;
/** How often the party page asks again while it is visible. */
export const PARTY_REFETCH_MS = 20_000;
