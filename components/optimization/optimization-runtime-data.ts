import {
  Gauge,
  Zap,
  Rocket,
  Package,
  Image as ImageIcon,
  Radio,
  Layers,
  HardDrive,
  Feather,
  Wand2,
  Timer,
  type LucideIcon,
} from 'lucide-react';

export interface Pillar {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

export const RUNTIME: Pillar[] =
  [
    {
      icon: Gauge,
      title:
        'Seeded, server-rendered first paint',
      body: 'The server resolves your session and the page’s data in a single pass, so the app renders signed-in and populated on the very first paint — no spinner, no flash of signed-out, no client-side waterfall.',
      tag: 'SSR · Route loaders',
    },
    {
      icon: Zap,
      title:
        'Prefetched on intent',
      body: 'Hover or focus a link and we quietly preload its data 50 ms later; the real click then renders from a warm 30-second cache. Navigation feels instant because the work already happened.',
      tag: 'Intent preload',
    },
    {
      icon: Rocket,
      title:
        'Optimistic everything',
      body: 'Likes, posts, comments, and bookmarks apply the instant you act, then reconcile with the authoritative server record — rolling back only if it truly fails. One shared apply / commit / rollback primitive powers it all.',
      tag: 'Optimistic writes',
    },
    {
      icon: Package,
      title:
        'Ship only what’s needed',
      body: 'Routes are code-split, heavy libraries (3D, editors, audio) are externalized from the main bundle, and we load only your language — the eager locale payload dropped from 866 KB to 292 KB.',
      tag: 'Code splitting',
    },
    {
      icon: ImageIcon,
      title:
        'Images that adapt',
      body: 'Everything is re-encoded to WebP, sized down the wire with srcset, and blurred-up while it loads. Our image proxy is SSRF-guarded and cached immutably for a year.',
      tag: 'WebP · srcset · blur-up',
    },
    {
      icon: Radio,
      title:
        'Real-time without polling',
      body: 'The feed streams over Server-Sent Events instead of hammering the API on a timer, and a service worker serves immutable assets instantly — keeping the app usable even offline.',
      tag: 'SSE · Service worker',
    },
  ];

export interface Stat {
  num: string;
  label: string;
}

export const STATS: Stat[] =
  [
    {
      num: '292 KB',
      label:
        'Active-language client payload — down from 866 KB',
    },
    {
      num: '~40 s',
      label:
        'Full production build across 7,830 modules',
    },
    {
      num: '50 ms',
      label:
        'Intent-preload — before you even click',
    },
    {
      num: '40–110 s',
      label:
        'Trimmed from every changed deploy',
    },
  ];

export interface BuildFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const BUILDTIME: BuildFeature[] =
  [
    {
      icon: Layers,
      title:
        'One parallel build graph',
      body: 'Images build as a single BuildKit DAG (COMPOSE_BAKE), folding the server build under the client build’s shadow — 30–90 seconds off every changed build.',
    },
    {
      icon: HardDrive,
      title:
        'Caches that survive',
      body: 'The pnpm store, the Vite/Vinxi cache, and a shared BuildKit registry cache persist across builds, with disk-aware pruning that keeps the cache warm instead of nuking it.',
    },
    {
      icon: Feather,
      title:
        'A lean build context',
      body: 'Half a gigabyte of static PDFs is served off-host, shrinking the build context from ~520 MB to ~30 MB — smaller images, faster pulls, and far fewer cold builds.',
    },
    {
      icon: Wand2,
      title:
        'A compiler plugin we wrote',
      body: 'Our stub-server-files Vite plugin swaps server-only modules for stubs on the client, so Node-only dependency trees never reach the browser bundle — and we pre-filtered it to cut its own build cost.',
    },
    {
      icon: Timer,
      title:
        'Measured, never guessed',
      body: 'Every stage is profiled — client 16 s, SSR 12 s, Nitro 7 s — so we optimize against real numbers and record what worked, and what didn’t.',
    },
  ];
