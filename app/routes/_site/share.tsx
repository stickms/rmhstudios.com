/**
 * /share — PWA Web Share Target handler.
 *
 * Registered via `share_target` in the web manifest. When the installed app is
 * chosen from another app's native share sheet, the OS opens this route with the
 * shared title/text/url as query params. We stitch them into a single draft and
 * open the composer prefilled, so sharing a link into RMH lands the user on a
 * ready-to-post RMHark instead of a cold create screen.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ComposeModal } from '@/components/feed/ComposeModal';

export const Route = createFileRoute('/_site/share')({
  validateSearch: (search: Record<string, unknown>) => ({
    title: typeof search.title === 'string' ? search.title : '',
    text: typeof search.text === 'string' ? search.text : '',
    url: typeof search.url === 'string' ? search.url : '',
  }),
  head: () => ({ meta: [{ title: 'Share to RMH Studios' }] }),
  component: SharePage,
});

/** Merge the shared fields into one composer draft, de-duplicating a URL that
 *  some apps repeat in both `text` and `url`. */
function buildDraft({ title, text, url }: { title: string; text: string; url: string }): string {
  const parts: string[] = [];
  if (title && title !== text) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join('\n\n').trim().slice(0, 500);
}

function SharePage() {
  const { title, text, url } = Route.useSearch();
  const navigate = useNavigate();
  const draft = buildDraft({ title, text, url });

  return (
    <AnimatedMain className="w-full min-w-0 pb-dock">
      <ComposeModal open initialContent={draft} onClose={() => navigate({ to: '/' })} />
    </AnimatedMain>
  );
}
