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
  sourceUrl: string;
  /** What we changed: our conversion is an alteration we attribute to ourselves. */
  changes: string;
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
          'https://github.com/sfzinstruments/SalamanderGrandPiano',
        changes: `${CHANGES} Each note is retuned with the upstream "Retuned" table.`,
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
        changes: `${CHANGES} Fretted notes are restored to their played pitch. These alterations are made by RMH Studios.`,
        licenceText:
          ELLA_MIT,
      },
    vsco: {
      id: 'vsco',
      work: 'VS Chamber Orchestra: Community Edition (solo violin, flute)',
      author:
        'Versilian Studios',
      licence:
        'CC0 1.0 Universal (public domain dedication)',
      licenceUrl:
        'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl:
        'https://github.com/sgossner/VSCO-2-CE',
      changes:
        CHANGES,
      licenceText:
        null,
    },
  };
