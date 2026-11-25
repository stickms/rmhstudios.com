/**
 * The RMHType touch-typing course: curriculum, finger map, drills and stars.
 *
 * Pure and client-safe. Nothing here is translated: components turn unit numbers,
 * lesson ids and finger ids into words, so this module stays data (and the server
 * can import it to recompute stars without dragging a UI string along).
 *
 * ## Shape of the course
 *
 * Six units, one new group of keys per lesson, and a review ending each unit.
 * QWERTY by construction; `courseFor(layout)` maps it by key position onto Dvorak, Colemak and AZERTY
 * (`layouts.ts`). Every lesson is open (nothing is locked behind a speed target);
 * `recommendedNext` only says where to go next.
 *
 * ## Drills
 *
 * `drillFor(lesson, seed)` is deterministic: the same lesson and seed give the same
 * text, so a run can be replayed from `{lessonId, seed}`. It builds letter groups
 * first (every new key is guaranteed a place), then real English words from the
 * built-in pool in `custom-test.ts` that use only the allowed keys, then short
 * phrases of those words. A lesson with too few usable words (the first few,
 * where only a handful of letters exist) simply gets more letter groups.
 */

import { mulberry32, shuffle } from '@/lib/core/rng';
import { wordListFor } from '@/lib/rmhtype/custom-test';
import { DEFAULT_LAYOUT, KEYBOARD_ROWS, TYPING_LAYOUTS, type TypingLayout } from '@/lib/rmhtype/keystats';
import { LAYOUT_ID_PREFIX, mapKey } from '@/lib/rmhtype/layouts';

/* -------------------------------------------------------------------------- */
/* Fingers                                                                    */
/* -------------------------------------------------------------------------- */

export const FINGERS = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
  'thumb',
] as const;
export type FingerId = (typeof FINGERS)[number];

/** Lowercase letters, digits and the unshifted punctuation, by the finger that presses them. */
const BASE_FINGER: Record<string, FingerId> = {};
function assign(finger: FingerId, keys: string) {
  for (const key of keys) BASE_FINGER[key] = finger;
}
assign('left-pinky', 'qaz1');
assign('left-ring', 'wsx2');
assign('left-middle', 'edc3');
assign('left-index', 'rfvtgb45');
assign('right-index', 'yhnujm67');
assign('right-middle', 'ik,8');
assign('right-ring', 'ol.9');
assign('right-pinky', "p;/'-0");
assign('thumb', ' ');

/** A shifted symbol, and the unshifted key it sits on. */
const SHIFTED_SYMBOL: Record<string, string> = {
  '!': '1',
  '?': '/',
  ':': ';',
  '"': "'",
  '(': '9',
  ')': '0',
};

/** The physical key a character is struck on: `A` is the `a` key, `?` the `/` key. */
export function baseKeyOf(char: string): string {
  return SHIFTED_SYMBOL[char] ?? char.toLowerCase();
}

/** Whether the character needs Shift held down. */
export function needsShift(char: string): boolean {
  if (char in SHIFTED_SYMBOL) return true;
  return char.length === 1 && char !== char.toLowerCase();
}

/** The finger that presses the character's own key (Shift is separate; see `shiftFingerFor`). */
export function fingerFor(char: string): FingerId | null {
  return BASE_FINGER[baseKeyOf(char)] ?? null;
}

/**
 * The pinky that holds Shift: always the hand opposite the key being struck, so
 * the striking hand never has to leave its place. `null` when no Shift is needed.
 */
export function shiftFingerFor(char: string): FingerId | null {
  if (!needsShift(char)) return null;
  const finger = fingerFor(char);
  if (!finger) return null;
  return finger.startsWith('left') ? 'right-pinky' : 'left-pinky';
}

/** Every character the course types, by finger. Built once from the table above. */
export const FINGER_OF: Readonly<Record<string, FingerId>> = (() => {
  const map: Record<string, FingerId> = {
    ...BASE_FINGER,
  };
  for (const char of Object.keys(SHIFTED_SYMBOL)) {
    const finger = fingerFor(char);
    if (finger) map[char] = finger;
  }
  for (const key of Object.keys(BASE_FINGER)) {
    if (/^[a-z]$/.test(key)) map[key.toUpperCase()] = BASE_FINGER[key] as FingerId;
  }
  return map;
})();

/** The on-screen keyboard's rows, top to bottom (the letters are QWERTY's). */
export const KEYBOARD_LAYOUT: readonly string[] = ['1234567890-', 'qwertyuiop', "asdfghjkl;'", 'zxcvbnm,./'];

/* -------------------------------------------------------------------------- */
/* Curriculum                                                                 */
/* -------------------------------------------------------------------------- */

export interface LessonTargets {
  /** Words per minute for one, two and three stars. Ascending. */
  wpm: readonly [number, number, number];
  /** The accuracy (percent) below which a run earns no stars at all. */
  accuracy: number;
}

export interface Lesson {
  /** Stable id (`l01`...). Stored with a member's progress, so never renumbered. */
  id: string;
  /** 1-based position in the whole course. */
  n: number;
  /** 1-based unit. */
  unit: number;
  /** A review lesson introduces nothing and revisits its unit. */
  review: boolean;
  newKeys: readonly string[];
  /** Everything the drill may contain besides the space bar: all keys so far. */
  allowedKeys: readonly string[];
  /** What the drill leans on: the new keys, or for a review the whole unit's keys. */
  focusKeys: readonly string[];
  targets: LessonTargets;
}

export interface Unit {
  id: number;
  lessonIds: readonly string[];
}

/** Star targets and the accuracy gate per unit (speed rises where the reach is easy). */
const UNIT_TARGETS: Record<number, LessonTargets> = {
  1: {
    wpm: [8, 12, 16],
    accuracy: 90,
  },
  2: {
    wpm: [12, 17, 22],
    accuracy: 92,
  },
  3: {
    wpm: [14, 20, 26],
    accuracy: 92,
  },
  4: {
    wpm: [14, 20, 26],
    accuracy: 92,
  },
  5: {
    wpm: [10, 15, 20],
    accuracy: 90,
  },
  6: {
    wpm: [10, 15, 20],
    accuracy: 90,
  },
};

/** `null` keys = a review of the unit. */
const COURSE_SPEC: readonly {
  unit: number;
  keys: string | null;
}[] = [
  {
    unit: 1,
    keys: 'fj',
  },
  {
    unit: 1,
    keys: 'dk',
  },
  {
    unit: 1,
    keys: 'sl',
  },
  {
    unit: 1,
    keys: 'a;',
  },
  {
    unit: 1,
    keys: 'gh',
  },
  {
    unit: 1,
    keys: null,
  },
  {
    unit: 2,
    keys: 'ei',
  },
  {
    unit: 2,
    keys: 'ru',
  },
  {
    unit: 2,
    keys: 'ty',
  },
  {
    unit: 2,
    keys: 'woqp',
  },
  {
    unit: 2,
    keys: null,
  },
  {
    unit: 3,
    keys: 'vm',
  },
  {
    unit: 3,
    keys: 'c,',
  },
  {
    unit: 3,
    keys: 'x.',
  },
  {
    unit: 3,
    keys: 'bnz/',
  },
  {
    unit: 3,
    keys: null,
  },
  {
    unit: 4,
    keys: 'QWERTASDFGZXCVB',
  },
  {
    unit: 4,
    keys: 'YUIOPHJKLNM',
  },
  {
    unit: 4,
    keys: null,
  },
  {
    unit: 5,
    keys: '12345',
  },
  {
    unit: 5,
    keys: '67890',
  },
  {
    unit: 5,
    keys: null,
  },
  {
    unit: 6,
    keys: '\'"-',
  },
  {
    unit: 6,
    keys: '?!:()',
  },
  {
    unit: 6,
    keys: null,
  },
];

/** Units each layout's course has. AZERTY's digits and punctuation need Shift, so its course stops after the capitals. */
const LAST_UNIT: Record<TypingLayout, number> = { qwerty: 6, dvorak: 6, colemak: 6, azerty: 4 };

/** Units a layout's course leaves out, for the index to say so. */
export function unitsNotInCourse(layout: TypingLayout): number[] {
  return [1, 2, 3, 4, 5, 6].filter((unit) => unit > LAST_UNIT[layout]);
}

/**
 * The keys one spec line teaches on `layout`, by position. Units 1-3 map each QWERTY key to the key at the same
 * place. Capitals follow the mapped letters (a position that holds punctuation on the layout has no capital).
 * Digits and punctuation are kept: the layouts here have them, and a lesson teaches the character wherever it sits.
 */
function mapSpecKeys(unit: number, keys: string, layout: TypingLayout): string[] {
  if (layout === 'qwerty' || unit >= 5) return [...keys];
  if (unit === 4) {
    return [...keys].flatMap((key) => {
      const mapped = mapKey(key.toLowerCase(), layout);
      return /^[a-z]$/.test(mapped) ? [mapped.toUpperCase()] : [];
    });
  }
  return [...keys].map((key) => mapKey(key, layout));
}

function buildCourse(layout: TypingLayout): {
  lessons: Lesson[];
  units: Unit[];
} {
  const lessons: Lesson[] = [];
  const seen: string[] = [];
  const unitKeys: Record<number, string[]> = {};
  const specs = COURSE_SPEC.filter((spec) => spec.unit <= LAST_UNIT[layout]);
  // Letters that sit where QWERTY has punctuation (AZERTY's m, Dvorak's w v z) have no capital in the spec: the
  // last capitals lesson picks them up.
  const covered = new Set(
    specs.filter((spec) => spec.unit === 4 && spec.keys).flatMap((spec) => mapSpecKeys(4, spec.keys ?? '', layout)),
  );
  const extraCapitals = [...new Set(KEYBOARD_ROWS[layout].flat())]
    .filter((key) => /^[a-z]$/.test(key) && !covered.has(key.toUpperCase()))
    .map((key) => key.toUpperCase());
  const lastCapitals = specs.findLastIndex((spec) => spec.unit === 4 && spec.keys !== null);
  const prefix = LAYOUT_ID_PREFIX[layout];
  for (const [index, spec] of specs.entries()) {
    const n = index + 1;
    const newKeys = spec.keys ? mapSpecKeys(spec.unit, spec.keys, layout) : [];
    if (index === lastCapitals && layout !== 'qwerty') newKeys.push(...extraCapitals);
    seen.push(...newKeys);
    unitKeys[spec.unit] = [...(unitKeys[spec.unit] ?? []), ...newKeys];
    lessons.push({
      id: `${prefix}l${String(n).padStart(2, '0')}`,
      n,
      unit: spec.unit,
      review: spec.keys === null,
      newKeys,
      allowedKeys: [...seen],
      focusKeys: newKeys.length ? newKeys : [...(unitKeys[spec.unit] ?? [])],
      targets: UNIT_TARGETS[spec.unit] as LessonTargets,
    });
  }
  const units: Unit[] = [];
  for (const lesson of lessons) {
    const unit = units.find((u) => u.id === lesson.unit);
    if (unit) (unit.lessonIds as string[]).push(lesson.id);
    else
      units.push({
        id: lesson.unit,
        lessonIds: [lesson.id],
      });
  }
  return {
    lessons,
    units,
  };
}

const COURSES: Record<TypingLayout, ReturnType<typeof buildCourse>> = {
  qwerty: buildCourse('qwerty'),
  dvorak: buildCourse('dvorak'),
  colemak: buildCourse('colemak'),
  azerty: buildCourse('azerty'),
};

/** The QWERTY course: what every caller that predates layouts reads, unchanged. */
export const LESSONS: readonly Lesson[] = COURSES.qwerty.lessons;
export const UNITS: readonly Unit[] = COURSES.qwerty.units;

/** The course for a layout, built from the QWERTY spec through the position map. `courseFor('qwerty')` is `LESSONS`. */
export function courseFor(layout: TypingLayout): readonly Lesson[] {
  return COURSES[layout].lessons;
}

export function unitsFor(layout: TypingLayout): readonly Unit[] {
  return COURSES[layout].units;
}

/** The layout a lesson id belongs to: its prefix (`dv-`, `cm-`, `az-`), or QWERTY for a bare `l01`. */
export function layoutOfLessonId(id: string): TypingLayout {
  return TYPING_LAYOUTS.find((layout) => layout !== 'qwerty' && id.startsWith(LAYOUT_ID_PREFIX[layout])) ?? 'qwerty';
}

/** The route segment that opens a free drill on the member's worst keys instead of a lesson. */
export const PRACTICE_ID = 'practice';

/** A lesson of any layout's course by id; `undefined` for an id no course has. */
export function lessonById(id: string): Lesson | undefined {
  return courseFor(layoutOfLessonId(id)).find((lesson) => lesson.id === id);
}

/* -------------------------------------------------------------------------- */
/* Stars and progress                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Stars for a run: none below the accuracy gate, otherwise one per speed target
 * met. Monotonic in both speed and accuracy. The server calls this too and never
 * trusts a client's own count.
 */
export function starsFor(wpm: number, accuracy: number, lesson: Lesson): number {
  if (!Number.isFinite(wpm) || !Number.isFinite(accuracy)) return 0;
  if (accuracy < lesson.targets.accuracy) return 0;
  return lesson.targets.wpm.filter((target) => wpm >= target).length;
}

/** One member's row for one lesson, as the API returns it. */
export interface LessonProgressRow {
  lessonId: string;
  bestWpm: number;
  bestAccuracy: number;
  stars: number;
  attempts: number;
  /** ISO timestamp of the first run that earned a star. */
  completedAt: string | null;
}

/** What recording a run answers with. */
export interface RecordedRun {
  /** The row after this run. */
  progress: LessonProgressRow;
  /** Stars this run earned (not the best). */
  runStars: number;
  /** The lesson now recommended, or null once every lesson has three stars. */
  nextLessonId: string | null;
}

/** A lesson counts as done once it has earned a star. */
export function isLessonDone(
  progress: ReadonlyMap<string, Pick<LessonProgressRow, 'stars'>>,
  lessonId: string,
): boolean {
  return (progress.get(lessonId)?.stars ?? 0) >= 1;
}

export function isUnitComplete(progress: ReadonlyMap<string, Pick<LessonProgressRow, 'stars'>>, unit: Unit): boolean {
  return unit.lessonIds.every((id) => isLessonDone(progress, id));
}

/**
 * The lesson to do next: the first one in course order with no star yet; once
 * every lesson has one, the first with fewer than three; `null` when the course
 * is mastered.
 */
export function recommendedNext(
  progress: ReadonlyMap<string, Pick<LessonProgressRow, 'stars'>>,
  layout: TypingLayout = DEFAULT_LAYOUT,
): string | null {
  const lessons = courseFor(layout);
  const firstUnstarred = lessons.find((lesson) => !isLessonDone(progress, lesson.id));
  if (firstUnstarred) return firstUnstarred.id;
  return lessons.find((lesson) => (progress.get(lesson.id)?.stars ?? 0) < 3)?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Drills                                                                     */
/* -------------------------------------------------------------------------- */

const SENTENCE_END = ['.', '?', '!'] as const;

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] as T;
}

/** Letter groups: the first ones are drawn only from the new keys, so each gets typed. */
function letterGroups(lesson: Lesson, rng: () => number, count: number): string[] {
  const focus = lesson.focusKeys;
  const spread = lesson.allowedKeys;
  let deck: string[] = [];
  const draw = () => {
    if (deck.length === 0) deck = shuffle(focus, rng);
    return deck.pop() as string;
  };
  const guaranteed = Math.ceil(focus.length / 3);
  const groups: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i < guaranteed) {
      groups.push(
        Array.from(
          {
            length: 3,
          },
          draw,
        ).join(''),
      );
      continue;
    }
    const length = 2 + Math.floor(rng() * 3);
    groups.push(
      Array.from(
        {
          length,
        },
        () => (rng() < 0.75 ? draw() : pick(spread, rng)),
      ).join(''),
    );
  }
  return groups;
}

/** Words from the pool that use only allowed characters, plus capitalised forms when allowed. */
function usableWords(allowed: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const word of wordListFor('en')) {
    if (word.length === 0) continue;
    const lower = word.toLowerCase();
    const capital = lower.charAt(0).toUpperCase() + lower.slice(1);
    for (const form of [lower, capital]) {
      if ([...form].every((char) => allowed.has(char))) out.add(form);
    }
  }
  return [...out];
}

function numberToken(lesson: Lesson, rng: () => number): string {
  const digits = lesson.allowedKeys.filter((key) => /^[0-9]$/.test(key));
  const focus = lesson.focusKeys.filter((key) => /^[0-9]$/.test(key));
  const length = 2 + Math.floor(rng() * 2);
  return Array.from(
    {
      length,
    },
    (_, i) => pick(i === 0 && focus.length ? focus : digits, rng),
  ).join('');
}

/**
 * Dress a phrase with the punctuation this lesson teaches. Only focus keys are
 * used, so a phrase never contains a mark the learner has not met.
 */
function decorate(words: string[], lesson: Lesson, index: number, rng: () => number): string {
  const focus = new Set(lesson.focusKeys);
  const parts = [...words];
  if (focus.has('-') && parts.length >= 2) parts.splice(0, 2, `${parts[0]}-${parts[1]}`);
  if (focus.has('/') && parts.length >= 2) parts.splice(-2, 2, `${parts.at(-2)}/${parts.at(-1)}`);
  if (focus.has("'")) parts[0] = `'${parts[0]}'`;
  if (focus.has('"') && parts.length >= 2) parts[1] = `"${parts[1]}"`;
  if (focus.has('(') && focus.has(')')) parts[parts.length - 1] = `(${parts.at(-1)})`;
  if (focus.has(',')) parts[0] = `${parts[0]},`;
  else if (focus.has(':')) parts[0] = `${parts[0]}:`;
  if ([...focus].some((key) => /^[0-9]$/.test(key))) parts.push(numberToken(lesson, rng));
  const ends = SENTENCE_END.filter((mark) => focus.has(mark));
  const text = parts.join(' ');
  return ends.length ? `${text}${ends[index % ends.length]}` : text;
}

/**
 * The text of one attempt at a lesson. Deterministic per `(lesson, seed)`, and
 * built only from the lesson's allowed keys and the space bar.
 */
export function drillFor(lesson: Lesson, seed: number): string {
  const rng = mulberry32(seed);
  const allowed = new Set(lesson.allowedKeys);
  const focus = new Set(lesson.focusKeys);

  const words = usableWords(allowed);
  const focusWords = words.filter((word) => [...word].some((char) => focus.has(char)));
  const haveWords = words.length >= 3;

  const sections: string[] = [];
  const groupCount = Math.min(14, Math.ceil(lesson.focusKeys.length / 2) + 4);
  sections.push(letterGroups(lesson, rng, haveWords ? groupCount : groupCount * 2).join(' '));

  if (haveWords) {
    const preferred = focusWords.length >= 3 ? focusWords : words;
    const drawWords = (count: number) => shuffle(preferred, rng).concat(shuffle(words, rng)).slice(0, count);
    sections.push(drawWords(8).join(' '));
    const phrases = Array.from(
      {
        length: 3,
      },
      (_, i) => decorate(drawWords(3 + (i % 2)), lesson, i, rng),
    );
    sections.push(phrases.join(' '));
  }
  return sections.join(' ');
}
