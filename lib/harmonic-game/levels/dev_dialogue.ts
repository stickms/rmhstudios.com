/**
 * dev_dialogue — the dialogue and hint test level (plan H3.1). One hall, 512 x 384, the player at
 * the west end facing east, three volumes on the way:
 *
 *   x  96..144  trigger_once      starts `dev.radio_check` (Odile on the radio, Ines in the room)
 *   x 224..288  trigger_multiple  starts `dev.field_note` (a `once` script: plays the first time only)
 *   x 352..448  trigger_multiple  shows a hint while the player stands in it
 *
 * Dialogue entities `dev_radio_check` / `dev_field_note` and the hint `dev_hint` can also be driven
 * from the console: `ent_fire dev_radio_check Start`.
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import { box, room, v3, type EntitySource, type LevelSource } from '../compiler';

const CONCRETE = 'harmonic/concrete';
const WHITE_OLD = 'harmonic/paint_white_1971';
const NODRAW = 'harmonic/nodraw';

const volume = (x0: number, x1: number) => [box(v3(x0, 16, 0), v3(x1, 368, 128), NODRAW)];

export function devDialogueSource(): LevelSource {
  const entities: EntitySource[] = [
    { classname: 'info_player_start', origin: v3(48, 192, 1), angles: v3(0, 0, 0) },
    {
      classname: 'harmonic_dialogue',
      keys: { targetname: 'dev_radio_check', script: 'dev.radio_check' },
      outputs: [
        'OnLine1 dev_line1,Trigger,,0,-1',
        'OnFinished dev_finished,Trigger,,0,-1',
        'OnUser1 dev_then,Trigger,,0,-1',
        'OnCancelled dev_cancelled,Trigger,,0,-1',
      ],
    },
    // Probes for the tests: the dialogue's outputs land on these relays.
    { classname: 'logic_relay', keys: { targetname: 'dev_line1' } },
    { classname: 'logic_relay', keys: { targetname: 'dev_finished' } },
    { classname: 'logic_relay', keys: { targetname: 'dev_then' } },
    { classname: 'logic_relay', keys: { targetname: 'dev_cancelled' } },
    {
      classname: 'harmonic_dialogue',
      keys: { targetname: 'dev_field_note', script: 'dev.field_note' },
    },
    {
      classname: 'harmonic_hint',
      keys: {
        targetname: 'dev_hint',
        hintkey: 'dev.hint.1',
        hinttext: 'Use doors and buttons with the use key.',
      },
    },
    {
      classname: 'trigger_once',
      keys: { spawnflags: '1' },
      brushes: volume(96, 144),
      outputs: ['OnStartTouch dev_radio_check,Start,,0,-1'],
    },
    {
      classname: 'trigger_multiple',
      keys: { spawnflags: '1', wait: '1' },
      brushes: volume(224, 288),
      outputs: ['OnStartTouch dev_field_note,Start,,0,-1'],
    },
    {
      classname: 'trigger_multiple',
      keys: { spawnflags: '1', wait: '0.1' },
      brushes: volume(352, 448),
      outputs: ['OnStartTouch dev_hint,ShowHint,,0,-1', 'OnEndTouch dev_hint,HideHint,,0,-1'],
    },
  ];
  return {
    id: 'dev_dialogue',
    title: 'Dev dialogue',
    world: [
      ...room({
        min: v3(0, 0, 0),
        max: v3(512, 384, 160),
        material: WHITE_OLD,
        floorMaterial: CONCRETE,
      }),
    ],
    entities,
  };
}
