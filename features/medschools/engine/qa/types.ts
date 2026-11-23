import type { MedSource } from '../types';

export type QaIntent = 'facts' | 'compare' | 'interviews' | 'timing' | 'my-chance' | 'other';

/** One row the answer may cite. Refs are issued per request; the model only ever sees `ref`, `label`, `text`, `untrusted`. */
export interface RetrievedFact {
  ref: string; // 'f1', 'f2', ... issued per request, in order
  schoolSlug: string | null;
  label: string; // short English label for the citation row ("Interview profile")
  text: string; // the exact line the model is shown; the allowed numbers are the tokens in it
  untrusted: boolean; // forum free text
  // 'DIRECTORY' is the school's own header row (name, city, interview format); it has no data source.
  source: MedSource | 'FORECAST' | 'DIRECTORY';
  sourceName: string; // 'CycleTrack' | 'Admit.org' | 'Student Doctor Network' | 'RMH tracker' | 'RMH forecast' | 'RMH Med Schools'
  updatedAt: string | null; // ISO
  href: string; // site path incl. ?tab=
  sourceHref: string | null; // external attribution link where known
}

export interface RawSegment {
  text: string;
  cites: string[];
}

/** `cites` are valid, in order, deduped. */
export interface GroundedSegment {
  text: string;
  cites: string[];
}

export type DropReason =
  'unknown-cite' | 'no-cite' | 'number-mismatch' | 'untrusted-number' | 'link' | 'empty' | 'over-limit' | 'leak';

export interface Grounded {
  segments: GroundedSegment[];
  dropped: number; // segments removed
  reasons: DropReason[];
  citedRefs: string[]; // first-use order
}
