import {
  Timer,
  Cpu,
  Activity,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react';

export interface Milestone {
  metric: string;
  before: string;
  after: string;
  result: string;
}

export const MILESTONES: Milestone[] =
  [
    {
      metric:
        'Client language payload',
      before:
        '866 KB (all languages)',
      after:
        '292 KB (yours only)',
      result:
        '−66% eager JS; other locales load on demand',
    },
    {
      metric:
        'Docker build context',
      before:
        '~520 MB',
      after:
        '~30 MB',
      result:
        '−94%; smaller images, fewer cold builds',
    },
    {
      metric:
        'Deploy wall-clock',
      before:
        'serial build + boots',
      after:
        'parallel DAG + gated boots',
      result:
        '40–110 s faster per changed deploy',
    },
    {
      metric:
        'Opening a conversation',
      before:
        'fetched the entire inbox',
      after:
        'loader seeds one participant',
      result:
        'a whole request eliminated',
    },
    {
      metric:
        'Build-plugin overhead',
      before:
        '37% of build time',
      after:
        '30% of build time',
      result:
        'a one-line resolver pre-filter',
    },
  ];

export interface Advanced {
  title: string;
  body: string;
}

export const ADVANCED: Advanced[] =
  [
    {
      title:
        'A server/client compiler boundary',
      body: 'The stub-server-files plugin rewrites every `*.server` import to a matching stub in the browser build, so heavy Node-only trees (Postgres, image codecs, auth) are physically absent from the client — enforced at compile time, not by convention.',
    },
    {
      title:
        'SSR-exact language hydration',
      body: 'Only your active non-English language is serialized into the server render payload, so the client hydrates synchronously in the right language with no flash and no mismatch — while English needs nothing shipped at all.',
    },
    {
      title:
        'An optimistic-action primitive',
      body: 'A single apply / commit / rollback / reconcile hook drives every instant interaction, and de-duplicates its own optimistic item against the real-time event that later confirms it — so nothing ever double-renders.',
    },
    {
      title:
        'Disk-aware build caching',
      body: 'Instead of wiping the cache when disk gets tight, the deploy trims stale cache mounts surgically and keeps the expensive layers (three.js, native modules) warm — avoiding minutes-long cold builds.',
    },
  ];

export interface Spec {
  term: string;
  desc: string;
}

export const RENDER_SPECS: Spec[] =
  [
    {
      term: 'Server-side render',
      desc: 'The first response is a finished page, not an empty shell waiting on JavaScript. TanStack Start renders on the server and sends HTML the browser can paint straight away.',
    },
    {
      term: 'Session seeding',
      desc: 'The root loader resolves your session on the server, so the shell renders signed-in on the very first paint instead of flashing signed-out while a client request catches up.',
    },
    {
      term: 'Route loaders',
      desc: 'Each route fetches its data on the server — or on intent-preload — through a shared server helper, so the page arrives already populated. No client-side request waterfall on mount.',
    },
    {
      term: 'Exact-language hydration',
      desc: 'Only your active language is serialized into the render payload, so the client picks up in the right language synchronously — no flash of English, no re-render to swap it.',
    },
    {
      term: 'Render discipline',
      desc: 'Hot components are memoized and subscribe to only the slice of state they use, so a like or a new post re-renders the one card that changed — not the whole timeline.',
    },
  ];

export const BUNDLE_SPECS: Spec[] =
  [
    {
      term: 'Code-split routes',
      desc: 'Every route is its own async chunk, so heavy screens — the 3D games, the code editor — never weigh down the entry bundle for someone who just opened the feed.',
    },
    {
      term: 'Externalized heavy libraries',
      desc: 'three.js, Monaco, PixiJS, and Tone.js are split into their own vendor chunks (Monaco is even split by editor area), so you download them only when you reach a screen that actually needs them.',
    },
    {
      term: 'One language, not all',
      desc: 'The eager locale payload dropped from 866 KB to 292 KB by shipping only the default language up front; the rest code-split and load on demand.',
    },
    {
      term: 'Dead weight removed',
      desc: 'console.log and debug calls are stripped from production, source maps and compressed-size reporting are off in CI, and tree-shaking prunes anything nothing references.',
    },
  ];

export const BUILD_SPECS: Spec[] =
  [
    {
      term: 'Vite + Rolldown',
      desc: 'The production build runs three passes — client (~16 s over 7,830 modules), SSR (~12 s), and the Nitro server bundle (~7 s) — for roughly 40 seconds steady-state.',
    },
    {
      term: 'stub-server-files',
      desc: 'A Vite plugin we wrote replaces every server-only module with a stub in the browser build, so Node-only trees never enter the client graph. We pre-filtered its resolver to skip ~99% of imports, cutting its own share of build time from 37% to 30%.',
    },
    {
      term: 'Traced server deps',
      desc: 'Heavy native and server-only packages are externalized from the server bundle and traced into the output, so the bundler transforms far fewer modules per build.',
    },
    {
      term: 'Parallel service bundle',
      desc: 'The standalone realtime services are bundled separately with esbuild, off the critical Vite path, so they never serialize behind the main build.',
    },
  ];

export interface Step {
  title: string;
  body: string;
}

export const DEPLOY_STEPS: Step[] =
  [
    {
      title:
        'Build in parallel',
      body: 'Images build as a single BuildKit DAG (COMPOSE_BAKE), so the server image builds under the client build’s shadow instead of after it — 30 to 90 seconds saved on a changed build.',
    },
    {
      title:
        'Reuse the cache',
      body: 'The pnpm store and the Vite cache persist across builds as cache mounts, and a shared BuildKit registry cache lets separate machines warm each other.',
    },
    {
      title:
        'Keep the cache warm',
      body: 'When disk gets tight we trim stale cache mounts surgically instead of wiping everything — avoiding a minutes-long cold rebuild of three.js and native modules.',
    },
    {
      title:
        'Ship a lean image',
      body: 'Half a gigabyte of static PDFs is served off-host, so the build context and runtime image are ~500 MB lighter — faster pulls, faster boots, fewer cold builds.',
    },
    {
      title:
        'Skip needless boots',
      body: 'Per-deploy container steps that don’t apply to a given change are gated out, trimming another handful of seconds off every deploy.',
    },
  ];

export interface Measure {
  icon: LucideIcon;
  text: string;
}

export const MEASURE: Measure[] =
  [
    {
      icon: Activity,
      text: 'Real-user Core Web Vitals (LCP, CLS, INP) are collected from actual sessions, so “feels slow” becomes a number we can trend.',
    },
    {
      icon: Cpu,
      text: 'Runtime errors and unhandled rejections are captured globally, so a regression surfaces in our logs instead of failing silently for users.',
    },
    {
      icon: Timer,
      text: 'Every build stage is profiled with wall-clock timing, so we spend effort on the real bottleneck rather than a guess.',
    },
    {
      icon: CheckCircle2,
      text: 'When an idea doesn’t pan out — and some “obvious” wins don’t — we write down why, so we never chase the same dead end twice.',
    },
  ];

export interface Faq {
  q: string;
  a: string;
}

export const OPT_FAQ: Faq[] =
  [
    {
      q: 'Why does the app feel instant even on a slow connection?',
      a: 'Because most of the work already happened before you asked. The page is rendered on the server, its data is prefetched the moment you show intent to click, your actions apply optimistically, and a service worker serves cached assets instantly. The network is rarely on your critical path.',
    },
    {
      q: 'Do all the animations slow things down?',
      a: 'No. Motion is CSS-driven, runs on the compositor, and never blocks interaction — and it’s switched off entirely for anyone who prefers reduced motion. The scroll-reveals on this very page are progressive enhancement: the content is fully there without them.',
    },
    {
      q: 'How big is the initial download?',
      a: 'Only what the first screen needs: your language and the current route. Heavy libraries — 3D engines, the editor, audio — are code-split and arrive lazily when you reach a screen that uses them, not up front.',
    },
    {
      q: 'Is “optimization” ever done?',
      a: 'No, and that’s the point. We keep the numbers honest, keep profiling, and keep trimming. The fastest version of RMH Studios is always the next one.',
    },
  ];

export const LEGAL_LINKS: {
  href: string;
  label: string;
}[] =
  [
    {
      href: '/security',
      label:
        'Security',
    },
    {
      href: '/privacy',
      label:
        'Privacy',
    },
    {
      href: '/terms',
      label:
        'Terms',
    },
    {
      href: '/cookies',
      label:
        'Cookies',
    },
  ];
