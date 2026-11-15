/**
 * Where each sampled sound comes from and the notice its licence asks for. Shown on
 * `/rmhmusic/credits` (linked from the Sound dialog). Licence texts are legal text and stay in
 * English, verbatim; the page's own headings go through i18n. Pure data, client-safe.
 */
import type { CreditId } from './types';

export interface SoundCredit {
  id: CreditId;
  /** The recording, as its author names it. */
  work: string;
  author: string;
  licence: string;
  licenceUrl:
    | string
    | null;
  /** The original work's home. */
  sourceUrl: string;
  /** Where we fetched it, when that is not the original (a mirror with an SFZ mapping). */
  fetchedFrom:
    | string
    | null;
  /** One more line the attribution carries (who mapped or recorded it). */
  note:
    | string
    | null;
  /** What we changed: our conversion is an alteration we attribute to ourselves. */
  changes: string;
  /** The attribution exactly as the plan states it (§2.2), for CREDITS.txt. */
  attribution: string;
  /** The full licence notice, when the licence requires it to travel with the files. */
  licenceText:
    | string
    | null;
}

const CHANGES =
  'Converted by RMH Studios: one dynamic layer, trimmed, faded, mixed to mono, loudness matched and encoded as 64 kbps MP3. ' +
  'The build script and its pinned sources are in the RMH Studios repository (scripts/rmhmusic/).';

/** The author's notice from the "Blue Jeans and Moonbeams v5" user guide, verbatim. */
const ELLA_MIT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. Additionally, all alterations which are distributed are to be attributed to the person or organization making them.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

export const SOUND_CREDITS: Readonly<
  Record<
    CreditId,
    SoundCredit
  >
> =
  {
    salamander:
      {
        id: 'salamander',
        work: 'Salamander Grand Piano V3 (Yamaha C5)',
        author:
          'Alexander Holm',
        licence:
          'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
        licenceUrl:
          'https://creativecommons.org/licenses/by/3.0/',
        sourceUrl:
          'https://archive.org/details/SalamanderGrandPianoV3',
        fetchedFrom:
          'https://github.com/sfzinstruments/SalamanderGrandPiano',
        note: 'SFZ mapping by kinwie (sfzinstruments).',
        changes: `${CHANGES} Each note is retuned with the upstream "Retuned" table.`,
        attribution:
          '"Salamander Grand Piano V3" by Alexander Holm, licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). ' +
          'Original: https://archive.org/details/SalamanderGrandPianoV3, SFZ mapping by kinwie (sfzinstruments). ' +
          'Changes made: selected notes, tuning-corrected, trimmed, converted to mono MP3.',
        licenceText:
          null,
      },
    'ella-gitauru':
      {
        id: 'ella-gitauru',
        work: 'Ella Gitauru 5.26.04, from "Blue Jeans and Moonbeams" (a Fender DG8S steel-string acoustic guitar)',
        author:
          'Malaclypse the Younger',
        licence:
          'MIT License (with the author’s added sentence on attributing alterations)',
        licenceUrl:
          null,
        sourceUrl:
          'https://sfzinstruments.github.io/guitars/',
        fetchedFrom:
          null,
        note: null,
        changes: `${CHANGES} Fretted notes are restored to their played pitch. These alterations are made by RMH Studios.`,
        attribution:
          '"Ella Gitauru" (version 5.26.04, a Fender DG8S steel-string acoustic guitar) from "Blue Jeans and Moonbeams" by Malaclypse the Younger, MIT License. ' +
          'Source: the sfzinstruments catalogue entry "Blue Jeans And Moonbeams" (https://sfzinstruments.github.io/guitars/). ' +
          'Altered by RMH Studios: selected notes, restored to their recorded pitch, trimmed, converted to mono MP3.',
        licenceText:
          ELLA_MIT,
      },
    vsco: {
      id: 'vsco',
      work: 'VS Chamber Orchestra: Community Edition (solo violin, flute)',
      author:
        'Versilian Studios LLC',
      licence:
        'CC0 1.0 Universal (public domain dedication)',
      licenceUrl:
        'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl:
        'https://github.com/sgossner/VSCO-2-CE',
      fetchedFrom:
        null,
      note: 'Recorded by Sam Gossner and Simon Dalzell.',
      changes:
        CHANGES,
      attribution:
        '"VS Chamber Orchestra: Community Edition" (VSCO 2 CE) by Versilian Studios LLC, CC0 1.0. ' +
        'Recorded by Sam Gossner and Simon Dalzell. https://github.com/sgossner/VSCO-2-CE. ' +
        'Trimmed and converted to mono MP3.',
      licenceText:
        null,
    },
  };

/** The order credits are listed in, on the page and in CREDITS.txt. */
export const CREDIT_ORDER: readonly CreditId[] =
  [
    'salamander',
    'ella-gitauru',
    'vsco',
  ];

/** Where CREDITS.txt ships, beside the samples (under `public/`). */
export const CREDITS_FILE =
  'music/rmhmusic/instruments/CREDITS.txt';

/**
 * The text of CREDITS.txt, which travels with the sample files: every attribution and the full
 * licence notices. Written by `scripts/rmhmusic/build-instruments.ts` (`--credits`), and a test
 * fails when the committed file differs, so it cannot drift from this module.
 */
export function creditsText(): string {
  const parts =
    [
      'RMH Music instrument samples: credits and licences',
      'Generated from lib/rmhmusic/learn/audio/instruments/credits.ts by scripts/rmhmusic/build-instruments.ts. Do not edit.',
    ];
  for (const id of CREDIT_ORDER) {
    const c =
      SOUND_CREDITS[
        id
      ];
    const lines =
      [
        `== ${c.work} ==`,
        c.attribution,
        '',
        `Author: ${c.author}`,
        `Licence: ${c.licence}${c.licenceUrl ? ` (${c.licenceUrl})` : ''}`,
        `Source: ${c.sourceUrl}`,
        ...(c.fetchedFrom
          ? [
              `Fetched from: ${c.fetchedFrom}`,
            ]
          : []),
        ...(c.note
          ? [
              c.note,
            ]
          : []),
        `Changes: ${c.changes}`,
        ...(c.licenceText
          ? [
              '',
              c.licenceText,
            ]
          : []),
      ];
    parts.push(
      lines.join(
        '\n',
      ),
    );
  }
  return `${parts.join('\n\n')}\n`;
}
