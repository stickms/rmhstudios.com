/**
 * RMH Vibes as a Discord Activity: everyone in the voice channel's Activity instance joins
 * one room, the host picks a vibe, and multiplayer vibes talk through the room.
 *
 * The SDK handshake is the gateway's (`discord` is passed in; never a second SDK). The room
 * is `connectVibeRoom`; the host is whoever the hub says it is. The frame runs under the
 * viewer's sandbox, so nothing here can reach outside `/discord/*`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Crown, Loader2, TriangleAlert, UserPlus, X } from 'lucide-react';
import { discordAvatarUrl, setActivityStatus, type DiscordContext } from '@/lib/discord-sdk';
import { toast } from '@/lib/shared/app-toast';
import { SITE_URL } from '@/lib/seo';
import { connectVibeRoom, type VibeRoomClient } from '@/lib/rmhvibe/room-socket';
import type { VibeRoomMember, VibeRoomState } from '@/lib/rmhvibe/room-events';
import { adaptVibeHtmlForProxy } from '@/lib/rmhvibe/activity-html';
import { fetchChannelLaunch, fetchVibePage } from '@/lib/rmhvibe/vibe-activity-client';
import { VIEWER_SANDBOX } from '@/components/rmhvibe/VibeFrame';
import type { TweakSpec, TweakValue } from '@/lib/rmhvibe/tweaks';
import { VibeGalleryPicker } from './VibeGalleryPicker';
import { VibePlayer } from './VibePlayer';
import { VIBES_MAX_PARTY, displayThumbUrl, presenceThumbUrl } from './vibe-activity-utils';

/** No room state this long after connecting means the hub is unreachable or refused the token. */
const CONNECT_TIMEOUT_MS = 15_000;
const LAYOUT_PIP = 1;

interface LoadedPage {
  slug: string;
  title: string;
  html: string;
  thumbnailUrl: string | null;
  tweakSpec: TweakSpec[];
  tweakValues: Record<string, TweakValue>;
}

function useLayoutPip(sdk: DiscordContext['sdk']): boolean {
  const [pip, setPip] = useState(false);
  useEffect(() => {
    const handler = (event: { layout_mode: number }) => setPip(event.layout_mode === LAYOUT_PIP);
    sdk.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler).catch(() => {
      // Older clients: stay in the focused layout.
    });
    return () => {
      sdk.unsubscribe('ACTIVITY_LAYOUT_MODE_UPDATE', handler).catch(() => {});
    };
  }, [sdk]);
  return pip;
}

function Avatar({ name, url, host }: { name: string; url: string | null; host?: boolean }) {
  return (
    <span className="relative inline-flex" title={name}>
      {url ? (
        <img src={url} alt={name} className="h-7 w-7 rounded-full bg-[#1e1f22] object-cover" />
      ) : (
        <span
          aria-label={name}
          className="h-7 w-7 rounded-full bg-[#5865f2] text-white text-xs font-semibold inline-flex items-center justify-center"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {host && <Crown className="absolute -top-1.5 -right-1 h-3.5 w-3.5 text-[#f0b232]" aria-hidden />}
    </span>
  );
}

export function VibeDiscordActivity({
  discord,
  onExit,
}: {
  discord: DiscordContext;
  onExit: () => void;
}) {
  const { t } = useTranslation('r-discord');
  const { sdk, accessToken, channelId } = discord;
  const pip = useLayoutPip(sdk);

  const [attempt, setAttempt] = useState(0);
  const [client, setClient] = useState<VibeRoomClient | null>(null);
  const [room, setRoom] = useState<VibeRoomState | null>(null);
  const [connectFailed, setConnectFailed] = useState(false);
  const [page, setPage] = useState<LoadedPage | null>(null);
  const [pageFailed, setPageFailed] = useState(false);
  const launchChecked = useRef(false);

  // Connect (and re-connect on "Try again").
  useEffect(() => {
    let timer: number | undefined;
    let c: VibeRoomClient | null = null;
    setConnectFailed(false);
    setRoom(null);
    const fail = () => {
      setConnectFailed(true);
      toast.error(t('vibes-connect-failed-toast', { defaultValue: "Couldn't connect to the room" }));
    };
    try {
      c = connectVibeRoom({ discordToken: accessToken, channelId, instanceId: sdk.instanceId });
      const off = c.onState((s) => {
        window.clearTimeout(timer);
        setRoom(s);
      });
      timer = window.setTimeout(fail, CONNECT_TIMEOUT_MS);
      setClient(c);
      return () => {
        window.clearTimeout(timer);
        off();
        c?.destroy();
        setClient(null);
      };
    } catch {
      fail();
      return undefined;
    }
    // `t` is stable per language; reconnecting on it would drop the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, channelId, sdk, attempt]);

  const members: VibeRoomMember[] = room?.members ?? [];
  const hostSid = room?.hostSid ?? null;
  const slug = room?.slug ?? null;
  const selfSid = client?.selfSid() ?? null;
  const isHost = !!room && hostSid !== null && hostSid === selfSid;
  const hostName = members.find((m) => m.sid === hostSid)?.name ?? null;

  // Voice-channel scoping: the first state with nothing selected lets the host start the
  // vibe the channel was launched with.
  useEffect(() => {
    if (!client || !room || room.slug !== null || !isHost || !channelId || launchChecked.current) return;
    launchChecked.current = true;
    fetchChannelLaunch(channelId)
      .then((launched) => {
        if (launched) client.select(launched);
      })
      .catch(() => {});
  }, [client, room, isHost, channelId]);

  // Load the selected vibe.
  useEffect(() => {
    setPageFailed(false);
    if (!slug) {
      setPage(null);
      return;
    }
    let cancelled = false;
    fetchVibePage(slug)
      .then((p) => {
        if (cancelled) return;
        setPage({
          slug: p.slug,
          title: p.title,
          html: adaptVibeHtmlForProxy(p.html, {
            siteOrigin: SITE_URL,
            proxyOrigin: window.location.origin,
            esmPrefix: '/.proxy/esm',
          }),
          thumbnailUrl: p.thumbnailUrl,
          tweakSpec: p.tweakSpec,
          tweakValues: p.tweakValues,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPageFailed(true);
        toast.error(t('vibes-load-failed-toast', { defaultValue: "Couldn't load this vibe" }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Away in Discord's PIP tile.
  useEffect(() => {
    client?.setAway(pip);
    return () => client?.setAway(false);
  }, [client, pip]);

  // Rich presence.
  const activePage = page && page.slug === slug ? page : null;
  const title = activePage?.title ?? null;
  const thumbnail = activePage?.thumbnailUrl ?? null;
  const memberCount = members.length;
  useEffect(() => {
    if (!room) return;
    const imageUrl = presenceThumbUrl(thumbnail);
    setActivityStatus(
      sdk,
      slug
        ? t('presence-playing-vibe', { defaultValue: 'Playing {{title}}', title: title ?? 'RMH Vibes' })
        : t('presence-browsing-vibes', { defaultValue: 'Browsing vibes' }),
      {
        ...(hostName
          ? { details: t('presence-hosted-by', { defaultValue: 'Hosted by {{name}}', name: hostName }) }
          : {}),
        partySize: [Math.max(memberCount, 1), VIBES_MAX_PARTY],
        ...(imageUrl ? { imageUrl } : {}),
        imageLabel: title ?? 'RMH Vibes',
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, !!room, slug, title, thumbnail, hostName, memberCount]);

  const isGuest = !discord.linkedUserId;
  const selfName = discord.user.global_name || discord.user.username;
  const selfAvatar = useMemo(() => discordAvatarUrl(discord.user), [discord.user]);

  const linkAccount = () => {
    try {
      sdk.commands
        .openExternalLink({ url: `${SITE_URL}/login?callbackURL=%2Fdiscord` })
        .catch(() => toast.error(t('vibes-link-failed', { defaultValue: "Couldn't open the link" })));
    } catch {
      toast.error(t('vibes-link-failed', { defaultValue: "Couldn't open the link" }));
    }
  };
  const invite = () => {
    const failed = () => toast.error(t('vibes-invite-failed', { defaultValue: "Couldn't open the invite dialog" }));
    try {
      sdk.commands.openInviteDialog().catch(failed);
    } catch {
      failed();
    }
  };

  if (connectFailed) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-[#f23f43]" aria-hidden />
          <h2 className="text-white text-lg font-semibold mb-2">
            {t('connection-failed', { defaultValue: 'Connection Failed' })}
          </h2>
          <p className="text-[#b5bac1] text-sm mb-4">
            {t('vibes-connect-failed', { defaultValue: "Couldn't reach the vibes room. Check your connection and try again." })}
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="px-4 py-2 rounded-lg bg-[#5865f2] text-white text-sm font-semibold hover:bg-[#4752c4] transition-colors"
            >
              {t('vibes-retry', { defaultValue: 'Try again' })}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 rounded-lg bg-[#2b2d31] border border-[#3f4147] text-white text-sm hover:border-[#5865f2]/60 transition-colors"
            >
              {t('vibes-back-to-games', { defaultValue: 'Back to games' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!room || !client) {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-center">
          <div
            aria-hidden="true"
            className="w-8 h-8 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin mx-auto mb-3"
          />
          <p className="text-[#b5bac1] text-sm">{t('vibes-connecting', { defaultValue: 'Joining the room...' })}</p>
        </div>
      </div>
    );
  }

  const roster =
    members.length > 0
      ? members.map((m) => ({ key: m.sid, name: m.name, url: m.avatarUrl, host: m.sid === hostSid }))
      : discord.participants.map((p) => ({
          key: p.id,
          name: p.global_name || p.username,
          url: discordAvatarUrl(p),
          host: false,
        }));
  const pipThumb = displayThumbUrl(thumbnail);

  return (
    <div className="relative h-dvh w-full flex flex-col bg-[#1a1a2e] text-white overflow-hidden">
      <header className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-[#3f4147] bg-[#2b2d31] pl-[calc(0.75rem+var(--safe-left))] pr-[calc(0.75rem+var(--safe-right))]">
        {slug && isHost && (
          <button
            type="button"
            onClick={() => client.select(null)}
            aria-label={t('vibes-back-to-browse', { defaultValue: 'Back to vibes' })}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-[#1e1f22] text-[#b5bac1] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {slug ? (title ?? t('vibes-loading', { defaultValue: 'Loading' })) : t('vibes-title', { defaultValue: 'RMH Vibes' })}
        </h1>
        <ul className="hidden sm:flex items-center gap-1" aria-label={t('vibes-roster', { defaultValue: 'In this room' })}>
          {roster.map((r) => (
            <li key={r.key}>
              <Avatar name={r.name} url={r.url} host={r.host} />
            </li>
          ))}
        </ul>
        <span className="flex items-center gap-1.5 text-xs text-[#b5bac1]">
          <Avatar name={selfName} url={selfAvatar} />
          <span className="rounded-full bg-[#1e1f22] px-2 py-0.5">
            {isGuest ? t('vibes-guest', { defaultValue: 'Guest' }) : t('vibes-linked', { defaultValue: 'Linked' })}
          </span>
        </span>
        {isGuest && (
          <button
            type="button"
            onClick={linkAccount}
            className="text-xs underline underline-offset-2 text-[#b5bac1] hover:text-white"
          >
            {t('vibes-link-account', { defaultValue: 'Link account' })}
          </button>
        )}
        <button
          type="button"
          onClick={invite}
          className="flex items-center gap-1 rounded-lg bg-[#5865f2] px-2.5 py-1.5 text-xs font-semibold hover:bg-[#4752c4] transition-colors"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          {t('vibes-invite', { defaultValue: 'Invite' })}
        </button>
        <button
          type="button"
          onClick={onExit}
          aria-label={t('vibes-close', { defaultValue: 'Leave vibes' })}
          className="h-8 w-8 flex items-center justify-center rounded-full bg-[#1e1f22] text-[#b5bac1] hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      {!slug && <VibeGalleryPicker canPick={isHost} hostName={hostName} onPick={(s) => client.select(s)} />}

      {slug && !activePage && (
        <div className="flex-1 flex items-center justify-center">
          {pageFailed ? (
            <div className="text-center">
              <p className="text-sm text-[#b5bac1] mb-3">
                {t('vibes-load-failed', { defaultValue: "This vibe couldn't be loaded." })}
              </p>
              {isHost && (
                <button
                  type="button"
                  onClick={() => client.select(null)}
                  className="px-4 py-2 rounded-lg bg-[#2b2d31] border border-[#3f4147] text-sm hover:border-[#5865f2]/60 transition-colors"
                >
                  {t('vibes-back-to-browse', { defaultValue: 'Back to vibes' })}
                </button>
              )}
            </div>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-[#5865f2]" aria-label={t('vibes-loading', { defaultValue: 'Loading' })} />
          )}
        </div>
      )}

      {slug && activePage && (
        <VibePlayer
          key={activePage.slug}
          slug={activePage.slug}
          html={activePage.html}
          title={activePage.title}
          tweakSpec={activePage.tweakSpec}
          tweakValues={activePage.tweakValues}
          client={client}
          members={members}
          hostSid={hostSid}
          hidden={pip}
          sandbox={VIEWER_SANDBOX}
        />
      )}

      {pip && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#1a1a2e] p-4 text-center">
          {pipThumb && <img src={pipThumb} alt="" className="max-h-[60%] max-w-[80%] rounded-lg object-contain" />}
          <p className="text-sm font-semibold truncate max-w-full">{title ?? t('vibes-title', { defaultValue: 'RMH Vibes' })}</p>
        </div>
      )}
    </div>
  );
}
