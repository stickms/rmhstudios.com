/**
 * Gabriel's Horn — how a computer player is named.
 *
 * The server never sends an English name for a bot. It sends `{ n, level }` and
 * the client builds "Bot 2 · Steady" here, through `t()`, so the name follows the
 * reader's language. A person's name passes through untouched.
 */

import { useTranslation } from 'react-i18next';
import type { BotLevel } from '@features/gabriels-horn/engine/constants';
import type { BotInfo } from '@features/gabriels-horn/engine/net/events';

export function useBotText() {
  const { t } = useTranslation('gabriels-horn-bots');

  const levelLabel = (level: BotLevel): string => {
    switch (level) {
      case 'easy':
        return t('level-easy', { defaultValue: 'Easy' });
      case 'steady':
        return t('level-steady', { defaultValue: 'Steady' });
      case 'sharp':
        return t('level-sharp', { defaultValue: 'Sharp' });
    }
  };

  const botName = (bot: BotInfo): string =>
    t('bot-name', {
      defaultValue: 'Bot {{n}} · {{level}}',
      n: bot.n,
      level: levelLabel(bot.level),
    });

  /** Whatever a seat should be called on screen. */
  const seatName = (seat: { name: string; bot: BotInfo | null }): string => (seat.bot ? botName(seat.bot) : seat.name);

  return { levelLabel, botName, seatName };
}
