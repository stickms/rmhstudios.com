import { createFileRoute } from '@tanstack/react-router';
import { ADSENSE_CLIENT_ID } from '@/lib/ads/adsense';

/**
 * /ads.txt — the IAB Authorized Digital Sellers record.
 *
 * A one-line public declaration that Google is allowed to sell this domain's
 * inventory. It is not optional decoration: AdSense crawls it, and buyers treat
 * a domain with no `ads.txt` (or one that doesn't list the seller bidding on
 * it) as unauthorized inventory, which suppresses demand and can leave a
 * publisher account showing "Earnings at risk".
 *
 * Generated rather than checked in as `public/ads.txt` because the record
 * contains the publisher id, which is per-environment: a hardcoded file would
 * either ship a placeholder pub id (an actively wrong claim about who may sell
 * this domain) or leak the production one into every dev checkout. With
 * `VITE_ADSENSE_CLIENT_ID` unset — every dev machine, and any deploy that
 * hasn't turned ads on — this 404s, which is exactly what a domain that sells
 * no ads should say.
 *
 * `f08c47fec0942fa0` is Google's certification-authority id, a fixed constant
 * published by Google for every AdSense/AdX record; it is not account-specific.
 */
const GOOGLE_CERTIFICATION_AUTHORITY_ID = 'f08c47fec0942fa0';

export const Route = createFileRoute('/ads.txt')({
  server: {
    handlers: {
      GET: async () => {
        // The tag uses `ca-pub-…`; the ads.txt record uses the bare `pub-…`
        // form of the same id. Accept either spelling from the env so a value
        // copied out of the AdSense dashboard works whichever field it came from.
        const publisherId = ADSENSE_CLIENT_ID.replace(/^ca-/, '');
        if (!/^pub-\d+$/.test(publisherId)) {
          return new Response('Not found', { status: 404 });
        }

        const body = `# RMH Studios — IAB Authorized Digital Sellers\ngoogle.com, ${publisherId}, DIRECT, ${GOOGLE_CERTIFICATION_AUTHORITY_ID}\n`;

        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            // Crawled periodically, changes ~never. A day of edge caching keeps
            // the crawler off the origin without delaying a real change past
            // the next crawl cycle.
            'Cache-Control': 'public, max-age=86400',
          },
        });
      },
    },
  },
});
