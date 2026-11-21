/**
 * The people the /psychology page credits, and where each portrait came from.
 *
 * Portraits are cut out of photographs on Wikimedia Commons (background
 * removed, converted to greyscale, 360px tall WebP with transparency) and live
 * in `public/images/psychology/<id>.webp`. Only freely licensed originals are
 * used; several of the people below have no free photograph anywhere (their
 * Wikipedia images are fair-use only), and the page shows their initials
 * instead of a likeness it has no right to reuse. The changes made to each
 * image are stated in `CREDIT_CHANGES` so the CC BY-SA ones can be reused on the
 * same terms.
 */

export interface Portrait {
  /** Pixel size of the WebP, for the `<img>` width and height. */
  width: number;
  height: number;
  /** Who took or made the original, as Commons records it. */
  author: string;
  license: string;
  /** The original's page on Wikimedia Commons. */
  source: string;
}

export interface Person {
  id: string;
  name: string;
  /** Lifespan or birth year, as shown under the name. */
  years: string;
  portrait: Portrait | null;
}

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

export const CREDIT_CHANGES = 'Background removed, converted to greyscale, resized.';

export const PEOPLE: Record<string, Person> = {
  zeigarnik: {
    id: 'zeigarnik',
    name: 'Bluma Zeigarnik',
    years: '1900–1988',
    portrait: {
      width: 265,
      height: 360,
      author: 'Andrey Zeigarnik',
      license: 'Public domain',
      source: commons('Bluma_Zeigarnik,_April_3,_1921.jpg'),
    },
  },
  kahneman: {
    id: 'kahneman',
    name: 'Daniel Kahneman',
    years: '1934–2024',
    portrait: {
      width: 302,
      height: 360,
      author: 'nrkbeta',
      license: 'CC BY-SA 2.0',
      source: commons('Daniel_Kahneman_(3283955327)_(cropped).jpg'),
    },
  },
  deci: {
    id: 'deci',
    name: 'Edward L. Deci',
    years: 'b. 1942',
    portrait: {
      width: 283,
      height: 360,
      author: 'Center for Self-Determination Theory',
      license: 'CC BY-SA 4.0',
      source: commons('Edward_L_Deci.jpg'),
    },
  },
  ryan: {
    id: 'ryan',
    name: 'Richard M. Ryan',
    years: 'b. 1953',
    portrait: {
      width: 415,
      height: 360,
      author: 'Center for Self-Determination Theory',
      license: 'CC BY-SA 4.0',
      source: commons('Richard-ryan-600x400_acu_RT_HiRes.png'),
    },
  },
  hull: {
    id: 'hull',
    name: 'Clark L. Hull',
    years: '1884–1952',
    portrait: {
      width: 500,
      height: 360,
      author: 'Smithsonian Institution',
      license: 'No known copyright restrictions',
      source: commons('Clark_Leonard_Hull.jpg'),
    },
  },
  nunes: {
    id: 'nunes',
    name: 'Joseph C. Nunes & Xavier Drèze',
    years: '2006',
    portrait: null,
  },
  csikszentmihalyi: {
    id: 'csikszentmihalyi',
    name: 'Mihaly Csikszentmihalyi',
    years: '1934–2021',
    portrait: {
      width: 309,
      height: 360,
      author: 'Ehirsh',
      license: 'Public domain',
      source: commons('Mihaly_Csikszentmihalyi.jpg'),
    },
  },
  vygotsky: {
    id: 'vygotsky',
    name: 'Lev Vygotsky',
    years: '1896–1934',
    portrait: {
      width: 282,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Lev-Semyonovich-Vygotsky-1896-1934.jpg'),
    },
  },
  festinger: {
    id: 'festinger',
    name: 'Leon Festinger',
    years: '1919–1989',
    portrait: null,
  },
  marsh: {
    id: 'marsh',
    name: 'Herbert W. Marsh',
    years: 'b. 1946',
    portrait: null,
  },
  norton: {
    id: 'norton',
    name: 'Michael I. Norton',
    years: 'b. 1975',
    portrait: {
      width: 352,
      height: 360,
      author: 'PopTech',
      license: 'CC BY-SA 2.0',
      source: commons('Michael_Norton_Poptech.jpg'),
    },
  },
  winnicott: {
    id: 'winnicott',
    name: 'Donald Winnicott',
    years: '1896–1971',
    portrait: {
      width: 262,
      height: 360,
      author: 'Wellcome Collection',
      license: 'CC BY 4.0',
      source: commons('Donald_Woods_Winnicott.jpg'),
    },
  },
  seligman: {
    id: 'seligman',
    name: 'Martin Seligman',
    years: 'b. 1942',
    portrait: {
      width: 381,
      height: 360,
      author: 'U.S. Department of Defense',
      license: 'Public domain',
      source: commons('Martin_Seligman_Philadelphia_2009.jpg'),
    },
  },
  jung: {
    id: 'jung',
    name: 'Carl Jung',
    years: '1875–1961',
    portrait: {
      width: 334,
      height: 360,
      author: 'Unknown (ETH-Bibliothek Zürich)',
      license: 'Public domain',
      source: commons('ETH-BIB-Jung,_Carl_Gustav_(1875-1961)-Portrait-Portr_14163_(cropped).tif'),
    },
  },
  restorff: {
    id: 'restorff',
    name: 'Hedwig von Restorff',
    years: '1906–1962',
    portrait: null,
  },
  wertheimer: {
    id: 'wertheimer',
    name: 'Max Wertheimer',
    years: '1880–1943',
    portrait: {
      width: 253,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Max_Werheimer_(1880-1943).jpg'),
    },
  },
  koffka: {
    id: 'koffka',
    name: 'Kurt Koffka',
    years: '1886–1941',
    portrait: {
      width: 271,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Kurt_Koffka.jpg'),
    },
  },
  hick: {
    id: 'hick',
    name: 'William Edmund Hick',
    years: '1912–1974',
    portrait: null,
  },
  fitts: {
    id: 'fitts',
    name: 'Paul Fitts',
    years: '1912–1965',
    portrait: null,
  },
  miller: {
    id: 'miller',
    name: 'George A. Miller',
    years: '1920–2012',
    portrait: null,
  },
  weber: {
    id: 'weber',
    name: 'Ernst Heinrich Weber',
    years: '1795–1878',
    portrait: {
      width: 254,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Ernst_Heinrich_Weber.jpg'),
    },
  },
  fechner: {
    id: 'fechner',
    name: 'Gustav Fechner',
    years: '1801–1887',
    portrait: {
      width: 294,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Gustav_Fechner.jpg'),
    },
  },
  doherty: {
    id: 'doherty',
    name: 'Walter J. Doherty',
    years: '1982',
    portrait: null,
  },
  ebbinghaus: {
    id: 'ebbinghaus',
    name: 'Hermann Ebbinghaus',
    years: '1850–1909',
    portrait: {
      width: 300,
      height: 360,
      author: 'Unknown',
      license: 'Public domain',
      source: commons('Ebbinghaus2.jpg'),
    },
  },
  skinner: {
    id: 'skinner',
    name: 'B. F. Skinner',
    years: '1904–1990',
    portrait: {
      width: 288,
      height: 360,
      author: 'Silly rabbit',
      license: 'CC BY 3.0',
      source: commons('B.F._Skinner_at_Harvard_circa_1950_(cropped).jpg'),
    },
  },
  tversky: {
    id: 'tversky',
    name: 'Amos Tversky',
    years: '1937–1996',
    portrait: null,
  },
};

/** The two-letter monogram shown where no free portrait exists. */
export function initials(name: string): string {
  const words = name.split(/[\s&]+/).filter((w) => /^[A-ZÀ-Ž]/.test(w));
  return ((words[0]?.[0] ?? '') + (words.at(-1)?.[0] ?? '')).toUpperCase();
}
