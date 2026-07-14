import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Droplets,
  Layers,
  MousePointerClick,
  Sparkles,
  Wind,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { GlassEffect, GlassDock, GlassButton, type DockIcon } from '@/components/ui/liquid-glass';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

const PATH = '/liquid-glass';
const TITLE = 'Liquid Glass — Design Lab | RMH Studios';
const DESC =
  'The living reference for the Liquid Glass material system: elevation tiers, the one-sun lighting model, pointer-tracked speculars, edge refraction, and the shared UI primitives — all over the real aurora canvas.';

export const Route = createFileRoute('/liquid-glass')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: LiquidGlassLab,
});

/** Dock of RMH apps rendered as glass — icons are local static assets. */
const DOCK_APPS = [
  { src: '/images/games/rmhbox.webp', alt: 'RMHBox', href: '/rmhbox' },
  { src: '/images/games/altair.webp', alt: 'Altair', href: '/altair' },
  { src: '/images/games/rmhtube.webp', alt: 'RMHTube', href: '/rmhtube' },
  { src: '/images/games/rmhmusic.webp', alt: 'RMHMusic', href: '/rmhmusic' },
  { src: '/images/games/rmhtype.webp', alt: 'RMHType', href: '/rmhtype' },
] as const;

/** The elevation swatches (§3.3 / §4.4). Each swatch IS the glass surface so
 *  reviewers can read the material directly; the class name shows in mono. */
const TIERS = [
  {
    cls: 'glass-fill',
    name: '.glass-fill',
    label: 'L1 · Fill',
    note: 'Repeated content — cards, rows, tiles. Tint + rim, no blur. Cheap, unlimited per page.',
  },
  {
    cls: 'glass-pane',
    name: '.glass-pane',
    label: 'L2 · Pane',
    note: 'Singular panels — heroes, composer, settings sections. Blur + micro-noise. Budgeted.',
  },
  {
    cls: 'glass-chrome rounded-site border border-site-border',
    name: '.glass-chrome',
    label: 'L3 · Chrome',
    note: 'Persistent chrome — sidebar, sticky headers, dock. More aurora shows through.',
  },
  {
    cls: 'glass-overlay',
    name: '.glass-overlay',
    label: 'L4 · Overlay',
    note: 'Floating UI — dialogs, popovers, menus, palette, toasts. Opaque enough to hold text.',
  },
  {
    cls: 'glass-inset',
    name: '.glass-inset',
    label: 'Inset',
    note: 'Recessed wells — inputs, search fields. A hole in the glass, not a slab on it.',
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
  return (
    <code className="font-mono text-xs text-site-accent">{children}</code>
  );
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
        <h2
          id={`${id}-heading`}
          className="text-2xl font-semibold tracking-tight text-site-text"
        >
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
  const navigate = useNavigate();

  const dockIcons: DockIcon[] = DOCK_APPS.map((app) => ({
    src: app.src,
    alt: app.alt,
    onClick: () => navigate({ to: app.href }),
  }));

  return (
    // Full-screen top-level page (outside _site/): its own padding + document
    // scroll. The body already paints --site-canvas (the aurora) behind us — no
    // external image, every glass surface samples that real backdrop.
    <div className="min-h-screen w-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6 md:gap-20 lg:py-16">
        {/* ── 1 · Hero ── L2 pane + the page's first (of two) refract slots, plus
            the prism chromatic rim reserved for the design lab (§4.3.5). */}
        <header className="glass-pane glass-refract glass-refract--prism relative overflow-hidden rounded-site px-6 py-14 sm:px-12 sm:py-20">
          <div className="relative z-10 flex flex-col items-center gap-4 text-center">
            <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-site-accent">
              <Droplets className="h-4 w-4" aria-hidden />
              Design lab
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-site-text sm:text-6xl">
              Liquid Glass
            </h1>
            <p className="max-w-2xl text-base text-site-text-muted sm:text-lg">
              The living reference for the site&apos;s glass material system — elevation
              tiers, the one-sun lighting model, pointer-tracked speculars, and edge
              refraction, all rendered over the real aurora canvas.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Badge variant="accent">L1–L4 elevation</Badge>
              <Badge variant="default">pointer light</Badge>
              <Badge variant="outline">edge refraction</Badge>
            </div>
          </div>
        </header>

        {/* ── 2 · Elevation tiers ── */}
        <Section
          id="elevation"
          eyebrow="§4.4"
          title="Elevation tiers"
          description={
            <>
              Blur and shadow co-vary with height. Each swatch below is the named glass
              class applied directly, over the aurora — read the material, then the{' '}
              <Mono>class</Mono> beneath it.
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {TIERS.map((tier) => (
              <div key={tier.name} className="flex flex-col gap-2">
                <div
                  className={cn(
                    'flex h-28 items-center justify-center px-3 text-center',
                    tier.cls,
                  )}
                >
                  <span className="text-sm font-medium text-site-text">{tier.label}</span>
                </div>
                <Mono>{tier.name}</Mono>
                <p className="text-xs text-site-text-dim">{tier.note}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 3 · Lighting model / pointer light ── */}
        <Section
          id="lighting"
          eyebrow="§4.2 / §5.1"
          title="Lighting model & pointer light"
          description={
            <>
              One sun, top-slightly-left, sitewide. Interactive glass adds{' '}
              <Mono>.glass-interactive</Mono> plus <Mono>data-glass-light</Mono>: a soft
              radial specular that follows your cursor (fine-pointer devices only — touch
              never pays for it). Hover a card.
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
                  <Icon className="h-6 w-6 text-site-accent" aria-hidden />
                  <span className="text-sm font-medium text-site-text">{item.label}</span>
                  <span className="text-xs text-site-text-dim">hover me</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── 4 · Refraction on/off ── the page's second (and last) refract slot. */}
        <Section
          id="refraction"
          eyebrow="§4.3"
          title="Refraction — on vs off"
          description={
            <>
              <Mono>.glass-refract</Mono> displaces the backdrop in a ~14px edge band so
              the aurora bends at the pane&apos;s rim (Chromium upgrades to the{' '}
              <Mono>#glass-distortion</Mono> displacement map; other engines keep the plain
              edge blur). Rationed to ≤ 2 hero/chrome elements per page — the hero and this
              comparison are this page&apos;s two.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="glass-pane glass-refract relative flex h-44 items-center justify-center overflow-hidden rounded-site p-6">
              <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Refraction on</span>
                <Mono>.glass-pane .glass-refract</Mono>
                <span className="text-xs text-site-text-dim">
                  watch the edge band bend the aurora
                </span>
              </div>
            </div>
            <div className="glass-pane relative flex h-44 items-center justify-center overflow-hidden rounded-site p-6">
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-base font-semibold text-site-text">Refraction off</span>
                <Mono>.glass-pane</Mono>
                <span className="text-xs text-site-text-dim">clean, optically flat edge</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 5 · GlassEffect / GlassDock / GlassButton showcase (trimmed) ── */}
        <Section
          id="primitives-glass"
          eyebrow="components/ui/liquid-glass.tsx"
          title="GlassEffect · Dock · Button"
          description={
            <>
              The standalone glass primitives (refract → tint → rim → content layer
              stack). <Mono>GlassDock</Mono> and <Mono>GlassButton</Mono> are built on{' '}
              <Mono>GlassEffect</Mono>; site buttons use the <Mono>Button</Mono> primitive
              below instead.
            </>
          }
        >
          <div className="flex flex-col items-center gap-8 py-4">
            <GlassDock icons={dockIcons} />
            <GlassButton>
              <span className="text-lg text-site-text">How can I help you today?</span>
            </GlassButton>
            <GlassEffect className="rounded-3xl px-8 py-5">
              <span className="text-sm text-site-text">GlassEffect · one-off panel</span>
            </GlassEffect>
          </div>
        </Section>

        {/* ── 6 · Primitive gallery ── */}
        <Section
          id="gallery"
          eyebrow="components/ui/*"
          title="Primitive gallery"
          description="The shared primitives every page composes from, so reviewers can verify each one carries the glass material."
        >
          <PrimitiveGallery />
        </Section>

        <footer className="border-t border-site-border pt-6 text-xs text-site-text-dim">
          Internal design-lab reference · Liquid Glass UI redesign · every surface uses{' '}
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
        <GroupHeading>Button — all variants</GroupHeading>
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
                Tint + rim, no blur. Unlimited per page.
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
                Backdrop blur + micro-noise. Budgeted.
              </p>
            </CardContent>
          </Card>
          <Card interactive>
            <CardHeader>
              <CardTitle>Interactive card</CardTitle>
              <CardDescription>
                <Mono>interactive</Mono> — hover tint-raise + pointer light.
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
