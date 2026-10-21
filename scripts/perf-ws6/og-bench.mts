import { performance } from 'node:perf_hooks';
import { Resvg } from '@resvg/resvg-js';

// time Resvg.render (sync rasterise) separately
let resvgMs = 0;
const origRender = Resvg.prototype.render;
Resvg.prototype.render = function (this: any) {
  const t = performance.now();
  const r = origRender.call(this);
  resvgMs += performance.now() - t;
  return r;
};

const { loadFonts } = await import('@/lib/og/shared.server');
const { renderPageCard } = await import('@/lib/og/page-card.server');
const { renderPostOgImage } = await import('@/lib/og/post-image.server');
const { renderProfileOgImage } = await import('@/lib/og/profile-image.server');
const { renderPostStoryImage } = await import('@/lib/og/post-story.server');

// event-loop stall sampler: setInterval(1) gap
let maxGap = 0;
let last = performance.now();
const hb = setInterval(() => {
  const now = performance.now();
  maxGap = Math.max(maxGap, now - last - 1);
  last = now;
}, 1);

async function measure(label: string, fn: (i: number) => Promise<Buffer>, n = 6) {
  const rows: { total: number; resvg: number; stall: number; bytes: number }[] = [];
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 20));
    resvgMs = 0;
    maxGap = 0;
    last = performance.now();
    const t = performance.now();
    const png = await fn(i);
    const total = performance.now() - t;
    await new Promise((r) => setTimeout(r, 5));
    rows.push({ total, resvg: resvgMs, stall: maxGap, bytes: png.byteLength });
  }
  const cold = rows[0];
  const warm = rows.slice(1);
  const med = (k: 'total' | 'resvg' | 'stall') =>
    warm.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(warm.length / 2)];
  console.log(
    `${label.padEnd(22)} first: total=${cold.total.toFixed(0)}ms resvg=${cold.resvg.toFixed(0)} stall=${cold.stall.toFixed(0)} | next(new key): total=${med('total').toFixed(0)} resvg=${med('resvg').toFixed(0)} stall=${med('stall').toFixed(0)} | ${cold.bytes}B`,
  );
}

const t0 = performance.now();
await loadFonts();
console.log('fonts load', (performance.now() - t0).toFixed(0), 'ms');

const text = 'Shipping a new build of the game today. '.repeat(5);
await measure('page-card game(art)', (i) =>
  renderPageCard({
    cacheKey: 'g' + i + Math.random(),
    eyebrow: 'Game hub',
    title: 'Kowloon Knockout',
    subtitle: 'A fighting game set in a walled city '.repeat(3),
    lead: 'fighting · arcade',
    art: '/images/games/Kowloon-Knockout.webp',
    path: '/games/kk',
    stats: [{ value: '4.5', label: 'rating', lead: true }, { value: '12', label: 'reviews' }],
  }),
);
await measure('page-card no-art', (i) =>
  renderPageCard({
    cacheKey: 'n' + i + Math.random(),
    eyebrow: 'Devlog',
    title: 'A title for a devlog entry',
    subtitle: 'sub '.repeat(30),
    stats: [{ value: '3', label: 'min read', lead: true }],
  }),
);
await measure('page-card story', (i) =>
  renderPageCard({
    cacheKey: 's' + i + Math.random(),
    variant: 'story',
    eyebrow: 'Moment',
    title: 'A shared moment',
    subtitle: 'sub '.repeat(30),
    stats: [{ value: '3', label: 'min read', lead: true }],
  }),
);
await measure('post text', (i) =>
  renderPostOgImage({
    id: 'p' + i + Math.random(),
    content: text,
    authorName: 'Alex',
    authorHandle: 'alex',
    authorImage: null,
    likeCount: 1,
    commentCount: 2,
    repostCount: 3,
    createdAt: new Date(),
  }),
);
await measure('post 2 images', (i) =>
  renderPostOgImage({
    id: 'pi' + i + Math.random(),
    content: text,
    authorName: 'Alex',
    authorHandle: 'alex',
    authorImage: null,
    likeCount: 1,
    commentCount: 2,
    repostCount: 3,
    createdAt: new Date(),
    images: ['/images/games/Kowloon-Knockout.webp', '/images/games/altair.webp'],
  }),
);
await measure('profile', (i) =>
  renderProfileOgImage({
    id: 'u' + i + Math.random(),
    name: 'Alex',
    handle: 'alex',
    image: null,
    bio: text,
    followerCount: 120,
    postCount: 40,
  }),
);
await measure('post story', (i) =>
  renderPostStoryImage({
    id: 'ps' + i + Math.random(),
    content: text,
    authorName: 'Alex',
    authorHandle: 'alex',
    authorImage: null,
  }),
);
clearInterval(hb);
process.exit(0);
