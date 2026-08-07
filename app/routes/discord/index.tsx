import { lazy, Suspense, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useDiscordSdk, type DiscordContext } from '@/lib/discord-sdk';
import rmhboxCss from '@/components/rmhbox/rmhbox.css?url';

/**
 * The Discord Activity gateway — `/discord`, the Activity's root.
 *
 * Before this route existed there were only two direct Activity routes
 * (`/discord/rmhbox`, `/discord/lights-out`), so whichever one Discord's URL
 * mapping pointed at was the *only* thing an Activity could ever open. This
 * route is meant to be what that mapping points at instead: it does the SDK
 * handshake exactly once — `useDiscordSdk()` — and picks a game after, so
 * switching games never re-runs the OAuth round trip. `rmhbox.tsx` and
 * `lights-out.tsx` are unchanged and still work as direct deep links; nothing
 * here removes them.
 *
 * The picker lives in this file rather than a separate `components/discord/`
 * module: `app/routes/discord/**` and `components/<game>/**` for an existing
 * game are both exempt from the site-tier `--site-*` token rules
 * (`lib/__tests__/design-consistency.test.ts`'s `FULLSCREEN_ROUTE_SEGMENTS` /
 * `FULLSCREEN_TIER_DIRS`), which is what lets this match rmhbox.tsx's raw
 * Discord palette. A brand-new `components/discord/` directory is in neither
 * allowlist, and extending that list is outside this file's ownership.
 */

const RMHboxDiscordActivity = lazy(() =>
  import('@/components/rmhbox/RMHboxDiscordActivity').then((m) => ({
    default: m.RMHboxDiscordActivity,
  })),
);
const SliceItDiscordActivity = lazy(() =>
  import('@/components/slice-it/SliceItDiscordActivity').then((m) => ({
    default: m.SliceItDiscordActivity,
  })),
);
const LightsOutDiscordActivity = lazy(() =>
  import('@/components/lights-out/LightsOutDiscordActivity').then((m) => ({
    default: m.LightsOutDiscordActivity,
  })),
);

type ActivityGameId = 'rmhbox' | 'slice-it' | 'lights-out';

interface ActivityGameOption {
  id: ActivityGameId;
  title: string;
  /** e.g. "1–8". A hint, not an enforced cap. */
  players: string;
  /** Decorative — matches the emoji-icon style the two existing Discord
   *  routes already use for their own error/connecting states. */
  icon: string;
}

/**
 * The registry X8 asks for: adding a fourth Activity is one entry here plus
 * its own lazy import above — nothing else in this route changes.
 */
const ACTIVITY_GAMES: readonly ActivityGameOption[] = [
  { id: 'rmhbox', title: 'RMHBox', players: '2–8', icon: '📦' },
  { id: 'slice-it', title: 'Slice It!', players: '1–8', icon: '🎵' },
  { id: 'lights-out', title: 'Lights Out', players: '1–10', icon: '💡' },
];

function GameStage({
  id,
  discord,
  onExit,
}: {
  id: ActivityGameId;
  discord: DiscordContext;
  /** Back to the picker. Local state, not a route change — see the module
   *  docblock on why re-mounting `useDiscordSdk()` per game would be wrong. */
  onExit: () => void;
}) {
  switch (id) {
    case 'rmhbox':
      return (
        <>
          {/* rmhbox.tsx loads this the same way when reached as a direct deep
              link; the gateway has to load it itself since mounting
              RMHboxDiscordActivity here never visits that route. */}
          <link rel="stylesheet" href={rmhboxCss} />
          <RMHboxDiscordActivity discord={discord} />
        </>
      );
    case 'slice-it':
      return <SliceItDiscordActivity discord={discord} onExit={onExit} />;
    case 'lights-out':
      return <LightsOutDiscordActivity discord={discord} />;
    default:
      return null;
  }
}

/**
 * The game picker.
 *
 * Every option stays clickable regardless of `canPick` — there is no channel
 * for one participant's pick to reach anyone else's iframe (Discord's SDK
 * exposes the roster, not a "what is this person looking at" signal), so
 * refusing to let a follower act on what they see in Discord's own voice-panel
 * presence would strand them with nothing to do. `canPick` instead earns the
 * launcher a slightly different framing: theirs is "start a session", everyone
 * else's is "join the one already forming" — both land on the same games.
 */
function ActivityPicker({
  onPick,
  canPick,
  launcherName,
  participantCount,
}: {
  onPick: (id: ActivityGameId) => void;
  canPick: boolean;
  launcherName: string | null;
  participantCount: number;
}) {
  const { t } = useTranslation('r-discord');

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">
            {t('gateway-title', { defaultValue: 'What are we playing?' })}
          </h1>
          {participantCount > 1 && (
            <p className="text-[#949ba4] text-xs flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5" aria-hidden />
              {t('gateway-participant-count', {
                defaultValue: '{{count}} people in this Activity',
                count: participantCount,
              })}
            </p>
          )}
        </div>

        {!canPick && (
          <div className="mb-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] px-4 py-3 text-center">
            <p className="text-[#b5bac1] text-xs">
              {launcherName
                ? t('gateway-follow-named', {
                    defaultValue:
                      '{{name}} started this Activity — pick the same game to play together.',
                    name: launcherName,
                  })
                : t('gateway-follow', {
                    defaultValue:
                      'Pick the same game as whoever started this Activity to play together.',
                  })}
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {ACTIVITY_GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              onClick={() => onPick(game.id)}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#2b2d31] border border-[#3f4147] hover:border-[#5865f2]/60 transition-colors text-left group"
            >
              <div
                className="w-12 h-12 shrink-0 rounded-lg bg-[#1e1f22] flex items-center justify-center text-2xl"
                aria-hidden
              >
                {game.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold group-hover:text-[#5865f2] transition-colors truncate">
                  {game.title}
                </div>
                <div className="text-[#949ba4] text-xs">
                  {t('gateway-players-hint', {
                    defaultValue: '{{range}} players',
                    range: game.players,
                  })}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscordGatewayPage() {
  const { t } = useTranslation('r-discord');
  const discord = useDiscordSdk();
  const [gameId, setGameId] = useState<ActivityGameId | null>(null);

  if (discord.status === 'loading') {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#5865f2] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#b5bac1] text-sm">
            {t('connecting-to-discord', { defaultValue: 'Connecting to Discord...' })}
          </p>
        </div>
      </div>
    );
  }

  if (discord.status === 'error') {
    return (
      <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">😵</div>
          <h2 className="text-white text-lg font-semibold mb-2">
            {t('connection-failed', { defaultValue: 'Connection Failed' })}
          </h2>
          <p className="text-[#b5bac1] text-sm mb-4">{discord.error}</p>
          <p className="text-[#949ba4] text-xs">
            {t('run-inside-discord-activity', {
              defaultValue: "Make sure you're running this inside a Discord Activity.",
            })}
          </p>
        </div>
      </div>
    );
  }

  const { context } = discord;
  // The first entry in the live roster is treated as whoever opened this
  // Activity — see lib/discord-sdk.ts for why `participants` has to come
  // from the real SDK call rather than the handshake's own `[user]` seed for
  // this comparison to mean anything.
  const launcher = context.participants[0] ?? null;
  const canPick = !launcher || launcher.id === context.user.id;
  const launcherName = canPick ? null : launcher!.global_name || launcher!.username;

  if (!gameId) {
    return (
      <ActivityPicker
        onPick={setGameId}
        canPick={canPick}
        launcherName={launcherName}
        participantCount={context.participants.length}
      />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#1a1a2e] flex items-center justify-center">
          <div className="animate-pulse text-[#b5bac1]">
            {t('loading-game', { defaultValue: 'Loading game...' })}
          </div>
        </div>
      }
    >
      <GameStage id={gameId} discord={context} onExit={() => setGameId(null)} />
    </Suspense>
  );
}

export const Route = createFileRoute('/discord/')({
  /**
   * X8 — the Activity gateway. A title and nothing else, on purpose.
   *
   * `__root.tsx` gives every `/discord/*` route a MINIMAL head (Discord's CSP
   * blocks inline scripts and external fonts), and `lib/sitemap.ts` classifies
   * this `noindex` because the page only functions inside a Discord client.
   * Adding `buildMeta`/`buildCanonical` here would be advertising a URL that
   * renders nothing anywhere else.
   */
  head: () => ({ meta: [{ title: 'Pick a game — RMH Studios' }] }),
  component: DiscordGatewayPage,
});
