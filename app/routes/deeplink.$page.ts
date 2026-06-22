import { createFileRoute } from '@tanstack/react-router';
import foundationModels from '@/lib/deeplink/foundation-models.html?raw';
import agentsRl from '@/lib/deeplink/agents-rl.html?raw';
import aiForScience from '@/lib/deeplink/ai-for-science.html?raw';
import safetyAlignment from '@/lib/deeplink/safety-alignment.html?raw';
import lifeSciences from '@/lib/deeplink/life-sciences.html?raw';
import energyClimate from '@/lib/deeplink/energy-climate.html?raw';
import mathematics from '@/lib/deeplink/mathematics.html?raw';
import frontierSafety from '@/lib/deeplink/frontier-safety.html?raw';
import alignment from '@/lib/deeplink/alignment.html?raw';

/**
 * /deeplink/<page> — RMH Deeplink research detail pages.
 *
 * Each page is standalone HTML in lib/deeplink, served at a clean URL. The map
 * is an explicit allow-list so the param can never read an arbitrary module.
 */
const PAGES: Record<string, string> = {
  'foundation-models': foundationModels,
  'agents-rl': agentsRl,
  'ai-for-science': aiForScience,
  'safety-alignment': safetyAlignment,
  'life-sciences': lifeSciences,
  'energy-climate': energyClimate,
  mathematics,
  'frontier-safety': frontierSafety,
  alignment,
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
} as const;

export const Route = createFileRoute('/deeplink/$page')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const html = PAGES[params.page];
        if (!html) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return new Response(html, { status: 200, headers: HTML_HEADERS });
      },
    },
  },
});
