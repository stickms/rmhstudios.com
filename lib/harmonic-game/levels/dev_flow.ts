/**
 * dev_flow_a / dev_flow_b — a fake two-chapter chain for testing chapter transitions (plan H3.2).
 * `HARMONIC_DEV_CHAPTERS` (narrative/chapters.ts) lists them as chapters 1 and 2; B has no next
 * chapter, so ending it shows the "End of the current build" card.
 *
 * Each is one 512 x 256 hall, the player at the west end facing east; a `trigger_once` at the east
 * end fires `harmonic_chapter_end` (`dev_chapter_end`). In A the trigger first sets the `devSwitch`
 * flag through `dev_flag`, so the flag carries into B. From the console:
 * `ent_fire dev_flag Set devSwitch 1`, `ent_fire dev_chapter_end End` (skips the walk). `dev_flag`,
 * `dev_mood` (an enum), `dev_chapter_end` and `dev_ending` report to `logic_relay` probes.
 *
 * Source units (inches), Z up. Pure data: no DOM.
 */
import { box, room, v3, type EntitySource, type LevelSource } from '../compiler';

const CONCRETE = 'harmonic/concrete';
const WHITE_OLD = 'harmonic/paint_white_1971';
const NODRAW = 'harmonic/nodraw';

function hall(id: string, title: string, setsFlag: boolean): LevelSource {
  const entities: EntitySource[] = [
    { classname: 'info_player_start', origin: v3(48, 128, 1), angles: v3(0, 0, 0) },
    {
      classname: 'harmonic_flag',
      keys: { targetname: 'dev_flag', flag: 'devSwitch' },
      outputs: ['OnTrue dev_true,Trigger,,0,-1', 'OnFalse dev_false,Trigger,,0,-1'],
    },
    {
      classname: 'harmonic_flag',
      keys: { targetname: 'dev_mood', flag: 'devMood' },
      outputs: ['OnValuecalm dev_calm,Trigger,,0,-1', 'OnValuealarm dev_alarm,Trigger,,0,-1'],
    },
    {
      classname: 'harmonic_chapter_end',
      keys: { targetname: 'dev_chapter_end' },
      outputs: ['OnEnd dev_ended,Trigger,,0,-1'],
    },
    {
      classname: 'harmonic_ending',
      keys: { targetname: 'dev_ending' },
      outputs: ['OnChosen dev_chosen,Trigger,,0,-1'],
    },
    // Probes: the outputs above land on these relays.
    ...['dev_true', 'dev_false', 'dev_calm', 'dev_alarm', 'dev_ended', 'dev_chosen'].map(
      (targetname): EntitySource => ({ classname: 'logic_relay', keys: { targetname } }),
    ),
    {
      classname: 'trigger_once',
      keys: { spawnflags: '1' },
      brushes: [box(v3(416, 16, 0), v3(496, 240, 128), NODRAW)],
      outputs: [
        ...(setsFlag ? ['OnStartTouch dev_flag,Set,devSwitch 1,0,-1'] : []),
        'OnStartTouch dev_chapter_end,End,,0.05,-1',
      ],
    },
  ];
  return {
    id,
    title,
    world: [
      ...room({
        min: v3(0, 0, 0),
        max: v3(512, 256, 160),
        material: WHITE_OLD,
        floorMaterial: CONCRETE,
      }),
    ],
    entities,
  };
}

export const devFlowASource = (): LevelSource => hall('dev_flow_a', 'Dev flow A', true);
export const devFlowBSource = (): LevelSource => hall('dev_flow_b', 'Dev flow B', false);
