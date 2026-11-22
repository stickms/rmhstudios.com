/** A Standard MIDI File as the Studio sees it: only the events it can use, in absolute ticks. */

export type SmfEvent =
  | {
      tick: number;
      type: 'noteOn';
      channel: number;
      note: number;
      velocity: number;
    }
  | {
      tick: number;
      type: 'noteOff';
      channel: number;
      note: number;
      velocity: number;
    }
  | {
      tick: number;
      type: 'tempo';
      microsPerQuarter: number;
    }
  | {
      tick: number;
      type: 'timeSignature';
      numerator: number;
      denominator: number;
    }
  | {
      tick: number;
      type: 'trackName';
      name: string;
    };

export interface SmfTrack {
  events: SmfEvent[];
}

export interface SmfFile {
  format: 0 | 1;
  /** Ticks per quarter note. */
  ppq: number;
  tracks: SmfTrack[];
}

export const SMF_PPQ = 480;
export const SMF_MAX_BYTES = 1024 * 1024;
export const SMF_MAX_TRACKS = 64;
export const SMF_MAX_EVENTS = 200_000;
/** A variable-length quantity is at most four bytes: 0x0FFFFFFF. */
export const SMF_MAX_VLQ = 0x0fffffff;

export type SmfError =
  | 'too-large'
  | 'not-midi'
  | 'truncated'
  | 'unsupported-format'
  | 'unsupported-timing'
  | 'too-many-tracks'
  | 'too-many-events'
  | 'malformed';
