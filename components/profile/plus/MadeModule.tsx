import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Hammer } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { apiQuery } from '@/lib/contract/client';
import { getMadeApi } from '@/lib/profile/made.contract';
import { madeKindsParam, type MadeItem, type MadeKind } from '@/lib/profile/made';
import { madeFigureText, madeKindLabels } from './made-labels';

export type MadeState = 'loading' | 'ready' | 'error';

/**
 * The module's body, with no data fetching of its own so it renders the same on the server and in a test. A visitor
 * sees nothing while it loads, when it fails and when it is empty (a box that appears and vanishes is worse than no
 * box); the owner sees the loading skeleton, a line on failure and "Nothing published yet" when empty.
 */
export function MadeView({
  title,
  items,
  state,
  isOwner,
}: {
  title: string;
  items: readonly MadeItem[];
  state: MadeState;
  isOwner: boolean;
}) {
  const { t } = useTranslation('profile-made');
  const kinds = madeKindLabels(t);
  if (!isOwner && (state !== 'ready' || items.length === 0)) return null;

  return (
    <WidgetFrame
      title={title}
      icon={Hammer}
      loading={state === 'loading'}
      empty={state !== 'loading' && items.length === 0}
      emptyTitle={
        state === 'error'
          ? t('error', { defaultValue: "Couldn't load this" })
          : t('empty', { defaultValue: 'Nothing published yet' })
      }
      emptyDescription={
        state === 'error'
          ? undefined
          : t('empty-hint', {
              defaultValue: 'Puzzles, decks, charts and builds you publish show up here.',
            })
      }
    >
      <ul>
        {items.map((item) => (
          <li key={`${item.kind}:${item.id}`} className="border-b border-site-border last:border-b-0">
            <a
              href={item.href}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 hover:bg-site-bg-subtle"
            >
              <span dir="auto" className="t-body min-w-0 truncate text-site-text">
                {item.title}
              </span>
              <span className="t-meta shrink-0">
                {kinds[item.kind]} · {madeFigureText(t, item.figure)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}

/**
 * "Made here" — what the member has made and published: up to four each of grids, boards, public decks, charts and
 * public builds, newest first. One fetch per profile view, through React Query.
 */
export default function MadeModule({
  title,
  userId,
  isOwner,
  kinds,
}: {
  title: string;
  userId: string;
  isOwner: boolean;
  kinds: readonly MadeKind[];
}) {
  const none = kinds.length === 0;
  const query = useQuery({
    ...apiQuery(getMadeApi, { params: { id: userId }, query: { kinds: madeKindsParam(kinds) } }),
    enabled: !none,
    staleTime: 60_000,
  });
  const state: MadeState = none ? 'ready' : query.isPending ? 'loading' : query.isError ? 'error' : 'ready';
  return <MadeView title={title} items={query.data?.items ?? []} state={state} isOwner={isOwner} />;
}
