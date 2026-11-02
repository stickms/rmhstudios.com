/**
 * Dev scripts for `dev_dialogue` (H3.1): a short exchange between Ines (in the room) and Odile
 * (on the Trust's radio), and a once-only note. Keys `dev.<scene>.<n>`; the English catalogue is
 * `locales/en/harmonic.json`.
 */
import { radio, say } from '../speakers';
import type { DialogueScript } from '../types';

export const DEV_SCRIPTS: DialogueScript[] = [
  {
    id: 'dev.radio_check',
    lines: [
      radio('odile', 'dev.radio_check.1', 'Ines, this is Odile. Do you read me?'),
      say('ines', 'dev.radio_check.2', 'I read you. The ice is quiet.'),
      radio(
        'odile',
        'dev.radio_check.3',
        'The survey plane stopped reporting forty minutes ago. What can you see?',
      ),
      say('ines', 'dev.radio_check.4', 'White. Wind. A hull outline, low on the ice, then gone.'),
      radio(
        'odile',
        'dev.radio_check.5',
        'Keep the wind behind you. I am reading the 1971 log. It begins with the weather.',
      ),
    ],
    then: ['OnUser1'],
  },
  {
    id: 'dev.field_note',
    once: true,
    lines: [
      say('ines', 'dev.field_note.1', 'Frost on the inside of the glass.'),
      say('ines', 'dev.field_note.2', 'Nobody has been in here for a long time.'),
    ],
  },
];
