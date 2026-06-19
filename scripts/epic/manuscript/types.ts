export type RedNote = { anchor: string; zh: string; en: string };

export type HeadingPassage = { type: 'heading'; zh: string; en: string };
export type CoupletPassage = { type: 'couplet'; zh: [string, string]; en: [string, string] };
export type ProsePassage = { type: 'prose'; zh: string; en: string; redComment?: RedNote[] };
export type VersePassage = { type: 'verse'; zh: string[]; en: string[]; redComment?: RedNote[] };

export type Passage = HeadingPassage | CoupletPassage | ProsePassage | VersePassage;

export type Chapter = {
  n: number;
  title: { zh: string; en: string };
  couplet: CoupletPassage;
  passages: Passage[];
};

export type Character = { zh: string; en: string; role: string; source: string };
export type OutlineEntry = { n: number; zh: string; en: string; beats: string };

export type Bible = {
  titleOptions: { zh: string; en: string }[];
  chosenTitle?: { zh: string; en: string };
  synopsis: string;
  characters: Character[];
  outline: OutlineEntry[];
};
