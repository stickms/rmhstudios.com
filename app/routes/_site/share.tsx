/**
 * /share — PWA Web Share Target handler.
 *
 * Registered via `share_target` in the web manifest as a POST multipart target,
 * so another app's share sheet can hand RMH text, a link, or photos and videos.
 * The service worker (`public/sw-share-target.js`) catches that POST, stages the
 * payload in Cache Storage and redirects here as `/share?pending=<id>`; this page
 * reads it back once (`consumeSharedPayload`) and opens the composer with the
 * text and files filled in. A plain `?title=&text=&url=` GET still works, for
 * browsers that open the target without the worker.
 */

import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { ComposeModal } from '@/components/feed/ComposeModal';
import { buildShareDraft, consumeSharedPayload } from '@/lib/share/share-target';

export const Route = createFileRoute('/_site/share')({
  validateSearch: (search: Record<string, unknown>) => ({
    title: typeof search.title === 'string' ? search.title : '',
    text: typeof search.text === 'string' ? search.text : '',
    url: typeof search.url === 'string' ? search.url : '',
    pending: typeof search.pending === 'string' ? search.pending : '',
  }),
  head: () => ({ meta: [{ title: 'Share to RMH Studios' }] }),
  component: SharePage,
});

interface ShareSeed {
  draft: string;
  files: File[];
}

function SharePage() {
  const { title, text, url, pending } = Route.useSearch();
  const navigate = useNavigate();
  // Without a staged payload the query string is the whole share; with one, the
  // composer waits until the payload has been read so it opens filled in.
  const [seed, setSeed] = useState<ShareSeed | null>(() =>
    pending ? null : { draft: buildShareDraft({ title, text, url }), files: [] },
  );

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    void consumeSharedPayload(pending).then((payload) => {
      if (cancelled) return;
      setSeed({
        draft: buildShareDraft(payload ?? { title, text, url }),
        files: payload?.files ?? [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pending, title, text, url]);

  return (
    <PageFrame>
      {seed && (
        <ComposeModal
          open
          initialContent={seed.draft}
          initialFiles={seed.files}
          onClose={() => navigate({ to: '/' })}
        />
      )}
    </PageFrame>
  );
}
