/**
 * Start a server for friends: **peer-to-peer** (the match runs in this browser
 * as a listen server, friends connect to it directly over WebRTC — no server
 * of ours simulates it) or **dedicated** (a match on the games hub). Both need
 * a signed-in account; a visitor sees a sign-in prompt that returns here with
 * any invite intact (`lobbyReturnPath`).
 *
 * The P2P form says what hosting means: it shares the host's IP address with
 * the players who join (WebRTC's nature), the match moves to another player's
 * browser when the host leaves (host migration), and 12 players at most (the
 * host uploads a snapshot stream to every member).
 */
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Info, Lock, LogIn, Plus, Server, Share2, TriangleAlert } from 'lucide-react';
import { Btn, Field, NumberField, SelectField, TextField, Toggle } from '@/components/tf2-hud/ui';
import { TfTabs } from '@/components/tf2-hud/TfTabs';
import { TF2_MAPS, findTf2Map } from '@/lib/tf2-game/data/maps';
import { BOT_DIFFICULTIES, TF2_LIMITS, type BotDifficulty } from '@/lib/tf2-game/net/events';
import { lobbyReturnPath } from '@/lib/lobby-link';
import type { Tf2Session } from '@/lib/tf2-game/client/tf2-client';

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export default function HostGameCard({
  signedIn,
  accountName,
  hubReady,
  invite,
  onStart,
  difficultyLabel,
}: {
  signedIn: boolean;
  /** The account's name: the name other players see. */
  accountName: string;
  /** The games hub is connected (needed to announce either kind of room). */
  hubReady: boolean;
  /** An invite code this page was opened with (kept through sign-in). */
  invite: string | null;
  onStart: (session: Tf2Session) => void;
  difficultyLabel: (d: BotDifficulty) => string;
}) {
  const { t } = useTranslation('c-tf2-game');
  const [kind, setKind] = useState<'p2p' | 'dedicated'>('p2p');
  const [room, setRoom] = useState({
    name: '',
    map: TF2_MAPS[0]?.name ?? 'ctf_2fort',
    maxPlayers: TF2_LIMITS.P2P_MAX_PLAYERS as number,
    botCount: 6,
    botDifficulty: 'normal' as BotDifficulty,
    private: false,
  });
  const cap = kind === 'p2p' ? TF2_LIMITS.P2P_MAX_PLAYERS : TF2_LIMITS.MAX_PLAYERS;
  const maxPlayers = clampInt(room.maxPlayers, TF2_LIMITS.MIN_PLAYERS, cap);
  const defaultName = t('play_room_default_name', { defaultValue: '{{name}}’s server', name: accountName });

  const submit = () => {
    const map = findTf2Map(room.map);
    if (!map) return;
    const common = {
      map: map.name,
      mode: map.mode,
      maxPlayers,
      botCount: clampInt(room.botCount, 0, Math.min(TF2_LIMITS.MAX_BOTS, maxPlayers - 1)),
      botDifficulty: room.botDifficulty,
      name: (room.name.trim() || defaultName).slice(0, TF2_LIMITS.ROOM_NAME_MAX_LENGTH),
      private: room.private,
    };
    if (kind === 'p2p') onStart({ kind: 'p2p-host', room: common, playerName: accountName });
    else onStart({ kind: 'online-create', room: { ...common, playerName: accountName } });
  };

  const card = 'rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5';

  return (
    <section className={card} aria-labelledby="tf2-host-title">
      <div className="mb-3 flex items-center gap-2">
        <Server className="size-5 text-(--app-accent-text)" aria-hidden />
        <h2 id="tf2-host-title" className="tf2hud-title text-2xl">
          {t('host_title', { defaultValue: 'Host a game' })}
        </h2>
      </div>
      {!signedIn ? (
        <div className="grid gap-3">
          <p className="text-sm text-(--app-text-muted)">
            {t('mp_sign_in_body', {
              defaultValue: 'Online play needs an account: other players see your account name. Offline practice works without one.',
            })}
          </p>
          <Link
            to="/login"
            search={{ callbackURL: lobbyReturnPath('/tf2/play', invite) }}
            data-menu-item
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-(--app-radius-sm) bg-(--app-accent) px-4 text-sm font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover) sm:w-fit sm:pointer-fine:min-h-9"
          >
            <LogIn className="size-4" aria-hidden />
            {t('mp_sign_in', { defaultValue: 'Sign in to play online' })}
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TfTabs
            aria-label={t('host_kind', { defaultValue: 'Where the match runs' })}
            value={kind}
            onChange={(id) => setKind(id as 'p2p' | 'dedicated')}
            tabs={[
              { id: 'p2p', label: t('host_kind_p2p', { defaultValue: 'Peer-to-peer' }), icon: Share2 },
              { id: 'dedicated', label: t('host_kind_dedicated', { defaultValue: 'Dedicated' }), icon: Server },
            ]}
          />
          <p className="text-sm text-(--app-text-muted)">
            {kind === 'p2p'
              ? t('host_p2p_body', {
                  defaultValue: 'The match runs in your browser and your friends connect to you directly. You play with no lag; keep this tab open.',
                })
              : t('host_dedicated_body', { defaultValue: 'The match runs on our games server. It keeps going when you leave while others play.' })}
          </p>
          <Field label={t('play_room_name', { defaultValue: 'Server name' })}>
            <TextField
              value={room.name}
              maxLength={TF2_LIMITS.ROOM_NAME_MAX_LENGTH}
              placeholder={defaultName}
              data-menu-item
              onChange={(e) => setRoom({ ...room, name: e.target.value })}
            />
          </Field>
          <Field label={t('play_map', { defaultValue: 'Map' })}>
            <SelectField value={room.map} data-menu-item onChange={(e) => setRoom({ ...room, map: e.target.value })}>
              {TF2_MAPS.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.title}
                </option>
              ))}
            </SelectField>
          </Field>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
            <Field label={t('play_max_players', { defaultValue: 'Max players' })}>
              <NumberField
                label={t('play_max_players', { defaultValue: 'Max players' })}
                value={maxPlayers}
                min={TF2_LIMITS.MIN_PLAYERS}
                max={cap}
                onChange={(v) => setRoom({ ...room, maxPlayers: clampInt(v, TF2_LIMITS.MIN_PLAYERS, cap) })}
              />
            </Field>
            <Field label={t('play_bots', { defaultValue: 'Bots' })}>
              <NumberField
                label={t('play_bots', { defaultValue: 'Bots' })}
                value={room.botCount}
                min={0}
                max={maxPlayers - 1}
                onChange={(v) => setRoom({ ...room, botCount: clampInt(v, 0, maxPlayers - 1) })}
              />
            </Field>
            <Field label={t('play_difficulty', { defaultValue: 'Difficulty' })}>
              <SelectField value={room.botDifficulty} onChange={(e) => setRoom({ ...room, botDifficulty: e.target.value as BotDifficulty })}>
                {BOT_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {difficultyLabel(d)}
                  </option>
                ))}
              </SelectField>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Toggle checked={room.private} onChange={(v) => setRoom({ ...room, private: v })} label={t('play_private', { defaultValue: 'Private (join by code only)' })} />
            <Lock className="size-3.5 text-(--app-text-muted)" aria-hidden />
            {t('play_private', { defaultValue: 'Private (join by code only)' })}
          </label>
          {kind === 'p2p' ? (
            <ul className="grid gap-2 text-xs text-(--app-text-muted)">
              <li className="flex gap-2 rounded-(--app-radius-sm) bg-(--app-warning-dim) p-2 text-(--app-warning)">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('host_p2p_ip_warning', {
                  defaultValue: 'Hosting peer-to-peer shares your IP address with players who join. Host for people you know.',
                })}
              </li>
              <li className="flex gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('host_p2p_migration', {
                  defaultValue: "If you leave, the match moves to another player's browser and goes on. Up to 12 players.",
                })}
              </li>
            </ul>
          ) : null}
          <Btn type="submit" variant="primary" size="md" icon={Plus} disabled={!hubReady} data-menu-item className="w-full justify-center sm:w-fit">
            {kind === 'p2p' ? t('host_p2p_start', { defaultValue: 'Host a P2P game' }) : t('play_create', { defaultValue: 'Create server' })}
          </Btn>
        </form>
      )}
    </section>
  );
}
