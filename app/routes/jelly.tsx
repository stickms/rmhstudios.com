import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { strike } from '@/lib/jelly/arcs';
import {
  ELECTRIC_ARC_MODES,
  JELLY_MOTION_LEVELS,
  isElectricArcs,
  isJellyMotion,
  type ElectricArcs,
  type JellyMotion,
} from '@/lib/appearance/prefs';
import { useThemeStore } from '@/stores/themeStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { LiquidTabs } from '@/components/ui/liquid-tabs';

const PATH = '/jelly';
const TITLE = 'Plasmatic Jelly — Design Lab | RMH Studios';
const DESC =
  'The living reference for the Plasmatic Jelly material: hazy translucent slabs with always-on internal motion, a refracting rim, a soft body under the pointer and electric arcs between nearby surfaces.';

/**
 * The material lab (docs/plasmatic-jelly-system.md). It replaced `/liquid-glass`, which now redirects here.
 *
 * `noindex`: this is tooling, not a page of the site — it has no inbound link in the running UI, and an indexable
 * orphan would compete with `/design` (the public write-up) for the same queries. It stays reachable by URL because
 * it renders every role, the soft body, the arcs and the motion levels over the real backdrop, which is how the
 * material gets reviewed.
 *
 * Nothing here draws jelly itself. Every effect on this page comes from the document services (`lib/liquid/glass`
 * for rims and haze, `lib/jelly/physics.ts` for the soft body, `lib/jelly/arcs` for arcs) acting on role classes.
 * The one direct call is `strike(a, b)`, the public arc API, which passes the same gates and flash ledger as every
 * other arc and simply returns false when arcs are off.
 */
export const Route = createFileRoute('/jelly')({
  head: () => ({
    meta: [
      ...buildMeta({ title: TITLE, description: DESC, path: PATH }),
      { name: 'robots', content: 'noindex' },
    ],
    links: [buildCanonical(PATH)],
  }),
  component: JellyLab,
});

/** Monospace class-name label: code, not prose, so it is not translated. */
function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-site-accent">{children}</code>;
}

/** A labelled reference section with an ordered heading. */
function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id={`${id}-heading`} className="text-2xl font-semibold tracking-tight text-site-text">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-sm text-site-text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Persist a material preference the same way Settings → Appearance and the quick panel do. */
function persistPreference(body: { jellyMotion?: JellyMotion; electricArcs?: ElectricArcs }) {
  void fetch('/api/preferences/appearance', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).catch(() => {});
}

function JellyLab() {
  const { t } = useTranslation('c-ui');

  const roles = [
    {
      cls: 'glass-fill',
      label: t('jelly-role-fill-label', { defaultValue: 'L1 · Fill' }),
      note: t('jelly-role-fill-note', {
        defaultValue: 'Repeated content: cards, rows, tiles. A rim within budget and a soft body.',
      }),
    },
    {
      cls: 'glass-pane',
      label: t('jelly-role-pane-label', { defaultValue: 'L2 · Pane' }),
      note: t('jelly-role-pane-note', {
        defaultValue: 'Singular panels: heroes, composers, settings. A drifting haze slot.',
      }),
    },
    {
      cls: 'glass-chrome',
      label: t('jelly-role-chrome-label', { defaultValue: 'L3 · Chrome' }),
      note: t('jelly-role-chrome-note', {
        defaultValue: 'Persistent chrome: sticky headers, the dock. Refracts the page under it.',
      }),
    },
    {
      cls: 'glass-overlay',
      label: t('jelly-role-overlay-label', { defaultValue: 'L4 · Overlay' }),
      note: t('jelly-role-overlay-note', {
        defaultValue: 'Floating UI: dialogs, menus, popovers. The quietest, densest interior.',
      }),
    },
    {
      cls: 'glass-inset',
      label: t('jelly-role-inset-label', { defaultValue: 'Field' }),
      note: t('jelly-role-inset-note', {
        defaultValue: 'Inputs and tab tracks. A flush pool of jelly that arcs never touch.',
      }),
    },
  ];

  return (
    // Full-screen top-level page (outside _site/): its own padding and document scroll.
    <main className="min-h-dvh w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 md:gap-16 lg:py-16">
        <header className="glass-pane relative rounded-site px-6 py-12 sm:px-12 sm:py-20">
          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-site-accent">
              <Waves className="h-4 w-4" aria-hidden />
              {t('jelly-eyebrow', { defaultValue: 'Design lab' })}
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-site-text sm:text-6xl">
              {t('jelly-title', { defaultValue: 'Plasmatic Jelly' })}
            </h1>
            <p className="max-w-2xl text-base text-site-text-muted sm:text-lg">
              {t('jelly-intro', {
                defaultValue:
                  'Every surface is a slab of hazy, translucent jelly. Haze drifts inside it, its rim refracts and catches the light, it squashes when you press it, and nearby surfaces spark. Text and layout never move.',
              })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="accent">
                {t('jelly-badge-roles', { defaultValue: 'Five roles, one material' })}
              </Badge>
              <Badge variant="default">{t('jelly-badge-soft', { defaultValue: 'Soft body' })}</Badge>
              <Badge variant="outline">
                {t('jelly-badge-arcs', { defaultValue: 'Electric arcs' })}
              </Badge>
            </div>
          </div>
        </header>

        <Section
          id="roles"
          title={t('jelly-roles-title', { defaultValue: 'Roles' })}
          description={t('jelly-roles-description', {
            defaultValue:
              'Each class names an elevation role, not a look. The jelly material renders every role; the role decides how loud it may be and what it costs.',
          })}
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {roles.map((role) => (
              <div key={role.cls} className="flex flex-col gap-2">
                <div
                  className={cn(
                    'flex h-28 items-center justify-center rounded-site px-3 text-center',
                    role.cls,
                  )}
                >
                  <span className="relative z-[1] text-sm font-medium text-site-text">
                    {role.label}
                  </span>
                </div>
                <Mono>.{role.cls}</Mono>
                <p className="text-xs text-site-text-dim">{role.note}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="ambient"
          title={t('jelly-ambient-title', { defaultValue: 'Ambient haze' })}
          description={t('jelly-ambient-description', {
            defaultValue:
              'Haze drifts and swirls inside every surface, calm behind text and livelier at the rim. It slows to an idle floor when you stop, and stops completely when the tab is hidden or nothing hazy is on screen.',
          })}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-pane flex h-44 flex-col items-center justify-center gap-1 rounded-site p-6 text-center">
              <span className="text-base font-semibold text-site-text">
                {t('jelly-ambient-pane', { defaultValue: 'Watch the interior drift' })}
              </span>
              <Mono>.glass-pane</Mono>
            </div>
            <div
              data-liquid-glass="refract"
              className="glass-pane flex h-44 flex-col items-center justify-center gap-1 rounded-site p-6 text-center"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, var(--site-accent) 0 14px, transparent 14px 28px)',
              }}
            >
              <span className="text-base font-semibold text-site-text">
                {t('jelly-clear-rim', { defaultValue: 'Refracting rim' })}
              </span>
              <Mono>data-liquid-glass=&quot;refract&quot;</Mono>
            </div>
            <div
              data-jelly="off"
              className="glass-pane flex h-44 flex-col items-center justify-center gap-1 rounded-site p-6 text-center"
            >
              <span className="text-base font-semibold text-site-text">
                {t('jelly-ambient-off', { defaultValue: 'Opted out: no jelly' })}
              </span>
              <Mono>data-jelly=&quot;off&quot;</Mono>
            </div>
          </div>
        </Section>

        <Section
          id="soft-body"
          title={t('jelly-squash-title', { defaultValue: 'Soft body' })}
          description={t('jelly-squash-description', {
            defaultValue:
              'Hover plumps and leans a card toward the cursor, a press squashes it toward your finger, and release wobbles it back. A firm release nudges close neighbours by a pixel or two. Edges never travel more than 4px and layout never changes.',
          })}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i} interactive>
                  <CardContent className="flex h-24 items-center justify-center p-4">
                    <span className="text-sm font-medium text-site-text">
                      {t('jelly-squash-card', { defaultValue: 'Press and hold' })}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="site-section-label">
                {t('jelly-squash-cluster', { defaultValue: 'Close neighbours' })}
              </span>
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 12 }, (_, i) => (
                  <Button key={i} variant="secondary">
                    {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <ArcsSection />

        <MotionSection />

        <Section
          id="globe"
          title={t('jelly-globe-title', { defaultValue: 'The Liquid Globe' })}
          description={t('jelly-globe-description', {
            defaultValue:
              'Open the menu: the globe keeps its own jelly coat and a dough body. Press it and material banks up around your finger, drag kneads it, and it eases back over a couple of seconds.',
          })}
        >
          <div className="glass-pane flex flex-wrap gap-x-4 gap-y-1 rounded-site p-6">
            <Mono>lib/dough.ts</Mono>
            <Mono>components/radial/jelly-glass.ts</Mono>
          </div>
        </Section>

        <Section
          id="gallery"
          title={t('jelly-gallery-title', { defaultValue: 'Primitive gallery' })}
          description={t('jelly-gallery-description', {
            defaultValue:
              'The shared primitives every page composes from, so reviewers can check that each one carries the material and the soft body.',
          })}
        >
          <PrimitiveGallery />
        </Section>

        <footer className="flex flex-wrap gap-x-2 border-t border-site-border pt-6 text-xs text-site-text-dim">
          <span>
            {t('jelly-footer', {
              defaultValue: 'Internal design-lab reference. The contract is',
            })}
          </span>
          <Mono>docs/plasmatic-jelly-system.md</Mono>
        </footer>
      </div>
    </main>
  );
}

/** Arcs: ambient arcs happen on their own between close surfaces; the button strikes one on demand. */
function ArcsSection() {
  const { t } = useTranslation('c-ui');
  const anode = useRef<HTMLDivElement>(null);
  const cathode = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'struck' | 'blocked'>('idle');

  const onStrike = () => {
    const a = anode.current;
    const b = cathode.current;
    setStatus(a && b && strike(a, b) ? 'struck' : 'blocked');
  };

  return (
    <Section
      id="arcs"
      title={t('jelly-arcs-title', { defaultValue: 'Electric arcs' })}
      description={t('jelly-arcs-description', {
        defaultValue:
          'Close surfaces now and then throw an arc across the gap, more often the nearer they are. Every click discharges one to three arcs to the nearest neighbours. A site-wide limit keeps flashes to three a second.',
      })}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div ref={anode} className="glass-fill flex h-24 items-center justify-center rounded-site">
          <span className="text-sm font-medium text-site-text">
            {t('jelly-arcs-anode', { defaultValue: 'Anode' })}
          </span>
        </div>
        <Zap className="h-5 w-5 text-site-accent" aria-hidden />
        <div
          ref={cathode}
          className="glass-fill flex h-24 items-center justify-center rounded-site"
        >
          <span className="text-sm font-medium text-site-text">
            {t('jelly-arcs-cathode', { defaultValue: 'Cathode' })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={onStrike}>
          {t('jelly-arcs-strike', { defaultValue: 'Strike an arc' })}
        </Button>
        <p role="status" className="text-sm text-site-text-muted">
          {status === 'blocked'
            ? t('jelly-arcs-blocked', {
                defaultValue:
                  'No arc: arcs are off in your settings, or the flash limit was reached.',
              })
            : null}
        </p>
      </div>
    </Section>
  );
}

/** The two material preferences, bound to the real store — a change here applies across the site. */
function MotionSection() {
  const { t } = useTranslation('c-ui');
  const jellyMotion = useThemeStore((s) => s.jellyMotion);
  const setJellyMotion = useThemeStore((s) => s.setJellyMotion);
  const electricArcs = useThemeStore((s) => s.electricArcs);
  const setElectricArcs = useThemeStore((s) => s.setElectricArcs);

  const motionLabels: Record<JellyMotion, string> = {
    lively: t('jelly-motion-lively', { defaultValue: 'Lively' }),
    calm: t('jelly-motion-calm', { defaultValue: 'Calm' }),
    still: t('jelly-motion-still', { defaultValue: 'Still' }),
  };
  const arcLabels: Record<ElectricArcs, string> = {
    full: t('jelly-arcs-full', { defaultValue: 'Everywhere' }),
    clicks: t('jelly-arcs-clicks', { defaultValue: 'Only when I click' }),
    off: t('jelly-arcs-off', { defaultValue: 'Off' }),
  };

  return (
    <Section
      id="motion"
      title={t('jelly-motion-title', { defaultValue: 'Motion levels' })}
      description={t('jelly-motion-description', {
        defaultValue:
          'These are your real Appearance settings, so a change here applies across the site. Still pauses all ambient motion and turns arcs off; pressing still works.',
      })}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="site-section-label">
            {t('jelly-motion-label', { defaultValue: 'Jelly motion' })}
          </span>
          <LiquidTabs
            aria-label={t('jelly-motion-label', { defaultValue: 'Jelly motion' })}
            tabs={JELLY_MOTION_LEVELS.map((id) => ({ id, label: motionLabels[id] }))}
            value={jellyMotion}
            onChange={(id) => {
              if (!isJellyMotion(id)) return;
              setJellyMotion(id);
              persistPreference({ jellyMotion: id });
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="site-section-label">
            {t('jelly-arcs-title', { defaultValue: 'Electric arcs' })}
          </span>
          <LiquidTabs
            aria-label={t('jelly-arcs-title', { defaultValue: 'Electric arcs' })}
            tabs={ELECTRIC_ARC_MODES.map((id) => ({ id, label: arcLabels[id] }))}
            value={electricArcs}
            onChange={(id) => {
              if (!isElectricArcs(id)) return;
              setElectricArcs(id);
              persistPreference({ electricArcs: id });
            }}
          />
          {jellyMotion === 'still' && electricArcs !== 'off' ? (
            <p className="text-xs text-site-text-muted">
              {t('jelly-arcs-still-note', {
                defaultValue: 'Jelly motion is Still, so arcs stay off for now.',
              })}
            </p>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/** Subheading for a gallery group, keeping the h1 → h2 → h3 order. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="site-section-label">{children}</h3>;
}

function PrimitiveGallery() {
  const { t } = useTranslation('c-ui');
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <GroupHeading>{t('jelly-gallery-buttons', { defaultValue: 'Buttons' })}</GroupHeading>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('jelly-button-primary', { defaultValue: 'Primary' })}</Button>
          <Button variant="accent">{t('jelly-button-accent', { defaultValue: 'Accent' })}</Button>
          <Button variant="secondary">
            {t('jelly-button-secondary', { defaultValue: 'Secondary' })}
          </Button>
          <Button variant="outline">
            {t('jelly-button-outline', { defaultValue: 'Outline' })}
          </Button>
          <Button variant="ghost">{t('jelly-button-ghost', { defaultValue: 'Ghost' })}</Button>
          <Button disabled>{t('jelly-button-disabled', { defaultValue: 'Disabled' })}</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupHeading>{t('jelly-gallery-cards', { defaultValue: 'Cards' })}</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t('jelly-card-default-title', { defaultValue: 'Default card' })}</CardTitle>
              <CardDescription>
                <Mono>.glass-fill</Mono>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">
                {t('jelly-card-default-body', {
                  defaultValue: 'Repeated content: a rim within budget and a drifting haze.',
                })}
              </p>
            </CardContent>
          </Card>
          <Card pane>
            <CardHeader>
              <CardTitle>{t('jelly-card-pane-title', { defaultValue: 'Pane card' })}</CardTitle>
              <CardDescription>
                <Mono>.glass-pane</Mono>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">
                {t('jelly-card-pane-body', {
                  defaultValue: 'A singular panel with an ambient haze slot.',
                })}
              </p>
            </CardContent>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>
                {t('jelly-card-interactive-title', { defaultValue: 'Interactive card' })}
              </CardTitle>
              <CardDescription>
                <Mono>interactive</Mono>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">
                {t('jelly-card-interactive-body', {
                  defaultValue: 'Hover to lean it, press to squash it.',
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <GroupHeading>{t('jelly-gallery-fields', { defaultValue: 'Fields' })}</GroupHeading>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="jelly-input" className="text-sm text-site-text-muted">
              {t('jelly-field-input', { defaultValue: 'Input' })}
            </label>
            <Input
              id="jelly-input"
              placeholder={t('jelly-field-input-placeholder', { defaultValue: 'Type something…' })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="jelly-textarea" className="text-sm text-site-text-muted">
              {t('jelly-field-textarea', { defaultValue: 'Textarea' })}
            </label>
            <Textarea
              id="jelly-textarea"
              placeholder={t('jelly-field-textarea-placeholder', {
                defaultValue: 'A longer text field…',
              })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="jelly-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
            <label htmlFor="jelly-switch" className="text-sm text-site-text-muted">
              {t('jelly-field-switch', { defaultValue: 'Switch' })}
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-site-text-muted">
              {t('jelly-field-slider', { defaultValue: 'Slider' })}
            </span>
            <Slider
              defaultValue={[40]}
              aria-label={t('jelly-field-slider', { defaultValue: 'Slider' })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
