/**
 * Number words (plan R17): a figure spelled out ("five hundred nineteen", "a dozen", "cincuenta") is a numeric claim
 * like any digit figure. English is parsed into the value it states, so "twelve" is checked against a cited fact's `12`.
 * The other shipped locales are a best-effort list that can only be unverifiable (`?word`): a segment containing one
 * is dropped, never matched. Pure.
 *
 * Deliberately not covered: ordinals ("first", "second"), fractions beyond "half"/"halves", and a lone "one" (a pronoun:
 * "no one", "one of the schools"; "one hundred" and "twenty-one" are parsed). Spelled figures in other scripts that
 * double as ordinary words are not listed. The digit rules in `numbers.ts` are the guarantee; this list narrows the gap.
 */

export interface WordToken {
  kind: 'number' | 'percent';
  value: string;
}

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };
const UNVERIFIABLE_EN = new Set(['half', 'halves', 'twice']);

/** Words of the other shipped locales (es, fr, pt, ru, ar, hi) and the CJK numeral run; each is `?word`, never matched. */
const OTHER_WORDS = new RegExp(
  [
    // es / pt / fr, whole words (a lone "uno", "un", "une", "um" is an article and is left out; words that are also
    // English ("zero", "once", "cent", "million", "sept" for September) are left to the English reader)
    String.raw`(?<![\p{L}\p{M}])(?:cero|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|mil|mill[oó]n|docena|mitad|duas?|tr[eê]s|quatro|sete|oito|dez|vinte|trinta|quarenta|cinquenta|sessenta|oitenta|cem|cento|milh[aã]o|d[uú]zia|metade|deux|trois|quatre|cinq|huit|neuf|dix|onze|douze|treize|vingt|trente|quarante|cinquante|soixante|mille|douzaine|moiti[eé])(?![\p{L}\p{M}])`,
    // ru: common forms, whole words
    String.raw`(?<![\p{L}\p{M}])(?:два|две|двух|двум|три|трёх|трех|четыре|четырёх|четырех|пять|пяти|шесть|шести|семь|семи|восемь|восьми|девять|девяти|десять|десяти|двадцать|тридцать|сорок|пятьдесят|шестьдесят|семьдесят|восемьдесят|девяносто|сто|двести|триста|тысяча|тысячи|тысяч|миллион|миллиона|миллионов|половина|половину|ноль)(?![\p{L}\p{M}])`,
    // ar: whole words (a prefixed conjunction is missed; "ست" as a prefix would also catch Stanford)
    String.raw`(?<![\p{L}\p{M}])(?:اثنان|اثنين|ثلاثة|ثلاث|أربعة|أربع|خمسة|خمس|ستة|سبعة|سبع|ثمانية|ثماني|تسعة|تسع|عشرة|عشر|مائة|مئة|ألف|الف|مليون|نصف|صفر)(?![\p{L}\p{M}])`,
    // hi
    String.raw`(?<![\p{L}\p{M}])(?:दो|तीन|चार|पाँच|पांच|छह|छः|सात|आठ|नौ|दस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|सौ|हज़ार|हजार|लाख|आधा|आधी|शून्य)(?![\p{L}\p{M}])`,
    // zh / ja: two or more numeral characters in a row, or a unit of hundreds/thousands/ten-thousands/half alone
    String.raw`[一二三四五六七八九十〇零两兩壱弐参]{2,}|[百千万萬億亿半]`,
  ].join('|'),
  'giu',
);

const tokenWords = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{M}]+(?:-[\p{L}\p{M}]+)*/gu) ?? [];

/** The English number words of `text` as the figures they state; `half`, `halves`, `twice` are `?word`. */
function englishWords(text: string): WordToken[] {
  const out: WordToken[] = [];
  // Split hyphenated compounds ("twenty-one") so each part is a word of its own.
  const words = tokenWords(text).flatMap((w) => w.split('-'));
  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    if (UNVERIFIABLE_EN.has(w)) {
      out.push({ kind: 'number', value: `?${w}` });
      i++;
      continue;
    }
    const isNum = (x: string | undefined) =>
      x !== undefined && (x in UNITS || x in SCALES || x === 'hundred' || x === 'dozen' || x === 'dozens');
    if (!isNum(w)) {
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    let used = 0;
    let j = i;
    let sawOnlyOne = true;
    while (j < words.length) {
      const x = words[j]!;
      // "and" joins only after a hundred or a scale ("five hundred and nineteen"), never two figures ("21 and 99").
      if (x === 'and' && isNum(words[j + 1]) && (words[j - 1] === 'hundred' || words[j - 1]! in SCALES)) {
        j++;
        continue;
      }
      if (!isNum(x)) break;
      if (x in UNITS) current += UNITS[x]!;
      else if (x === 'hundred') current = (current || 1) * 100;
      else if (x === 'dozen' || x === 'dozens') current = (current || 1) * 12;
      else {
        total += (current || 1) * SCALES[x]!;
        current = 0;
      }
      if (x !== 'one') sawOnlyOne = false;
      used++;
      j++;
    }
    const value = total + current;
    const next = words[j];
    const after = words[j + 1];
    const percent = next === 'percent' || (next === 'per' && after === 'cent');
    // A lone "one" is a pronoun; leave it.
    if (!(used === 1 && sawOnlyOne && w === 'one')) {
      out.push({ kind: percent ? 'percent' : 'number', value: String(value) });
    }
    i = Math.max(j, i + 1);
  }
  return out;
}

/** Every number word in `text`, English as its value and the rest as unverifiable tokens. */
export function numberWordTokens(text: string): WordToken[] {
  const out = englishWords(text);
  for (const m of text.matchAll(OTHER_WORDS)) out.push({ kind: 'number', value: `?${m[0].toLowerCase()}` });
  return out;
}
