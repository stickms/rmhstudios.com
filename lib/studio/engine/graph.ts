/**
 * The Studio's audio graph, built in ONE place. The live engine (`StudioEngine`) and the offline export
 * (`export/render.ts`) both call these builders, so a mix exports the way it plays. Tone is passed in, never
 * imported, so the module loads without the audio library and tests can hand it a stub.
 *
 *   track channel -> master channel -> limiter [-> analyser -> meter] -> destination
 */
import type * as ToneNS from 'tone';
import { flattenPattern } from '../midi/convert';
import { RMHDrums } from '../plugins/instruments/RMHDrums';
import type {
  AudioClipData,
  MidiClipData,
  PatternClipData,
  Pattern,
  Track,
} from '../types';
import { beatsToSeconds } from '../export/range';

export type ToneModule =
  typeof ToneNS;

export interface MasterChain {
  channel: ToneNS.Channel;
  limiter: ToneNS.Limiter;
  /** Only in the live graph: the offline render has nothing to watch. */
  analyser: ToneNS.Analyser | null;
  meter: ToneNS.Meter | null;
}

/** The master channel, limiter and (live only) analyser and meter, wired to the destination. */
export function buildMasterChain(
  tone: ToneModule,
  opts: {
    monitoring: boolean;
  },
): MasterChain {
  const channel =
    new tone.Channel(
      {
        volume: 0,
        channelCount: 2,
      },
    );
  const limiter =
    new tone.Limiter(
      -1,
    );
  if (
    opts.monitoring
  ) {
    const analyser =
      new tone.Analyser(
        'fft',
        2048,
      );
    const meter =
      new tone.Meter(
        {
          channelCount: 2,
        },
      );
    channel.chain(
      limiter,
      analyser,
      meter,
      tone.getDestination(),
    );
    return {
      channel,
      limiter,
      analyser,
      meter,
    };
  }
  channel.chain(
    limiter,
    tone.getDestination(),
  );
  return {
    channel,
    limiter,
    analyser:
      null,
    meter:
      null,
  };
}

/** A 0-1 fader position as decibels; the bottom of the fader is silence. */
export function gainToDecibels(
  tone: ToneModule,
  gain: number,
): number {
  return gain <=
    0
    ? -100
    : tone.gainToDb(
        gain,
      );
}

/** One track's channel strip, feeding the master channel. */
export function buildTrackChannel(
  tone: ToneModule,
  master: ToneNS.Channel,
  strip: {
    volumeDb: number;
    pan: number;
  },
): ToneNS.Channel {
  return new tone.Channel(
    {
      volume:
        strip.volumeDb,
      pan: strip.pan,
    },
  ).connect(
    master,
  );
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

export interface GraphProject {
  bpm: number;
  masterVolume: number;
  tracks: Track[];
  clips: Record<
    string,
    | AudioClipData
    | MidiClipData
    | PatternClipData
    | {
        type: 'automation';
        trackId: string;
        startBeat: number;
        durationBeats: number;
      }
  >;
  patterns: Pattern[];
}

export interface ScheduleOptions {
  /** Project beat that becomes second zero of the render. */
  startBeat: number;
  /** Seconds of audio to produce; nothing is scheduled to start after it. */
  durationSeconds: number;
  /** Decoded sample buffers by `bufferId`. */
  buffers: ReadonlyMap<
    string,
    AudioBuffer
  >;
  /** Tracks that are audible (mute and solo already applied). */
  tracks: Track[];
}

export interface ScheduledGraph {
  master: MasterChain;
  dispose: () => void;
}

/**
 * Build the whole graph for a project and schedule every clip against the audio clock. Called inside
 * `Tone.Offline`'s callback, where `tone.getDestination()` is the offline destination.
 */
export function buildProjectGraph(
  tone: ToneModule,
  project: GraphProject,
  opts: ScheduleOptions,
): ScheduledGraph {
  const master =
    buildMasterChain(
      tone,
      {
        monitoring: false,
      },
    );
  master.channel.volume.value =
    gainToDecibels(
      tone,
      project.masterVolume,
    );
  const patterns =
    new Map(
      project.patterns.map(
        (
          p,
        ) => [
          p.id,
          p,
        ],
      ),
    );
  const disposables: {
    dispose: () => void;
  }[] =
    [
      master.channel,
      master.limiter,
    ];
  const spb =
    (
      beats: number,
    ) =>
      beatsToSeconds(
        beats,
        project.bpm,
      );
  const windowEnd =
    opts.durationSeconds;

  for (const track of opts.tracks) {
    const strip =
      buildTrackChannel(
        tone,
        master.channel,
        {
          volumeDb:
            gainToDecibels(
              tone,
              track.volume,
            ),
          pan: track.pan,
        },
      );
    disposables.push(
      strip,
    );

    let synth: ToneNS.PolySynth | null =
      null;
    let drums: RMHDrums | null =
      null;
    const voice =
      () => {
        if (
          !synth
        ) {
          synth =
            new tone.PolySynth(
              tone.Synth,
              {
                oscillator:
                  {
                    type: 'triangle',
                  },
                envelope:
                  {
                    attack: 0.01,
                    decay: 0.1,
                    sustain: 0.6,
                    release: 0.3,
                  },
                volume:
                  -8,
              },
            ).connect(
              strip,
            );
          disposables.push(
            synth,
          );
        }
        return synth;
      };
    const kit =
      () => {
        if (
          !drums
        ) {
          drums =
            new RMHDrums();
          drums.createNode(
            tone,
          );
          drums.connect(
            strip,
          );
          disposables.push(
            drums,
          );
        }
        return drums;
      };

    for (const clipId of track.clipIds) {
      const clip =
        project
          .clips[
          clipId
        ];
      if (
        !clip
      )
        continue;
      const clipStart =
        spb(
          clip.startBeat -
            opts.startBeat,
        );
      if (
        clip.type ===
        'midi'
      ) {
        for (const n of (
          clip as MidiClipData
        )
          .notes) {
          const at =
            clipStart +
            spb(
              n.startBeat,
            );
          if (
            at <
              0 ||
            at >=
              windowEnd
          )
            continue;
          const dur =
            Math.max(
              0.01,
              spb(
                n.durationBeats,
              ),
            );
          voice().triggerAttackRelease(
            tone
              .Frequency(
                n.pitch,
                'midi',
              )
              .toFrequency(),
            dur,
            at,
            n.velocity /
              127,
          );
        }
      } else if (
        clip.type ===
        'pattern'
      ) {
        const pattern =
          patterns.get(
            (
              clip as PatternClipData
            )
              .patternId,
          );
        if (
          !pattern
        )
          continue;
        for (const n of flattenPattern(
          pattern,
          clip.durationBeats,
        )) {
          const at =
            clipStart +
            spb(
              n.startBeat,
            );
          if (
            at <
              0 ||
            at >=
              windowEnd
          )
            continue;
          kit().triggerAttackRelease(
            n.pitch,
            Math.max(
              0.01,
              spb(
                n.durationBeats,
              ),
            ),
            at,
            n.velocity /
              127,
          );
        }
      } else if (
        clip.type ===
        'audio'
      ) {
        const a =
          clip as AudioClipData;
        const buffer =
          opts.buffers.get(
            a.bufferId,
          );
        if (
          !buffer
        )
          continue;
        const length =
          spb(
            a.durationBeats,
          );
        // A clip that starts before the render window is joined part-way through.
        const skip =
          Math.max(
            0,
            -clipStart,
          );
        const at =
          Math.max(
            0,
            clipStart,
          );
        if (
          at >=
            windowEnd ||
          skip >=
            length
        )
          continue;
        const player =
          new tone.Player(
            {
              url: buffer,
              fadeIn:
                spb(
                  a.fadeInBeats,
                ),
              fadeOut:
                spb(
                  a.fadeOutBeats,
                ),
            },
          ).connect(
            strip,
          );
        disposables.push(
          player,
        );
        player.start(
          at,
          spb(
            a.sampleOffset,
          ) +
            skip,
          length -
            skip,
        );
      }
    }
  }
  return {
    master,
    dispose:
      () => {
        for (const d of disposables) {
          try {
            d.dispose();
          } catch {
            // Already gone with the offline context.
          }
        }
      },
  };
}
