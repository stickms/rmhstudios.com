/**
 * Site-wide keyboard shortcuts for the sidebar shell (mounted in _site.tsx so
 * full-screen games keep their own key handling).
 *
 * The bindings are declared in `lib/shortcuts/registry.ts` (`SITE_SHORTCUTS`);
 * this component attaches the actions and dispatches from the EFFECTIVE
 * bindings: the declarations with the person's remaps and single-key mode
 * applied (`lib/shortcuts/bindings.ts`, settings at /settings/keyboard). The
 * default set:
 *
 *   ?          toggle the help overlay
 *   /          open the command palette
 *   c          compose a post (signed in)
 *   g then <x> go somewhere (h home, e explore, n notifications, …)
 *
 * Shortcuts are suppressed while typing in inputs/textareas/contenteditables.
 * The palette's own key (mod+k) is handled by CommandPalette from the same
 * effective bindings. With every character key off and nothing remapped there
 * is nothing to dispatch, and no key listener is attached.
 */

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { openCommandPalette } from '@/components/site/command-palette-bus';
import { useSession } from '@/components/Providers';
import { useEffectiveShortcuts } from '@/hooks/useEffectiveShortcuts';
import { SEQUENCE_TIMEOUT_MS, isTypingTarget, type Shortcut } from '@/lib/shortcuts/registry';
import { eventMatchesKeystroke, isModifierKey, keyLabel, type KeyPlatform } from '@/lib/shortcuts/bindings';
import { useKeyboardPrefsStore } from '@/stores/keyboardPrefsStore';

const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({
    default: m.ComposeModal,
  })),
);

/** Open the help overlay from anywhere (e.g. the command palette). */
export const SHORTCUTS_HELP_EVENT = 'rmh:shortcuts-help';

// "g then <key>" navigation targets, by shortcut id. Each points at the page's
// real address, never at a legacy path that redirects (`/notifications`,
// `/wallet`): a redirect is a second navigation, and on a cold load a second
// round trip. The keys themselves are declared in the registry.
const GO_TARGETS: Record<
  string,
  {
    href: string;
    search?: Record<string, string>;
  }
> = {
  'site.go.home': {
    href: '/',
  },
  'site.go.explore': {
    href: '/explore',
  },
  'site.go.notifications': {
    href: '/messages',
    search: {
      tab: 'notifications',
    },
  },
  'site.go.messages': {
    href: '/messages',
  },
  'site.go.bookmarks': {
    href: '/saves',
  },
  'site.go.library': {
    href: '/library',
  },
  'site.go.communities': {
    href: '/communities',
  },
  'site.go.wallet': {
    href: '/predictions',
  },
  'site.go.progress': {
    href: '/progress',
  },
  'site.go.daily': {
    href: '/daily',
  },
  'site.go.settings': {
    href: '/settings',
  },
};

// The ids this component has an action for (`site.palette` is CommandPalette's).
const SITE_ACTION_IDS: ReadonlySet<string> = new Set([
  'site.help',
  'site.search',
  'site.compose',
  ...Object.keys(GO_TARGETS),
]);

export function detectKeyPlatform(): KeyPlatform {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'other';
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-site-sm border border-site-border bg-site-bg-subtle px-1.5 py-0.5 text-caption font-medium text-site-text-muted">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label, platform }: { keys: string[]; label: string; platform: KeyPlatform }) {
  return (
    <li className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-site-text-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.flatMap((step, i) => keyLabel(step, platform).map((cap, j) => <Kbd key={`${i}-${j}`}>{cap}</Kbd>))}
      </span>
    </li>
  );
}

export function KeyboardShortcuts() {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const signedIn = !!session?.user;

  const [helpOpen, setHelpOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [platform, setPlatform] = useState<KeyPlatform>('other');
  const effective = useEffectiveShortcuts();

  useEffect(() => {
    useKeyboardPrefsStore.getState().hydrate({
      remote: signedIn,
    });
  }, [signedIn]);
  useEffect(() => setPlatform(detectKeyPlatform()), []);

  // Actions for the site's own shortcuts. Kept in a ref so a new `navigate` or
  // session does not rebuild the key listener.
  const actions = useRef<Record<string, () => void>>({});
  useEffect(() => {
    actions.current = {
      'site.help': () => setHelpOpen((v) => !v),
      'site.search': () => {
        setHelpOpen(false);
        openCommandPalette();
      },
      'site.compose': () => {
        if (!signedIn) return;
        setHelpOpen(false);
        setComposeOpen(true);
      },
      ...Object.fromEntries(
        Object.entries(GO_TARGETS).map(([id, target]) => [
          id,
          () => {
            setHelpOpen(false);
            navigate({
              to: target.href,
              search: target.search,
            } as never);
          },
        ]),
      ),
    };
  });

  // The bindings this component dispatches: everything with an action here or
  // its own `run`, except games (each full-screen game owns its controls) and
  // `site.palette` (CommandPalette binds it from the same effective keys).
  const dispatchable = useMemo(
    () => effective.filter((s) => !s.scope.startsWith('game:') && (s.run !== undefined || SITE_ACTION_IDS.has(s.id))),
    [effective],
  );

  useEffect(() => {
    if (dispatchable.length === 0) return;
    // The shortcuts still in play after the keys typed so far, and when the last one landed.
    let pending: {
      candidates: Shortcut[];
      step: number;
      at: number;
    } | null = null;

    const fire = (s: Shortcut, e: KeyboardEvent) => {
      if (s.when && !s.when()) return false;
      e.preventDefault();
      if (s.run) s.run(e);
      else actions.current[s.id]?.();
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      // An IME composition (keyCode 229 / isComposing) is typing, not a shortcut.
      if (e.isComposing || e.keyCode === 229) return;
      if (isModifierKey(e) || isTypingTarget(e.target)) return;
      const live = pending && Date.now() - pending.at < SEQUENCE_TIMEOUT_MS ? pending : null;
      pending = null;
      // Mid-sequence the next key continues it; a key that fits nothing starts afresh.
      const tryFrom = (list: Shortcut[], step: number) => list.filter((s) => eventMatchesKeystroke(s.keys[step], e));
      let step = live ? live.step : 0;
      let hits = tryFrom(live ? live.candidates : dispatchable, step);
      if (hits.length === 0 && live) {
        step = 0;
        hits = tryFrom(dispatchable, 0);
      }
      if (hits.length === 0) return;

      const done = hits.find((s) => s.keys.length === step + 1);
      if (done) {
        fire(done, e);
        return;
      }
      e.preventDefault();
      pending = {
        candidates: hits,
        step: step + 1,
        at: Date.now(),
      };
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatchable]);

  useEffect(() => {
    const onHelpEvent = () => setHelpOpen(true);
    window.addEventListener(SHORTCUTS_HELP_EVENT, onHelpEvent);
    return () => window.removeEventListener(SHORTCUTS_HELP_EVENT, onHelpEvent);
  }, []);

  const listed = effective.filter(
    (s) => !s.scope.startsWith('game:') && (s.id === 'site.compose' ? signedIn : s.when ? s.when() : true),
  );
  const general = listed.filter((s) => !s.id.startsWith('site.go.'));
  const goTo = listed.filter((s) => s.id.startsWith('site.go.'));
  const row = (s: Shortcut) => (
    <ShortcutRow
      key={s.id}
      keys={s.keys}
      platform={platform}
      label={t(s.labelKey, {
        ns: s.ns ?? 'feed',
        defaultValue: s.label ?? s.id,
      })}
    />
  );

  return (
    <>
      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
      <DialogPrimitive.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay data-motion="fade" className="fixed inset-0 z-hub-overlay glass-scrim" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            data-motion="rise"
            className="surface-overlay fixed left-1/2 top-1/2 z-palette max-h-[80dvh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-4"
          >
            <DialogPrimitive.Title className="text-base font-semibold text-site-text">
              {t('kbd-title', {
                defaultValue: 'Keyboard shortcuts',
              })}
            </DialogPrimitive.Title>

            <h3 className="site-section-label mt-3">
              {t('kbd-section-general', {
                defaultValue: 'General',
              })}
            </h3>
            <ul className="mt-1 divide-y divide-site-border/50">{general.map(row)}</ul>

            {goTo.length > 0 && (
              <>
                <h3 className="site-section-label mt-4">
                  {t('kbd-section-goto', {
                    defaultValue: 'Go to',
                  })}
                </h3>
                <ul className="mt-1 divide-y divide-site-border/50">{goTo.map(row)}</ul>
              </>
            )}

            <DialogPrimitive.Close className="mt-4 w-full rounded-site border border-site-border px-3 py-2 text-sm font-medium text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text">
              {t('kbd-close', {
                defaultValue: 'Close',
              })}
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
