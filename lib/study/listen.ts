/**
 * Listen to your flashcards (s11-17), the pure part: which languages a deck can name, what is spoken for each side
 * of each kind of card, which language a side is spoken in, and the reveal delays. No I/O and no strings the member
 * reads: the one word it needs ("blank") is passed in already translated, because `lib/` never reads a namespace.
 */
import { clozePlainText, maskCloze, parseCloze, type CardKind } from '@/lib/study/card-types';

/** The languages a deck's owner can name for a side: common BCP 47 tags, in the order the select lists them. */
export const DECK_LANGUAGE_TAGS = [
  'ar',
  'zh-CN',
  'zh-TW',
  'cs',
  'da',
  'nl',
  'en-US',
  'en-GB',
  'fi',
  'fr-FR',
  'fr-CA',
  'de-DE',
  'el',
  'he',
  'hi',
  'hu',
  'id',
  'it-IT',
  'ja',
  'ko',
  'nb',
  'pl',
  'pt-BR',
  'pt-PT',
  'ro',
  'ru',
  'es-ES',
  'es-MX',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
] as const;

export type DeckLanguageTag = (typeof DECK_LANGUAGE_TAGS)[number];

/** Whether `value` is a tag a deck may carry. `null` ("Same as the site") is not a tag and is checked by the caller. */
export function isDeckLanguageTag(value: unknown): value is DeckLanguageTag {
  return typeof value === 'string' && (DECK_LANGUAGE_TAGS as readonly string[]).includes(value);
}

/** A stored language read back: a tag the list still holds, otherwise null (the site's language). */
export function readDeckLanguage(value: unknown): DeckLanguageTag | null {
  return isDeckLanguageTag(value) ? value : null;
}

/** The seconds before the answer is shown by itself, 0 being "Wait for me". */
export const LISTEN_DELAYS = [3, 5, 8, 0] as const;
export type ListenDelay = (typeof LISTEN_DELAYS)[number];

export function isListenDelay(value: unknown): value is ListenDelay {
  return typeof value === 'number' && (LISTEN_DELAYS as readonly number[]).includes(value);
}

export type ListenSide = 'front' | 'back';

/** The fields of a card that decide what is spoken. */
export interface ListenCard {
  kind: CardKind;
  front: string;
  back: string;
  clozeIndex: number | null;
  sourceId: string | null;
  /** Whether the side being asked has a picture (a picture-only side is not spoken). */
  hasPicture?: boolean;
}

/** What a side comes to: text to say, a picture to look at, or nothing at all. */
export type Spoken = { kind: 'text'; text: string } | { kind: 'picture' } | { kind: 'none' };

/**
 * The speech for one side of a card. A cloze card says `blank` for the deletion on the front and the whole sentence
 * on the back; a reversible card's reverse row already holds the sides swapped, so each side says what it shows; an
 * occlusion card, and a side that is only a picture, is not spoken (the member looks); an empty side says nothing.
 */
export function spokenFor(card: ListenCard, side: ListenSide, blank: string): Spoken {
  if (card.kind === 'occlusion') return { kind: 'picture' };
  const text = card.kind === 'cloze' && card.clozeIndex !== null ? clozeSide(card, side, blank) : plainSide(card, side);
  if (text.trim() !== '') return { kind: 'text', text: text.trim() };
  return card.hasPicture ? { kind: 'picture' } : { kind: 'none' };
}

function plainSide(card: ListenCard, side: ListenSide): string {
  return side === 'front' ? card.front : card.back;
}

function clozeSide(card: ListenCard, side: ListenSide, blank: string): string {
  if (side === 'back') return clozePlainText(card.front);
  const parsed = parseCloze(card.front);
  if (!parsed.ok || card.clozeIndex === null) return card.front;
  return maskCloze(parsed.segments, card.clozeIndex, false)
    .map((part) => (part.type === 'mask' ? blank : part.text))
    .join('');
}

/** The languages a deck names for its sides. */
export interface DeckLanguages {
  frontLang: string | null;
  backLang: string | null;
}

/**
 * The language a side is spoken in: the deck's language for that side, the site's when the deck names none. A
 * generated reverse card shows the author's back on its front, so its sides take the languages the other way
 * round; a cloze card's two sides are one sentence, written in the front language.
 */
export function languageFor(
  card: Pick<ListenCard, 'kind' | 'sourceId' | 'clozeIndex'>,
  side: ListenSide,
  deck: DeckLanguages,
  siteLanguage: string,
): string {
  const reverse = card.kind === 'reversible' && card.sourceId !== null && card.clozeIndex === null;
  const authored: ListenSide = card.kind === 'cloze' ? 'front' : reverse ? (side === 'front' ? 'back' : 'front') : side;
  const chosen = authored === 'front' ? deck.frontLang : deck.backLang;
  return readDeckLanguage(chosen) ?? siteLanguage;
}

/**
 * Whether a saved voice can read `language`: the same base language (`es-MX` and `es-ES` do, `en-US` does not). A
 * voice chosen for English articles must not read a Spanish card, so the speaker drops it for the language match.
 */
export function voiceReads(voiceLang: string, language: string): boolean {
  const base = (tag: string) => tag.toLowerCase().split(/[-_]/)[0];
  return base(voiceLang) === base(language);
}
