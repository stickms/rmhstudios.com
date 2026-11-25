/**
 * Gabriel's Horn — the small pieces computer players add to the lobby, the table
 * and the results. Every string is in the `gabriels-horn-bots` namespace.
 */

import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import { BOT_LEVELS, type BotLevel } from '@features/gabriels-horn/engine/constants';
import { hornNet } from '@features/gabriels-horn/engine/net/client';
import { useHornStore } from '@features/gabriels-horn/engine/store';
import type { BotInfo, LobbyPlayer } from '@features/gabriels-horn/engine/net/events';
import { useBotText } from './botNames';
import { HornButton, Panel } from './ui';
import { useState } from 'react';

/** "Practice table: not on the board", on the lobby, the table and the results. */
export function PracticeLine({ className }: { className?: string }) {
  const { t } = useTranslation('gabriels-horn-bots');
  return (
    <p className={className ?? 'text-center text-xs text-app-text-muted'} role="note">
      {t('practice-line', {
        defaultValue: 'Practice table: not on the board',
      })}
    </p>
  );
}

/** The mark beside a bot's name. The name beside it is text too, so this is never colour alone. */
export function BotMark({ bot }: { bot: BotInfo | null }) {
  if (!bot) return null;
  return <Bot className="me-1 inline size-3 align-baseline text-app-text-dim" aria-hidden="true" />;
}

/** The host's panel in the waiting lobby: add a bot at a level, remove one. */
export function BotSeatsPanel({ players, maxPlayers }: { players: LobbyPlayer[]; maxPlayers: number }) {
  const { t } = useTranslation('gabriels-horn-bots');
  const { levelLabel, botName } = useBotText();
  const selfSocketId = useHornStore((s) => s.selfSocketId);
  const hostSocketId = useHornStore((s) => s.lobby?.hostSocketId);
  const [level, setLevel] = useState<BotLevel>('steady');
  const isHost = selfSocketId !== null && selfSocketId === hostSocketId;
  const bots = players.filter((p) => p.bot);
  const full = players.length >= maxPlayers;

  // Everyone sees which seats are bots; only the host gets the controls.
  if (!isHost && bots.length === 0) return null;

  return (
    <Panel className="space-y-3">
      <h2 className="ghm-h2">
        {t('bots-heading', {
          defaultValue: 'Computer players',
        })}
      </h2>

      {bots.length > 0 ? (
        <ul className="space-y-1.5">
          {bots.map((player) => (
            <li key={player.socketId} className="flex items-center gap-2">
              <span className="min-w-0 grow truncate text-sm">
                <BotMark bot={player.bot} />
                {player.bot ? botName(player.bot) : ''}
              </span>
              {isHost ? (
                <HornButton
                  variant="ghost"
                  size="sm"
                  onClick={() => hornNet.removeBot(player.socketId)}
                  aria-label={t('remove-bot-label', {
                    defaultValue: 'Remove {{name}}',
                    name: player.bot ? botName(player.bot) : '',
                  })}
                >
                  {t('remove-bot', {
                    defaultValue: 'Remove',
                  })}
                </HornButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-app-text-muted">
          {t('bots-empty', {
            defaultValue: 'No computer players. Add one to play without waiting for anyone.',
          })}
        </p>
      )}

      {isHost ? (
        <div className="space-y-2">
          <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
            <legend className="mb-1 text-xs text-app-text-muted">
              {t('level-legend', {
                defaultValue: 'Level',
              })}
            </legend>
            {BOT_LEVELS.map((option) => (
              <label
                key={option}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border px-3 text-sm has-[:checked]:border-app-accent"
              >
                <input
                  type="radio"
                  name="gh-bot-level"
                  value={option}
                  checked={level === option}
                  onChange={() => setLevel(option)}
                  className="size-4 accent-app-accent"
                />
                {levelLabel(option)}
              </label>
            ))}
          </fieldset>
          <HornButton className="w-full" disabled={full} onClick={() => hornNet.addBot(level)}>
            <Bot className="size-4" aria-hidden="true" />
            {t('add-bot', {
              defaultValue: 'Add a bot',
            })}
          </HornButton>
          {full ? (
            <p className="text-center text-xs text-app-text-dim">
              {t('table-full', {
                defaultValue: 'The table is full. Remove a bot to seat a person.',
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
