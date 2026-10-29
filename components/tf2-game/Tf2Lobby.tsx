/**
 * The TF2 server browser: play offline against bots (a listen server in a
 * worker, no account needed), or online through the games hub — the room list,
 * creating a room (map, max players, bots, bot difficulty, private) and
 * joining by code. Choosing any of them hands a `Tf2Session` to the play page,
 * which mounts the game. Lives in the TF2 Hub's palette (AppShell
 * `tf2hud-theme`), with the hub's own controls (components/tf2-hud/ui).
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Globe, KeyRound, Lock, Plus, RefreshCw, Users } from 'lucide-react';
import { useSession } from '@/components/Providers';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import { Btn, Field, NumberField, SelectField, TextField, Toggle } from '@/components/tf2-hud/ui';
import { TF2_MAPS } from '@/lib/tf2-game/data/maps';
import { BOT_DIFFICULTIES, TF2_LIMITS, TF2_ROOM_CODE_RE, type BotDifficulty, type RoomListEntry } from '@/lib/tf2-game/net/events';
import type { Tf2Session } from '@/lib/tf2-game/client/tf2-client';

const NAME_KEY = 'rmh:tf2-game:name';

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: the name lasts this visit */
  }
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export default function Tf2Lobby({ onStart }: { onStart: (session: Tf2Session) => void }) {
  const { t } = useTranslation('c-tf2-game');
  const { data: session } = useSession();
  const accountName = (session as { user?: { name?: string | null } } | null)?.user?.name ?? '';
  const [name, setName] = useState('');
  useEffect(() => setName(readName()), []);
  const playerName = (name.trim() || accountName || t('play_default_name', { defaultValue: 'Player' })).slice(0, 32);

  const difficultyLabel = (d: BotDifficulty) =>
    ({
      easy: t('play_diff_easy', { defaultValue: 'Easy' }),
      normal: t('play_diff_normal', { defaultValue: 'Normal' }),
      hard: t('play_diff_hard', { defaultValue: 'Hard' }),
      expert: t('play_diff_expert', { defaultValue: 'Expert' }),
    })[d];

  // Offline.
  const [offMap, setOffMap] = useState(TF2_MAPS[0]?.name ?? 'ctf_2fort');
  const [offBots, setOffBots] = useState(11);
  const [offDiff, setOffDiff] = useState<BotDifficulty>('normal');

  // Online.
  const [rooms, setRooms] = useState<RoomListEntry[] | null>(null);
  const [status, setStatus] = useState<string>('connecting');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [room, setRoom] = useState({
    name: '',
    map: TF2_MAPS[0]?.name ?? 'ctf_2fort',
    maxPlayers: 24,
    botCount: 8,
    botDifficulty: 'normal' as BotDifficulty,
    private: false,
  });

  useEffect(() => {
    let alive = true;
    let net: typeof import('@/lib/tf2-game/net/client') | null = null;
    void import('@/lib/tf2-game/net/client').then(async (m) => {
      if (!alive) return;
      net = m;
      try {
        await m.connectTf2({
          onStatus: (s) => alive && setStatus(s),
          onRooms: (list) => alive && setRooms(list),
        });
        m.tf2.listRooms();
      } catch {
        // No games hub configured (a local build without VITE_SOCKET_URL): offline play still works.
        if (alive) {
          setStatus('unavailable');
          setRooms([]);
        }
      }
    });
    return () => {
      alive = false;
      net?.setTf2Handlers({});
    };
  }, []);

  const refresh = () => {
    void import('@/lib/tf2-game/net/client').then((m) => m.tf2.listRooms());
  };

  const codeValid = TF2_ROOM_CODE_RE.test(code.trim().toUpperCase());
  const mapTitle = useMemo(() => new Map(TF2_MAPS.map((m) => [m.name, m.title])), []);

  const start = (s: Tf2Session) => {
    if (name.trim()) writeName(name.trim());
    onStart(s);
  };

  const card = 'rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5';

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header title={t('play_title', { defaultValue: 'Play Team Fortress 2' })} backLabel={t('play_back_hub', { defaultValue: 'Hub' })} backHref="/tf2" />
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={card} aria-labelledby="tf2-offline-title">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="size-5 text-(--app-accent-text)" aria-hidden />
            <h2 id="tf2-offline-title" className="tf2hud-title text-2xl">
              {t('play_offline_title', { defaultValue: 'Offline practice' })}
            </h2>
          </div>
          <p className="mb-4 text-sm text-(--app-text-muted)">
            {t('play_offline_body', {
              defaultValue: 'A match against bots that runs entirely in your browser. No account or connection needed once the map has loaded.',
            })}
          </p>
          <div className="grid gap-3">
            <Field label={t('play_name', { defaultValue: 'Your name' })}>
              <TextField value={name} maxLength={32} placeholder={accountName || t('play_default_name', { defaultValue: 'Player' })} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('play_map', { defaultValue: 'Map' })}>
              <SelectField value={offMap} onChange={(e) => setOffMap(e.target.value)}>
                {TF2_MAPS.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.title}
                  </option>
                ))}
              </SelectField>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('play_bots', { defaultValue: 'Bots' })}>
                <NumberField label={t('play_bots', { defaultValue: 'Bots' })} value={offBots} min={0} max={TF2_LIMITS.MAX_BOTS} onChange={(v) => setOffBots(clampInt(v, 0, TF2_LIMITS.MAX_BOTS))} />
              </Field>
              <Field label={t('play_difficulty', { defaultValue: 'Difficulty' })}>
                <SelectField value={offDiff} onChange={(e) => setOffDiff(e.target.value as BotDifficulty)}>
                  {BOT_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {difficultyLabel(d)}
                    </option>
                  ))}
                </SelectField>
              </Field>
            </div>
            <Btn
              variant="primary"
              size="md"
              icon={Bot}
              className="mt-1 w-full justify-center"
              onClick={() =>
                start({ kind: 'offline', map: offMap, botCount: offBots, difficulty: offDiff, maxPlayers: Math.max(2, offBots + 1), playerName })
              }
            >
              {t('play_offline_start', { defaultValue: 'Play offline' })}
            </Btn>
          </div>
        </section>

        <section className={card} aria-labelledby="tf2-online-title">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Globe className="size-5 text-(--app-accent-text)" aria-hidden />
            <h2 id="tf2-online-title" className="tf2hud-title text-2xl">
              {t('play_online_title', { defaultValue: 'Servers' })}
            </h2>
            <span className="ms-auto text-xs text-(--app-text-dim)" role="status">
              {status === 'connected'
                ? t('play_status_online', { defaultValue: 'Connected' })
                : status === 'connecting'
                  ? t('play_status_connecting', { defaultValue: 'Connecting…' })
                  : t('play_status_offline', { defaultValue: 'Hub unavailable — retrying' })}
            </span>
            <Btn size="xs" variant="ghost" icon={RefreshCw} onClick={refresh} disabled={status !== 'connected'}>
              {t('play_refresh', { defaultValue: 'Refresh' })}
            </Btn>
          </div>

          {rooms && rooms.length > 0 ? (
            <ul className="mb-4 grid gap-2">
              {rooms.map((r) => (
                <li key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.name || r.code}</span>
                    <span className="block text-xs text-(--app-text-muted)">
                      {mapTitle.get(r.map) ?? r.map}
                      {' · '}
                      {r.state === 'loading' ? t('play_room_loading', { defaultValue: 'starting' }) : t('play_room_running', { defaultValue: 'in progress' })}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-(--app-text-muted)">
                    <Users className="size-3.5" aria-hidden />
                    {t('play_room_players', { defaultValue: '{{n}}/{{max}}', n: r.players + r.bots, max: r.maxPlayers })}
                  </span>
                  <Btn size="xs" variant="secondary" onClick={() => start({ kind: 'online-join', code: r.code, playerName })} disabled={r.players >= r.maxPlayers}>
                    {t('play_join', { defaultValue: 'Join' })}
                  </Btn>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 rounded-(--app-radius-sm) border border-dashed border-(--app-border) px-3 py-4 text-center text-sm text-(--app-text-muted)">
              {rooms === null
                ? t('play_rooms_loading', { defaultValue: 'Looking for servers…' })
                : t('play_rooms_empty', { defaultValue: 'No public servers right now. Create one and invite your friends.' })}
            </p>
          )}

          <form
            className="mb-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (codeValid) start({ kind: 'online-join', code: code.trim().toUpperCase(), playerName });
            }}
          >
            <Field label={t('play_code', { defaultValue: 'Join by code' })} className="min-w-40 flex-1">
              <TextField
                value={code}
                maxLength={TF2_LIMITS.ROOM_CODE_LENGTH}
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t('play_code_placeholder', { defaultValue: 'ABC234' })}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </Field>
            <Btn type="submit" size="sm" icon={KeyRound} disabled={!codeValid}>
              {t('play_join', { defaultValue: 'Join' })}
            </Btn>
          </form>

          {creating ? (
            <form
              className="grid gap-3 border-t border-(--app-border) pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                const maxPlayers = clampInt(room.maxPlayers, TF2_LIMITS.MIN_PLAYERS, TF2_LIMITS.MAX_PLAYERS);
                start({
                  kind: 'online-create',
                  room: {
                    map: room.map,
                    maxPlayers,
                    botCount: clampInt(room.botCount, 0, Math.min(TF2_LIMITS.MAX_BOTS, maxPlayers - 1)),
                    botDifficulty: room.botDifficulty,
                    name: (room.name.trim() || t('play_room_default_name', { defaultValue: '{{name}}’s server', name: playerName })).slice(0, TF2_LIMITS.ROOM_NAME_MAX_LENGTH),
                    private: room.private,
                    playerName,
                  },
                });
              }}
            >
              <Field label={t('play_room_name', { defaultValue: 'Server name' })}>
                <TextField value={room.name} maxLength={TF2_LIMITS.ROOM_NAME_MAX_LENGTH} onChange={(e) => setRoom({ ...room, name: e.target.value })} />
              </Field>
              <Field label={t('play_map', { defaultValue: 'Map' })}>
                <SelectField value={room.map} onChange={(e) => setRoom({ ...room, map: e.target.value })}>
                  {TF2_MAPS.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.title}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t('play_max_players', { defaultValue: 'Max players' })}>
                  <NumberField
                    label={t('play_max_players', { defaultValue: 'Max players' })}
                    value={room.maxPlayers}
                    min={TF2_LIMITS.MIN_PLAYERS}
                    max={TF2_LIMITS.MAX_PLAYERS}
                    onChange={(v) => setRoom({ ...room, maxPlayers: clampInt(v, TF2_LIMITS.MIN_PLAYERS, TF2_LIMITS.MAX_PLAYERS) })}
                  />
                </Field>
                <Field label={t('play_bots', { defaultValue: 'Bots' })}>
                  <NumberField label={t('play_bots', { defaultValue: 'Bots' })} value={room.botCount} min={0} max={TF2_LIMITS.MAX_BOTS} onChange={(v) => setRoom({ ...room, botCount: clampInt(v, 0, TF2_LIMITS.MAX_BOTS) })} />
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
              <div className="flex gap-2">
                <Btn type="submit" variant="primary" size="md" icon={Plus} disabled={status !== 'connected'}>
                  {t('play_create', { defaultValue: 'Create server' })}
                </Btn>
                <Btn size="md" variant="ghost" onClick={() => setCreating(false)}>
                  {t('play_cancel', { defaultValue: 'Cancel' })}
                </Btn>
              </div>
            </form>
          ) : (
            <Btn size="sm" icon={Plus} onClick={() => setCreating(true)}>
              {t('play_create_open', { defaultValue: 'Create a server' })}
            </Btn>
          )}
        </section>

        <p className="text-center text-xs text-(--app-text-dim) lg:col-span-2">
          {t('play_legal', {
            defaultValue:
              'An independent, clean-room engine. Team Fortress 2 and its content are trademarks and property of Valve Corporation; this fan project is not affiliated with Valve.',
          })}
        </p>
      </main>
    </div>
  );
}
