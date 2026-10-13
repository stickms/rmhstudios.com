import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useSession } from '@/components/Providers';
import { games } from '@/lib/games';
import { lobbyLink, lobbyPathLink } from '@/lib/lobby-link';

interface Pick {
  gameId: string;
  title: string;
  href: string;
}
interface Night {
  id: string;
  title: string;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  minutesPerGame: number;
  gameIds: string[];
  state: 'live' | 'upcoming';
  startsAt: string;
  endsAt: string;
  nowPlaying: (Pick & { endsAt: string; lobbyCode: string | null }) | null;
  upNext: (Pick & { startsAt: string }) | null;
}

/** Games whose lobby is a route; every other game takes `?lobby=`. */
const PATH_LOBBIES: Record<string, (href: string, code: string) => string> = {
  rmhbox: (href, code) => `${href}/${code}`,
  altair: (href, code) => `${href}/multiplayer/${code}`,
};

function joinHref(p: Pick & { lobbyCode: string | null }): string {
  if (!p.lobbyCode) return p.href;
  const path = PATH_LOBBIES[p.gameId];
  return (
    (path ? lobbyPathLink(path(p.href, p.lobbyCode)) : lobbyLink(p.lobbyCode, p.href)) || p.href
  );
}

function AdminCreate({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation('f-competitive');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const days = [
    t('gn-sun', { defaultValue: 'Sunday' }),
    t('gn-mon', { defaultValue: 'Monday' }),
    t('gn-tue', { defaultValue: 'Tuesday' }),
    t('gn-wed', { defaultValue: 'Wednesday' }),
    t('gn-thu', { defaultValue: 'Thursday' }),
    t('gn-fri', { defaultValue: 'Friday' }),
    t('gn-sat', { defaultValue: 'Saturday' }),
  ];
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const [h, m] = String(f.get('time')).split(':').map(Number);
    setBusy(true);
    try {
      const res = await fetch('/api/game-night', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: f.get('title'),
          weekday: Number(f.get('weekday')),
          startMinute: h * 60 + m,
          durationMinutes: Number(f.get('duration')),
          minutesPerGame: Number(f.get('per')),
          games: picked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? t('gn-failed', { defaultValue: 'Could not save' }));
      else onCreated();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4" pane>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gn-title">{t('gn-f-title', { defaultValue: 'Title' })}</Label>
          <Input id="gn-title" name="title" required defaultValue="Game night" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gn-day">{t('gn-f-day', { defaultValue: 'Day (UTC)' })}</Label>
          <Select id="gn-day" name="weekday" defaultValue="5">
            {days.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gn-time">{t('gn-f-time', { defaultValue: 'Start time (UTC)' })}</Label>
          <Input id="gn-time" name="time" type="time" required defaultValue="20:00" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gn-dur">{t('gn-f-duration', { defaultValue: 'Length (minutes)' })}</Label>
          <Input
            id="gn-dur"
            name="duration"
            type="number"
            min={20}
            max={360}
            required
            defaultValue={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gn-per">{t('gn-f-per', { defaultValue: 'Minutes per game' })}</Label>
          <Input
            id="gn-per"
            name="per"
            type="number"
            min={5}
            max={120}
            required
            defaultValue={20}
          />
        </div>
        <fieldset className="sm:col-span-2 space-y-1.5">
          <legend className="text-sm font-medium">
            {t('gn-f-games', { defaultValue: 'Games, in order' })}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {games.map((g) => (
              <label key={g.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(g.id)}
                  onChange={(e) =>
                    setPicked((p) =>
                      e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id),
                    )
                  }
                />
                {g.title}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={picked.length === 0}>
            {t('gn-create', { defaultValue: 'Add game night' })}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LobbyCodeForm({ night, onSaved }: { night: Night; onSaved: () => void }) {
  const { t } = useTranslation('f-competitive');
  const [code, setCode] = useState('');
  if (!night.nowPlaying) return null;
  const gameId = night.nowPlaying.gameId;
  const save = async () => {
    const res = await fetch('/api/game-night', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: night.id, lobby: { gameId, code: code.trim() || null } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? t('gn-failed', { defaultValue: 'Could not save' }));
    else {
      setCode('');
      onSaved();
    }
  };
  return (
    <div className="flex gap-2 pt-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t('gn-code-ph', { defaultValue: 'Lobby code for the live game' })}
        aria-label={t('gn-code', { defaultValue: 'Lobby code' })}
      />
      <Button variant="secondary" onClick={save}>
        {t('gn-post-code', { defaultValue: 'Post code' })}
      </Button>
    </div>
  );
}

export function GameNightBoard() {
  const { t } = useTranslation('f-competitive');
  const { data: session } = useSession();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;
  const [nights, setNights] = useState<Night[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/game-night');
    const data = await res.json().catch(() => ({ nights: [] }));
    setNights(res.ok ? data.nights : []);
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="space-y-4 max-w-3xl">
      {nights === null ? (
        <div className="h-32 rounded-site glass-fill animate-pulse" />
      ) : nights.length === 0 ? (
        <p className="text-site-text-dim py-8 text-center">
          {t('gn-none', { defaultValue: 'No game night is scheduled yet.' })}
        </p>
      ) : (
        nights.map((n) => (
          <Card key={n.id} className="p-4 space-y-2" pane>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{n.title}</h2>
              <span className="text-xs text-site-text-dim">
                {n.state === 'live'
                  ? t('gn-live-until', { defaultValue: 'Live until {{t}}', t: time(n.endsAt) })
                  : t('gn-next-at', {
                      defaultValue: 'Next: {{d}}',
                      d: new Date(n.startsAt).toLocaleString(undefined, {
                        weekday: 'long',
                        hour: 'numeric',
                        minute: '2-digit',
                      }),
                    })}
              </span>
            </div>
            {n.nowPlaying && (
              <div className="space-y-1">
                <div className="text-xs text-site-text-dim uppercase tracking-wide">
                  {t('gn-now', { defaultValue: 'Now playing' })} · {time(n.nowPlaying.endsAt)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{n.nowPlaying.title}</span>
                  <a href={joinHref(n.nowPlaying)}>
                    <Button size="sm">
                      {n.nowPlaying.lobbyCode
                        ? t('gn-join', { defaultValue: 'Join the lobby' })
                        : t('gn-open', { defaultValue: 'Open game' })}
                    </Button>
                  </a>
                </div>
                {isAdmin && <LobbyCodeForm night={n} onSaved={load} />}
              </div>
            )}
            {n.upNext && (
              <p className="text-sm text-site-text-dim">
                {t('gn-up-next', {
                  defaultValue: 'Up next: {{game}} at {{t}}',
                  game: n.upNext.title,
                  t: time(n.upNext.startsAt),
                })}
              </p>
            )}
            <p className="text-xs text-site-text-dim">
              {t('gn-rotation', {
                defaultValue: 'Rotation, {{n}} min each: {{games}}',
                n: n.minutesPerGame,
                games: n.gameIds
                  .map((id) => games.find((g) => g.id === id)?.title ?? id)
                  .join(' → '),
              })}
            </p>
          </Card>
        ))
      )}
      {isAdmin && <AdminCreate onCreated={load} />}
    </div>
  );
}
