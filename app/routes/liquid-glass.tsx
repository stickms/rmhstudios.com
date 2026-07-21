import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Aperture, Droplets, Layers, MousePointerClick, Sparkles, Waves, Wind } from 'lucide-react';
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
import { useThemeStore } from '@/stores/themeStore';

// §5.46: read-only indicator of the active glass clarity stop (no i18n in the lab).
const CLARITY_LABELS = ['Opaque', 'Calm', 'Default', 'Airy', 'Clear'];
function ClarityIndicator() {
  const level = useThemeStore((s) => s.glassLevel);
  return (
    <Badge variant="outline">
      clarity {level} · {CLARITY_LABELS[level] ?? '—'}
    </Badge>
  );
}

const PATH = '/liquid-glass';
const TITLE = 'Liquid Glass — Design Lab | RMH Studios';
const DESC =
  'The living reference for the Liquid Glass material system: elevation tiers, the scene light and rim glint, lens refraction and chromatic dispersion, the liquid sheen, and the shared UI primitives — all over the real aurora canvas.';

export const Route = createFileRoute('/liquid-glass')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
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
    note: 'Repeated content — cards, rows, tiles. Tint + rim, no blur. No ring. Cheap, unlimited.',
  },
  {
    cls: 'glass-pane',
    name: '.glass-pane',
    label: 'L2 · Pane',
    note: 'Singular panels — heroes, composer, settings. Blur + noise + optics ring. Budgeted.',
  },
  {
    cls: 'glass-chrome rounded-site border border-site-border',
    name: '.glass-chrome',
    label: 'L3 · Chrome',
    note: 'Persistent chrome — sidebar, sticky headers, dock. Thinner bevel; brightens on scroll.',
  },
  {
    cls: 'glass-overlay',
    name: '.glass-overlay',
    label: 'L4 · Overlay',
    note: 'Floating UI — dialogs, popovers, palette, toasts. Ring glint on; opaque enough for text.',
  },
  {
    cls: 'glass-inset',
    name: '.glass-inset',
    label: 'Inset',
    note: 'Recessed wells — inputs, search fields. A hole in the glass — no ring, no slab.',
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
  // §3.7 playground: toggles the demo pane's lens between the rest and press
  // (×1.6) static filters by hand. This pane carries no data-glass-lens, so the
  // bucket generator never fights the inline --glass-lens override.
  const [pressDemo, setPressDemo] = useState(false);
  return (
    // Full-screen top-level page (outside _site/): its own padding + document
    // scroll. The body already paints --site-canvas (the aurora, now two-layer
    // depth) behind us — no external image, every glass surface samples that real
    // backdrop and answers the one scene light.
    <div className="min-h-screen w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6 md:gap-20 lg:py-16">
        {/* ── 1 · Hero ── the page's prism slot: pane + lens refraction + chromatic
            dispersion + the ambient liquid sheen, over the real aurora. */}
        <header
          data-glass-lens=""
          className="glass-pane glass-refract glass-refract--prism glass-liquid relative overflow-hidden rounded-site px-6 py-14 sm:px-12 sm:py-20"
        >
          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-site-accent">
              <Droplets className="h-4 w-4" aria-hidden />
              Design lab
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-site-text sm:text-6xl">
              Liquid Glass
            </h1>
            <p className="max-w-2xl text-base text-site-text-muted sm:text-lg">
              The living reference for the site&apos;s glass material system — elevation tiers, the
              scene light and rim glint, true lens refraction with chromatic dispersion, and the
              liquid sheen, all rendered over the real aurora canvas. Move your mouse: the rims
              glint, the sheen drifts, the backdrop has depth.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="accent">L1–L4 elevation</Badge>
              <Badge variant="default">rim glint</Badge>
              <Badge variant="outline">lens refraction</Badge>
              <ClarityIndicator />
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
              Blur and shadow co-vary with height, and each tier declares whether it carries an
              optics ring. Every swatch below is the named glass class applied directly, over the
              aurora — read the material, then the <Mono>class</Mono> beneath it.
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

        {/* ── 3 · Scene light / rim glint ── */}
        <Section
          id="glint"
          eyebrow="§4"
          title="Scene light & rim glint"
          description={
            <>
              One light, sitewide. On a fine pointer the light <em>is</em> the cursor (viewport
              coords, written to <Mono>--light-x/--light-y</Mono>); on touch or under reduced
              motion it rests at the scene&apos;s &ldquo;sun&rdquo; (top centre). Every pane, chrome
              bar and overlay paints a viewport-anchored specular <strong>rim glint</strong> in its
              optics ring, so as you sweep the cursor across the page each surface&apos;s rim
              brightens on the side facing the light and dims as it passes — all three panes below
              answer the same light at once, with zero per-element JS.
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Pane A', icon: Sparkles },
              { label: 'Pane B', icon: Sparkles },
              { label: 'Pane C', icon: Sparkles },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="glass-pane relative flex h-32 flex-col items-center justify-center gap-2 overflow-hidden rounded-site p-4"
                >
                  <Icon className="relative z-[1] h-6 w-6 text-site-accent" aria-hidden />
                  <span className="relative z-[1] text-sm font-medium text-site-text">
                    {item.label}
                  </span>
                  <span className="relative z-[1] text-xs text-site-text-dim">
                    watch the rim {i === 1 ? 'brighten' : 'track'}
                  </span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── 4 · Pointer light (interactive) ── */}
        <Section
          id="pointer"
          eyebrow="§4.1"
          title="Pointer light — interactive glass"
          description={
            <>
              The glint is the surface&apos;s <em>specular</em> answer; the diffuse footprint is the{' '}
              <Mono>.glass-interactive</Mono> + <Mono>data-glass-light</Mono> hotspot, a soft radial
              that follows your cursor inside the hovered card only (fine pointers only — touch never
              pays for it). Interactive cards also fade in their glint ring on hover, so at most one
              card ring paints at a time. Hover a card.
            </>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Nav pill', icon: Layers },
              { label: 'Dashboard card', icon: Sparkles },
              { label: 'Shop tile', icon: MousePointerClick },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  data-glass-light=""
                  className="glass-fill glass-interactive flex h-32 flex-col items-center justify-center gap-2 p-4"
                >
                  <Icon className="relative z-[1] h-6 w-6 text-site-accent" aria-hidden />
                  <span className="relative z-[1] text-sm font-medium text-site-text">
                    {item.label}
                  </span>
                  <span className="relative z-[1] text-xs text-site-text-dim">hover me</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── 5 · Lens refraction on/off ── the page's second refract slot. */}
        <Section
          id="refraction"
          eyebrow="§3"
          title="Lens refraction — on vs off"
          description={
            <>
              <Mono>.glass-refract</Mono> + <Mono>data-glass-lens</Mono> bends the aurora in the
              pane&apos;s edge bevel using a physically-derived displacement map (smooth edge bevel,
              not turbulence) — the centre stays optically flat. Chromium samples the SVG lens
              (per-element size from <Mono>lib/glass-lens.ts</Mono>, falling back to the static{' '}
              <Mono>#glass-lens</Mono>); other engines keep a plain edge blur. Rationed to hero /
              chrome only, never in scroll containers.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div
              data-glass-lens=""
              className="glass-pane glass-refract relative flex h-44 items-center justify-center overflow-hidden rounded-site p-6"
            >
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Refraction on</span>
                <Mono>.glass-pane .glass-refract</Mono>
                <span className="text-xs text-site-text-dim">
                  watch the edge band bend the aurora inward
                </span>
              </div>
            </div>
            <div className="glass-pane relative flex h-44 items-center justify-center overflow-hidden rounded-site p-6">
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Refraction off</span>
                <Mono>.glass-pane</Mono>
                <span className="text-xs text-site-text-dim">clean, optically flat edge</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 5b · Reactive lens (press-flex) ── §3.7 */}
        <Section
          id="press"
          eyebrow="§3.7"
          title="Reactive lens — press-flex refraction"
          description={
            <>
              The lens has discrete intensity states — no per-frame filter animation
              (that stays banned). Pressing a refract surface swaps to a ×1.6 displacement map so the
              glass flexes under the finger, riding the same spring press. The left pane toggles rest
              ↔ press by hand (it points <Mono>--glass-lens</Mono> at the static{' '}
              <Mono>#glass-lens-press</Mono>); the right pane is on the real <Mono>:active</Mono>{' '}
              path — press and hold it. Both skip the swap under reduced motion.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div
                data-glass-lens=""
                style={
                  pressDemo
                    ? ({ '--glass-lens': "url('#glass-lens-press')" } as React.CSSProperties)
                    : undefined
                }
                className="glass-pane glass-refract relative flex h-40 items-center justify-center overflow-hidden rounded-site p-6"
              >
                <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                  <span className="text-base font-semibold text-site-text">
                    {pressDemo ? 'Press' : 'Rest'}
                  </span>
                  <Mono>{pressDemo ? 'scale ×1.6' : 'scale ×1'}</Mono>
                  <span className="text-xs text-site-text-dim">manual state toggle</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="lg-press-toggle"
                  checked={pressDemo}
                  onCheckedChange={setPressDemo}
                  aria-label="Toggle the lens press state"
                />
                <label htmlFor="lg-press-toggle" className="text-sm text-site-text-muted">
                  {pressDemo ? 'Press state' : 'Rest state'}
                </label>
              </div>
            </div>
            <div
              data-glass-lens=""
              data-glass-light=""
              className="glass-pane glass-refract glass-interactive relative flex h-40 cursor-pointer select-none items-center justify-center overflow-hidden rounded-site p-6"
            >
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <MousePointerClick className="mx-auto h-6 w-6 text-site-accent" aria-hidden />
                <span className="text-base font-semibold text-site-text">Press me</span>
                <Mono>.glass-refract:active</Mono>
                <span className="text-xs text-site-text-dim">
                  press &amp; hold — the bend deepens
                </span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 6 · Liquid sheen ── */}
        <Section
          id="sheen"
          eyebrow="§5.2"
          title="Liquid sheen — living material"
          description={
            <>
              <Mono>.glass-liquid</Mono> (or <Mono>&lt;GlassPane liquid&gt;</Mono>) drifts a slow
              specular band across the surface like light travelling over wet glass — now a
              background layer, so it composes freely with refraction and the pointer light on the
              same pane. Signature surfaces only; ration it. The right card uses{' '}
              <Mono>.glass-sheen-hover</Mono>, the one-shot sweep signature CTAs (and{' '}
              <Mono>Button</Mono> <Mono>default</Mono>/<Mono>accent</Mono>) fire on hover.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <GlassPane
              liquid
              className="relative flex h-44 items-center justify-center overflow-hidden p-6"
            >
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <Waves className="mx-auto h-6 w-6 text-site-accent" aria-hidden />
                <span className="text-base font-semibold text-site-text">Ambient sheen</span>
                <Mono>.glass-liquid</Mono>
                <span className="text-xs text-site-text-dim">a band drifts across every ~9s</span>
              </div>
            </GlassPane>
            <div className="glass-pane glass-sheen-hover relative flex h-44 items-center justify-center overflow-hidden rounded-site p-6">
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <Aperture className="mx-auto h-6 w-6 text-site-accent" aria-hidden />
                <span className="text-base font-semibold text-site-text">Hover sweep</span>
                <Mono>.glass-sheen-hover</Mono>
                <span className="text-xs text-site-text-dim">one pass, per hover</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 7 · GlassPane gallery ── */}
        <Section
          id="glasspane"
          eyebrow="components/ui/liquid-glass.tsx"
          title="GlassPane — the pane helper"
          description={
            <>
              <Mono>GlassPane</Mono> wraps the L2 <Mono>.glass-pane</Mono> class with opt-in{' '}
              <Mono>interactive</Mono>, <Mono>refract</Mono> (sets <Mono>data-glass-lens</Mono>),
              and <Mono>liquid</Mono> props — all composable on one pane. Site chrome uses the raw
              classes; this helper is for one-off panes.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <GlassPane className="flex h-32 items-center justify-center p-4">
              <span className="relative z-[1] text-sm font-medium text-site-text">
                &lt;GlassPane&gt;
              </span>
            </GlassPane>
            <GlassPane
              interactive
              className="flex h-32 items-center justify-center p-4"
            >
              <span className="relative z-[1] text-sm font-medium text-site-text">
                interactive
              </span>
            </GlassPane>
            <GlassPane
              refract
              liquid
              className="relative flex h-32 items-center justify-center overflow-hidden rounded-site p-4"
            >
              <span className="relative z-10 text-sm font-medium text-site-text">
                refract + liquid
              </span>
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
          Internal design-lab reference · Liquid Glass v2 optics · every surface uses{' '}
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
                Tint + rim, no blur, no always-on ring. Unlimited per page.
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
                Backdrop blur + micro-noise + optics ring. Budgeted.
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
            <Textarea id="lg-textarea" placeholder="A longer, recessed text well…" />
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
        <GroupHeading>EmptyState — etched medallion</GroupHeading>
        <Card pane>
          <EmptyState
            icon={Wind}
            title="Nothing here yet"
            description="The icon sits sandblasted into a recessed glass-inset medallion."
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
