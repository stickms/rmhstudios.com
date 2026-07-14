import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { GlassButton, GlassDock, type DockIcon } from '@/components/ui/liquid-glass';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/liquid-glass';
const TITLE = 'Liquid Glass | RMH Studios';
const DESC =
  'A showcase of the Liquid Glass design language: frosted, light-refracting surfaces over a slowly drifting backdrop.';

export const Route = createFileRoute('/liquid-glass')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: LiquidGlassShowcase,
});

/** Dock of RMH apps/games rendered as glass — icons are local static assets. */
const DOCK_APPS = [
  { src: '/images/games/rmhbox.webp', alt: 'RMHBox', href: '/rmhbox' },
  { src: '/images/games/altair.webp', alt: 'Altair', href: '/altair' },
  { src: '/images/games/rmhtube.webp', alt: 'RMHTube', href: '/rmhtube' },
  { src: '/images/games/rmhmusic.webp', alt: 'RMHMusic', href: '/rmhmusic' },
  { src: '/images/games/rmhtype.webp', alt: 'RMHType', href: '/rmhtype' },
  { src: '/images/games/daily_puzzles.webp', alt: 'Daily Puzzles', href: '/daily' },
] as const;

function LiquidGlassShowcase() {
  const { t } = useTranslation('site');
  const navigate = useNavigate();

  const dockIcons: DockIcon[] = DOCK_APPS.map((app) => ({
    src: app.src,
    alt: app.alt,
    onClick: () => navigate({ to: app.href }),
  }));

  return (
    <div
      className="relative flex h-full min-h-screen w-full items-center justify-center overflow-hidden font-light"
      style={{
        background: `url("https://images.unsplash.com/photo-1432251407527-504a6b4174a2?q=80&w=1480&auto=format&fit=crop") center center`,
        animation: 'moveBackground 60s linear infinite',
      }}
    >
      {/* The #glass-distortion SVG filter is mounted globally in __root.tsx. */}
      <div className="flex w-full flex-col items-center justify-center gap-6 px-4">
        <h1 className="sr-only">{t('liquid-glass-title', { defaultValue: 'Liquid Glass' })}</h1>

        <GlassDock icons={dockIcons} />

        <Link to="/" className="rounded-3xl">
          <GlassButton>
            <div className="text-xl text-white">
              <p>
                {t('liquid-glass-cta', {
                  defaultValue: 'How can I help you today?',
                })}
              </p>
            </div>
          </GlassButton>
        </Link>
      </div>
    </div>
  );
}
