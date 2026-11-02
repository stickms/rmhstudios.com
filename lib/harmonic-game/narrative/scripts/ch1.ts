/**
 * Chapter 1, "Whiteout" (plan H4.1). Ines walks out of the survey-plane wreck; Odile Brandt is on
 * the Trust's radio and never on site. Short, literal lines. Keys `ch1.<scene>.<n>`; the English
 * catalogue is `locales/en/harmonic.json` (keep the defaults identical).
 *
 * Scenes, in play order: `wreck` (waking), `hatch` (the jammed hatch), `outside` (the blizzard),
 * `hut` (first shelter), `cache` (the supply cache), `ridge` (the ship; `OnLine3` strikes the
 * flicker), `fence` (the perimeter).
 */
import { radio, say } from '../speakers';
import type { DialogueScript } from '../types';

export const CH1_SCRIPTS: DialogueScript[] = [
  {
    id: 'ch1.wreck',
    once: true,
    lines: [
      radio('odile', 'ch1.wreck.1', 'Ines. The plane stopped reporting. Can you hear me?'),
      say('ines', 'ch1.wreck.2', 'I hear you. Power is gone. The cabin is on its side.'),
      radio('odile', 'ch1.wreck.3', 'Are you hurt?'),
      say('ines', 'ch1.wreck.4', 'Bruised. The pilot is not here. I am going to find the hatch.'),
    ],
  },
  {
    id: 'ch1.hatch',
    once: true,
    lines: [
      say('ines', 'ch1.hatch.1', 'The hatch is bent in its frame.'),
      say('ines', 'ch1.hatch.2', 'There is a pry bar in the survey kit.'),
    ],
  },
  {
    id: 'ch1.outside',
    once: true,
    lines: [
      say('ines', 'ch1.outside.1', 'Cold. Already.'),
      radio('odile', 'ch1.outside.2', 'You will lose heat fast out there. Do not stand still.'),
      radio(
        'odile',
        'ch1.outside.3',
        'The Trust set marker poles from the landing strip. Follow them to the survey hut.',
      ),
    ],
  },
  {
    id: 'ch1.hut',
    once: true,
    lines: [
      say('ines', 'ch1.hut.1', 'A heater. It still runs.'),
      radio('odile', 'ch1.hut.2', 'Good. Stay until you are warm.'),
      radio(
        'odile',
        'ch1.hut.3',
        'Past the hut the ice is open. There is a pressure ridge across your line.',
      ),
      say('ines', 'ch1.hut.4', 'I will find a way over it.'),
    ],
  },
  {
    id: 'ch1.cache',
    once: true,
    lines: [
      say('ines', 'ch1.cache.1', 'Crates. Meridian stencil on every one.'),
      radio('odile', 'ch1.cache.2', 'A supply cache. They are further out than we were told.'),
      say('ines', 'ch1.cache.3', 'Pistol rounds. No pistol. I will take them anyway.'),
    ],
  },
  {
    id: 'ch1.ridge',
    once: true,
    lines: [
      say('ines', 'ch1.ridge.1', 'Odile. There is something on the ice.'),
      radio('odile', 'ch1.ridge.2', 'Describe it.'),
      say('ines', 'ch1.ridge.3', 'A hull. Bow, funnel, mast. Longer than the strip.'),
      say('ines', 'ch1.ridge.4', 'It is thin, like frost on a window. It is flickering.'),
      radio('odile', 'ch1.ridge.5', 'That is the Saint Ilse. The logs say it comes twice a day.'),
      say('ines', 'ch1.ridge.6', 'It is gone.'),
      radio(
        'odile',
        'ch1.ridge.7',
        'Meridian built their post under it. Their fence is a few hundred metres east.',
      ),
    ],
  },
  {
    id: 'ch1.fence',
    once: true,
    lines: [
      say('ines', 'ch1.fence.1', 'Floodlights. A gate. Two sentries, none moving.'),
      radio('odile', 'ch1.fence.2', 'Stay out of the light, Ines. I will read you the first log.'),
      radio(
        'odile',
        'ch1.fence.3',
        'Stillwater trials, day one: the weather held, and the engine was quiet.',
      ),
    ],
  },
];
