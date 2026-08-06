/**
 * The "what a membership actually gets you" grid on the membership page.
 *
 * Rendered from `MEMBER_FEATURES` rather than hand-written copy, which is the
 * point: the same declaration gates the API route, so this page cannot advertise
 * a feature that isn't gated or quietly gate one it never advertised. Adding a
 * gated feature puts it here in the same commit.
 *
 * When the viewer arrives from a refused action the URL carries
 * `?feature=<id>` (see `upgradeHref`), and that card is pulled to the front and
 * ringed — so someone who clicked "add a custom emoji" and was told to
 * subscribe lands looking at the custom-emoji card, not at a price table they
 * have to scan.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import * as Icons from 'lucide-react';
import { Lock, Check } from 'lucide-react';
import {
  MEMBER_FEATURES,
  TIER_LABELS,
  canUse,
  type MemberFeature,
} from '@/lib/entitlements/features';
import type { Tier } from '@/lib/entitlements/tiers';
import { cn } from '@/lib/utils';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion';

interface Props {
  /** The viewer's tier — drives the unlocked/locked treatment per card. */
  tier: Tier;
  /** From `?feature=`; that card sorts first and gets a ring. */
  highlight?: MemberFeature | null;
  /** Signed-out viewers see everything as locked, which is accurate. */
  signedOut?: boolean;
}

/**
 * Resolve a lucide icon by name.
 *
 * The registry stores icon *names* because it is imported by server routes,
 * where a React component would be dead weight. Falling back to `Sparkles`
 * keeps a typo in the registry from throwing on the pricing page.
 */
function IconFor({ name, className }: { name: string; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }> | undefined>)[
      name
    ] ?? Icons.Sparkles;
  return <Cmp className={className} />;
}

/**
 * Feature copy, as literal `t()` calls.
 *
 * The registry carries `labelKey`/`blurbKey`, and the obvious thing —
 * `t(feature.labelKey, { defaultValue: feature.label })` — silently does not
 * work: `i18next-parser` reads the source statically, so a computed key is
 * invisible to it, the key never lands in `locales/`, and every locale serves
 * the English `defaultValue` forever. `MembershipPanel`'s `planCopy()` hit this
 * first and solved it the same way. Verified by checking `locales/en/feed.json`
 * after `pnpm i18n:extract` — the computed version extracted nothing.
 *
 * Keep this in step with `MEMBER_FEATURES`; the test file asserts the two cover
 * exactly the same set, so a new feature cannot ship without its copy.
 */
export function featureCopy(t: TFunction): Record<MemberFeature, { label: string; blurb: string }> {
  return {
    'ad-free': {
      label: t('feature-ad-free', { defaultValue: 'No ads' }),
      blurb: t('feature-ad-free-blurb', {
        defaultValue:
          'Free accounts are paid for by ads. A membership removes them everywhere — and the ad script is never even fetched, so nothing is loaded to be blocked.',
      }),
    },
    'custom-emoji': {
      label: t('feature-custom-emoji', { defaultValue: 'Custom emoji' }),
      blurb: t('feature-custom-emoji-blurb', {
        defaultValue:
          'Upload your own emoji and use them anywhere on the site — posts, comments, messages and reactions.',
      }),
    },
    'sticker-packs': {
      label: t('feature-sticker-packs', { defaultValue: 'Sticker & emoji packs' }),
      blurb: t('feature-sticker-packs-blurb', {
        defaultValue:
          'Build packs of your own stickers and emoji and publish them. Anyone can subscribe to your packs and use them — free accounts included.',
      }),
    },
    'voice-messages': {
      label: t('feature-voice-messages', { defaultValue: 'Longer voice messages' }),
      blurb: t('feature-voice-messages-blurb', {
        defaultValue:
          'Everyone gets voice messages. Members get longer ones at better quality — up to 10 minutes.',
      }),
    },
    'bulk-content': {
      label: t('feature-bulk-content', { defaultValue: 'Bulk content tools' }),
      blurb: t('feature-bulk-content-blurb', {
        defaultValue:
          'Clean up thousands of posts, follows or bookmarks in one pass, with a preview before anything happens.',
      }),
    },
    'trash-extended': {
      label: t('feature-trash-extended', { defaultValue: 'Longer recovery window' }),
      blurb: t('feature-trash-extended-blurb', {
        defaultValue:
          'Deleted posts are recoverable for 30 days on a free account, and 90 days with a membership.',
      }),
    },
    'typing-analytics': {
      label: t('feature-typing-analytics', { defaultValue: 'RMHType analytics' }),
      blurb: t('feature-typing-analytics-blurb', {
        defaultValue:
          'A per-key heatmap of your speed and accuracy, and practice runs generated from your own worst keys.',
      }),
    },
    'ladder-ai-prep': {
      label: t('feature-ladder-ai-prep', { defaultValue: 'Interview prep' }),
      blurb: t('feature-ladder-ai-prep-blurb', {
        defaultValue:
          'Turn any tracked application into a prep sheet: likely questions, your own stories matched to the posting.',
      }),
    },
    'speedrun-submit': {
      label: t('feature-speedrun-submit', { defaultValue: 'Speedrun leaderboards' }),
      blurb: t('feature-speedrun-submit-blurb', {
        defaultValue: 'Submit verified runs to per-category leaderboards. Free for everyone.',
      }),
    },
    'api-access': {
      label: t('feature-api-access', { defaultValue: 'Developer API' }),
      blurb: t('feature-api-access-blurb', {
        defaultValue: 'Programmatic access to the platform, with webhooks and image upload.',
      }),
    },
    'profile-badge': {
      label: t('feature-profile-badge', { defaultValue: 'Profile badge' }),
      blurb: t('feature-profile-badge-blurb', {
        defaultValue: 'A badge on your profile and beside your name.',
      }),
    },
  };
}

export function MemberFeatureGrid({ tier, highlight, signedOut }: Props) {
  const { t } = useTranslation('feed');
  const effectiveTier: Tier = signedOut ? 'free' : tier;
  const copy = featureCopy(t);

  const features = useMemo(() => {
    const list = [...MEMBER_FEATURES];
    if (!highlight) return list;
    const idx = list.findIndex((f) => f.id === highlight);
    if (idx <= 0) return list;
    // Pull the card the viewer came for to the front, keeping the rest in order.
    return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
  }, [highlight]);

  return (
    <div className="mt-16">
      <Reveal as="h3" className="text-center font-display text-2xl font-semibold text-site-text">
        {t('membership-features-title', { defaultValue: 'What a membership unlocks' })}
      </Reveal>
      <Reveal as="p" className="mx-auto mt-3 max-w-2xl text-center text-sm text-site-text-muted">
        {t('membership-features-subtitle', {
          defaultValue:
            'Everything below is included from the tier shown on each card. Packs made by members can be installed and used by anyone, free accounts included.',
        })}
      </Reveal>

      <RevealGroup className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const unlocked = !signedOut && canUse(effectiveTier, feature.id);
          const isHighlight = feature.id === highlight;
          return (
            <RevealItem key={feature.id} className="flex">
              <article
                // `.glass-fill` is the repeated-card tier per the design language.
                className={cn(
                  'glass-fill flex w-full flex-col gap-3 rounded-site p-5',
                  isHighlight && 'ring-2 ring-site-accent',
                )}
                aria-current={isHighlight ? 'true' : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-site-sm',
                      unlocked
                        ? 'bg-site-accent-dim text-site-accent'
                        : 'bg-site-surface-muted text-site-text-muted',
                    )}
                  >
                    <IconFor name={feature.icon} className="h-5 w-5" />
                  </span>
                  {unlocked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-site-accent">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      {t('feature-included', { defaultValue: 'Included' })}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-site-border px-2 py-0.5 text-xs font-medium text-site-text-muted">
                      <Lock className="h-3 w-3" aria-hidden />
                      {feature.minTier === 'free'
                        ? t('feature-free', { defaultValue: 'Free' })
                        : TIER_LABELS[feature.minTier]}
                    </span>
                  )}
                </div>

                <h4 className="text-base font-semibold text-site-text">{copy[feature.id].label}</h4>
                <p className="text-sm leading-relaxed text-site-text-muted">
                  {copy[feature.id].blurb}
                </p>
              </article>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </div>
  );
}
