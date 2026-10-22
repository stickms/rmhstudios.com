import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Droplets, Layers, MousePointerClick, Sparkles, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { GlassPane } from '@/components/ui/liquid-glass';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs } from '@/components/ui/liquid-tabs';

const MORPH_TABS = [
  { id: 'for-you', label: 'For You' },
  { id: 'following', label: 'Following' },
  { id: 'trending', label: 'Trending' },
  { id: 'latest', label: 'Latest' },
];

// The capsule morph demo. This section used to lead with a tier indicator and a
// "force CSS fallback" A/B switch, because the morph had two renderers: a
// WebGPU/WebGL2 shader that drew the metaball merge as SDF bodies, and the
// SVG-goo path. The shader tier is deleted — `initLiquidGL()` had no caller
// anywhere, so it never ran once and the badge read "CSS / SVG fallback"
// permanently — and the goo path it fell back to is simply the renderer now.
function LiquidMorphDemo() {
  const [tab, setTab] = useState('for-you');

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-site-text-muted">
        Switch tabs and watch the active capsule: the capsule and its trailing droplet fuse into a
        stretching teardrop, drawn as an SVG metaball underlay (<Mono>#glass-goo</Mono>) beneath the
        DOM capsule. Velocity drives the squash and stretch; reduced motion, perf-lite and
        high-contrast strip the underlay and leave the plain capsule slide.
      </p>
      <div className="flex justify-center py-4">
        <LiquidTabs
          tabs={MORPH_TABS}
          value={tab}
          onChange={setTab}
          aria-label="Liquid morph demo tabs"
        />
      </div>
    </div>
  );
}

const PATH = '/liquid-glass';
const TITLE = 'Liquid Glass — Design Lab | RMH Studios';
const DESC =
  'The living reference for the Liquid Glass material: clear shader-drawn slabs with a refracting rim, a cursor that is a light, neutral reflections and stable tap feedback, and the shared UI primitives.';

/**
 * `noindex`: this is the material lab, not a page of the site. It was listed in
 * `lib/sitemap.ts` at priority 0.4 while having no inbound link anywhere in the
 * running UI — an indexable orphan competing with `/design` (the public write-up
 * of the same subject) for the same queries. The tag rather than a `robots.txt`
 * Disallow, per that file's own rule: blocking the fetch is what stops a crawler
 * ever reading the tag that removes an already-discovered URL.
 *
 * It stays a route, reachable by URL: it renders every elevation tier and
 * primitive over the real backdrop, which is how the material gets reviewed.
 */
export const Route = createFileRoute('/liquid-glass')({
  head: () => ({
    meta: [
      ...buildMeta({ title: TITLE, description: DESC, path: PATH }),
      { name: 'robots', content: 'noindex' },
    ],
    links: [buildCanonical(PATH)],
  }),
  component: LiquidGlassLab,
});

/** The elevation swatches (§2). Each swatch IS the glass surface so reviewers
 *  can read the material directly; the class name shows in mono. */
const TIERS = [
  {
    cls: 'glass-fill',
    name: '.glass-fill',
    label: 'L1 · Fill',
    note: 'Repeated content — cards, rows, tiles. Tint + lit CSS edge. Never a canvas. Cheap, unlimited.',
  },
  {
    cls: 'glass-pane',
    name: '.glass-pane',
    label: 'L2 · Pane',
    note: 'Singular panels — heroes, composer, settings. A lit shader slab: bevel, Fresnel, glints. Budgeted.',
  },
  {
    cls: 'glass-chrome rounded-site border border-site-border',
    name: '.glass-chrome',
    label: 'L3 · Chrome',
    note: 'Persistent chrome — sticky headers, dock. A slab that refracts the page scrolling under it.',
  },
  {
    cls: 'glass-overlay',
    name: '.glass-overlay',
    label: 'L4 · Overlay',
    note: 'Floating UI — dialogs, popovers, palette, toasts. Refracts the page behind it; dense enough for text.',
  },
  {
    cls: 'glass-inset',
    name: '.glass-inset',
    label: 'Field',
    note: 'Fields — inputs, search fields, tab tracks. A flush pool of the glass, never a hole cut in it.',
  },
] as const;

const BUTTON_VARIANTS = [
  'default',
  'accent',
  'secondary',
  'outline',
  'ghost',
  'destructive',
  'danger',
  'link',
  'accent-outline',
  'accent-ghost',
] as const;

const BADGE_VARIANTS = [
  'default',
  'accent',
  'solid',
  'success',
  'warning',
  'danger',
  'outline',
] as const;

/** Monospace class-name label used throughout the lab. */
function Mono({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-xs text-site-accent">{children}</code>;
}

/** A labelled reference section with an ordered heading. */
function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-site-text-dim">
          {eyebrow}
        </span>
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

function LiquidGlassLab() {
  const { t } = useTranslation('c-ui');
  return (
    // Full-screen top-level page (outside _site/): its own padding + document scroll. Every glass surface below is
    // drawn by `lib/liquid/glass/engine.ts`: a canvas behind the content, transparent in the middle, refracting and lit
    // at the rim. There is no backdrop-filter anywhere, so it looks the same in Chromium, Safari and Firefox.
    <div className="min-h-screen w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6 md:gap-20 lg:py-16">
        {/* ── 1 · Hero ── a pane: a lit slab over the page ground. */}
        <header className="glass-pane relative rounded-site px-6 py-14 sm:px-12 sm:py-20">
          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-site-accent">
              <Droplets className="h-4 w-4" aria-hidden />
              Design lab
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-site-text sm:text-6xl">
              Liquid Glass
            </h1>
            <p className="max-w-2xl text-base text-site-text-muted sm:text-lg">
              {t('glass-intro', {
                defaultValue:
                  'Clear glass catches light along its bevel and gently refracts the page at its edge. Move your cursor to explore the reflections; tapping keeps the surface still.',
              })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="accent">L1–L4 elevation</Badge>
              <Badge variant="default">cursor light</Badge>
              <Badge variant="outline">
                {t('glass-stable-taps', { defaultValue: 'Stable tap feedback' })}
              </Badge>
            </div>
          </div>
        </header>

        {/* ── 2 · Elevation tiers ── */}
        <Section
          id="elevation"
          eyebrow="§2"
          title="Elevation tiers"
          description={
            <>
              Each tier is a role, not a look you assemble. <Mono>glass-pane</Mono>,{' '}
              <Mono>glass-chrome</Mono> and <Mono>glass-overlay</Mono> become shader slabs;{' '}
              <Mono>glass-fill</Mono> (repeated content) and <Mono>glass-inset</Mono> (fields) stay
              CSS so a feed of cards costs nothing. At most eight slabs are drawn at once.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {TIERS.map((tier) => (
              <div key={tier.name} className="flex flex-col gap-2">
                <div
                  className={cn('flex h-28 items-center justify-center px-3 text-center', tier.cls)}
                >
                  <span className="relative z-[1] text-sm font-medium text-site-text">
                    {tier.label}
                  </span>
                </div>
                <Mono>{tier.name}</Mono>
                <p className="text-xs text-site-text-dim">{tier.note}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 3 · Refraction ── what a rim does to the page behind it. */}
        <Section
          id="refraction"
          eyebrow="§3"
          title="Refraction"
          description={
            <>
              The rim is a convex bevel refracted by Snell&apos;s law (IOR 1.5) with a little
              dispersion; the middle is clear, so the live page shows through untouched. Floating
              glass (<Mono>glass-chrome</Mono>, <Mono>glass-overlay</Mono>) refracts a snapshot of
              the page behind it automatically. A pane is a content block and would bend its own
              text, so it is only lit unless you opt in with{' '}
              <Mono>data-liquid-glass=&quot;refract&quot;</Mono>. Watch the stripes bend at the edge
              and stay straight in the middle.
            </>
          }
        >
          <div
            className="grid gap-6 rounded-site p-6 sm:grid-cols-2 lg:grid-cols-4"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--site-accent) 0 14px, transparent 14px 28px)',
            }}
          >
            <div className="glass-chrome flex h-44 items-center justify-center rounded-site p-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Chrome</span>
                <Mono>.glass-chrome</Mono>
                <span className="text-xs text-site-text-dim">refracts the page</span>
              </div>
            </div>
            <div className="glass-overlay flex h-44 items-center justify-center rounded-site p-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Overlay</span>
                <Mono>.glass-overlay</Mono>
                <span className="text-xs text-site-text-dim">refracts the page</span>
              </div>
            </div>
            <div
              data-liquid-glass="refract"
              className="glass-pane flex h-44 items-center justify-center rounded-site p-6"
            >
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Pane + refract</span>
                <Mono>opt-in</Mono>
                <span className="text-xs text-site-text-dim">refracts the page</span>
              </div>
            </div>
            <div className="glass-pane flex h-44 items-center justify-center rounded-site p-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Pane</span>
                <Mono>.glass-pane</Mono>
                <span className="text-xs text-site-text-dim">lit slab only</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 4 · Reflected light ── */}
        <Section
          id="light"
          eyebrow="§4"
          title={t('glass-cursor-title', { defaultValue: 'Light and reflections' })}
          description={
            <>
              {t('glass-cursor-description', {
                defaultValue:
                  'On a fine pointer, the cursor moves a soft reflection along the bevel. Text and hit areas stay fixed. Touch and reduced motion keep the material still, with no tap ripples.',
              })}
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Pane A', icon: Sparkles, hint: 'move the cursor across' },
              {
                label: 'Pane B',
                icon: MousePointerClick,
                hint: t('glass-clear-edge', { defaultValue: 'Clear edges' }),
              },
              {
                label: 'Pane C',
                icon: Layers,
                hint: t('glass-stable-surface', { defaultValue: 'Stable surfaces' }),
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="glass-pane relative flex h-32 flex-col items-center justify-center gap-2 rounded-site p-4"
                >
                  <Icon className="h-6 w-6 text-site-accent" aria-hidden />
                  <span className="text-sm font-medium text-site-text">{item.label}</span>
                  <span className="text-xs text-site-text-dim">{item.hint}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── 5 · The globe ── */}
        <Section
          id="globe"
          eyebrow="§5"
          title="The Liquid Globe"
          description={
            <>
              Open the menu: the globe is the same glass. Its coat refracts the page behind the hub
              (read from the same snapshot, at the blur the hub applies) as a ball lens, so the page
              appears inverted inside it. And it is dough, not a stretchy ball: pressing pushes
              material out of the contact and banks it up around it, dragging kneads it along the
              finger, and what you moved eases back over a couple of seconds instead of snapping.
            </>
          }
        >
          <div className="glass-pane rounded-site p-6 text-sm text-site-text-muted">
            See <Mono>lib/dough.ts</Mono> (the simulation) and{' '}
            <Mono>components/radial/jelly-glass.ts</Mono> (the coat).
          </div>
        </Section>

        {/* ── 7 · GlassPane gallery ── */}
        {/* ── Liquid morph (§5.47) ── */}
        <Section
          id="liquid-morph"
          eyebrow="§5.47"
          title="Liquid morph"
          description={
            <>
              The active tab capsule does not slide, it <em>flows</em>: a <Mono>layoutId</Mono>{' '}
              spring carries the capsule while an SVG metaball underlay (<Mono>#glass-goo</Mono>,{' '}
              <Mono>components/ui/liquid-morph.tsx</Mono>) fuses it with a trailing droplet into a
              stretching teardrop. Velocity drives the squash and stretch. There was a second
              renderer here — a WebGPU/WebGL2 canvas drawing the same merge as SDF bodies. It is
              deleted: its entry point had no caller anywhere in the repo, so it never ran, and the
              SVG path below was always what shipped.
            </>
          }
        >
          <LiquidMorphDemo />
        </Section>

        <Section
          id="glasspane"
          eyebrow="components/ui/liquid-glass.tsx"
          title="GlassPane — the pane helper"
          description={
            <>
              <Mono>GlassPane</Mono> wraps the L2 <Mono>.glass-pane</Mono> class with opt-in{' '}
              <Mono>interactive</Mono> and <Mono>refract</Mono> (sets{' '}
              <Mono>data-liquid-glass=&quot;refract&quot;</Mono>). <Mono>liquid</Mono> is a retained
              alias with no effect of its own. Site chrome uses the raw classes; this helper is for
              one-off panes.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <GlassPane className="flex h-32 items-center justify-center p-4">
              <span className="relative z-[1] text-sm font-medium text-site-text">
                &lt;GlassPane&gt;
              </span>
            </GlassPane>
            <GlassPane interactive className="flex h-32 items-center justify-center p-4">
              <span className="relative z-[1] text-sm font-medium text-site-text">interactive</span>
            </GlassPane>
            <GlassPane
              refract
              className="relative flex h-32 items-center justify-center rounded-site p-4"
            >
              <span className="relative z-10 text-sm font-medium text-site-text">refract</span>
            </GlassPane>
          </div>
        </Section>

        {/* ── 8 · Primitive gallery ── */}
        <Section
          id="gallery"
          eyebrow="components/ui/*"
          title="Primitive gallery"
          description="The shared primitives every page composes from, so reviewers can verify each one carries the glass material and the v2 press physics."
        >
          <PrimitiveGallery />
        </Section>

        <footer className="border-t border-site-border pt-6 text-xs text-site-text-dim">
          Internal design-lab reference · Liquid Glass (shader slabs) · every surface uses{' '}
          <Mono>--site-*</Mono> tokens and the <Mono>.glass-*</Mono> classes only.
        </footer>
      </div>
    </div>
  );
}

/** Subheading for a gallery group — keeps the h1 → h2 → h3 order intact. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold uppercase tracking-wide text-site-text-muted">
      {children}
    </h3>
  );
}

function PrimitiveGallery() {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOff, setSwitchOff] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      {/* Buttons */}
      <div className="flex flex-col gap-3">
        <GroupHeading>Button — all variants (spring press · hover sheen)</GroupHeading>
        <div className="flex flex-wrap items-center gap-3">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button loading loadingText="loading…">
            loading
          </Button>
          <Button disabled>disabled</Button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3">
        <GroupHeading>Card — default · pane · interactive</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>
                <Mono>.glass-fill</Mono> — the repeated L1 surface.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">
                Tint + lit CSS edge. Never a canvas. Unlimited per page.
              </p>
            </CardContent>
          </Card>
          <Card pane>
            <CardHeader>
              <CardTitle>Pane card</CardTitle>
              <CardDescription>
                <Mono>.glass-pane</Mono> — a singular L2 panel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">
                A lit shader slab: bevel, Fresnel, cursor light. Budgeted.
              </p>
            </CardContent>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive card</CardTitle>
              <CardDescription>
                <Mono>interactive</Mono> — hover glint ring + pointer light.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-site-text-muted">Hover to raise the material.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Form controls */}
      <div className="flex flex-col gap-3">
        <GroupHeading>Form controls</GroupHeading>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="lg-input" className="text-sm text-site-text-muted">
              Input
            </label>
            <Input id="lg-input" placeholder="Type something…" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="lg-select" className="text-sm text-site-text-muted">
              Select
            </label>
            <Select id="lg-select" defaultValue="a">
              <option value="a">Option A</option>
              <option value="b">Option B</option>
              <option value="c">Option C</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="lg-textarea" className="text-sm text-site-text-muted">
              Textarea
            </label>
            <Textarea id="lg-textarea" placeholder="A longer text field…" />
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sm text-site-text-muted">Switch</span>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="lg-switch-on"
                  checked={switchOn}
                  onCheckedChange={setSwitchOn}
                  aria-label="Switch, on example"
                />
                <label htmlFor="lg-switch-on" className="text-sm text-site-text-dim">
                  on
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="lg-switch-off"
                  checked={switchOff}
                  onCheckedChange={setSwitchOff}
                  aria-label="Switch, off example"
                />
                <label htmlFor="lg-switch-off" className="text-sm text-site-text-dim">
                  off
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sm text-site-text-muted">Slider</span>
            <Slider defaultValue={[40]} aria-label="Slider example" />
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-col gap-3">
        <GroupHeading>Badge — all variants</GroupHeading>
        <div className="flex flex-wrap items-center gap-3">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </div>

      {/* Skeleton */}
      <div className="flex flex-col gap-3">
        <GroupHeading>Skeleton — pulse · shimmer</GroupHeading>
        <div className="flex max-w-md flex-col gap-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton shimmer className="h-10 w-full" />
        </div>
      </div>

      {/* EmptyState */}
      <div className="flex flex-col gap-3">
        <GroupHeading>EmptyState — glass medallion</GroupHeading>
        <Card pane>
          <EmptyState
            icon={Wind}
            title="Nothing here yet"
            description="The icon rests on a small glass-fill medallion."
            action={
              <Button size="sm" variant="outline">
                Take action
              </Button>
            }
          />
        </Card>
      </div>
    </div>
  );
}
