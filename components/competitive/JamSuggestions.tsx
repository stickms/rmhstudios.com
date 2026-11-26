import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { suggestJamThemeApi, withdrawJamSuggestionApi } from '@/lib/competitive/jam-suggestions.contract';
import { jamSuggestionsQuery } from '@/lib/competitive/jam-suggestions.queries';
import { SUGGESTION_MAX, SUGGESTION_MIN, normaliseSuggestion } from '@/lib/competitive/jam-suggestions';

/**
 * "Suggest a theme" (before the vote opens): up to three suggestions per member, seen only by their author and by
 * admins. "On the shortlist" is shown only once the server says so (after the vote opens), never before.
 */
export function JamSuggestions({ slug, signedIn }: { slug: string; signedIn: boolean }) {
  const { t } = useTranslation('jam-suggestions');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const query = jamSuggestionsQuery(slug, signedIn);
  const { data, isError } = useQuery(query);
  const view = data?.view;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const arrival = useArrival(view !== undefined);

  if (!signedIn) {
    return (
      <section className="space-y-2" aria-labelledby="jam-suggest-title">
        <h2 id="jam-suggest-title" className="t-heading">
          {t('title', { defaultValue: 'Suggest a theme' })}
        </h2>
        <p className="t-body">
          <Link to="/login" className="underline">
            {t('sign-in', { defaultValue: 'Sign in to suggest a theme' })}
          </Link>
        </p>
      </section>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="t-meta text-site-danger">
        {t('load-failed', { defaultValue: 'Could not load your theme suggestions' })}
      </p>
    );
  }
  if (!view) return <Skeleton className="h-24 rounded-site" />;
  // Closed, and nothing of yours to show: the section has nothing to say.
  if (!view.open && view.mine.length === 0) return null;

  const full = view.mine.length >= view.limit;
  const ready = normaliseSuggestion(text) !== null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: query.queryKey });

  const suggest = async () => {
    setBusy(true);
    try {
      await api(suggestJamThemeApi, { params: { slug }, body: { text } });
      setText('');
      toast.success(t('suggested', { defaultValue: 'Theme suggested' }));
      await refresh();
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('suggest-failed', { defaultValue: 'Could not suggest that theme' }));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    try {
      await api(withdrawJamSuggestionApi, { params: { slug, id } });
      await refresh();
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('withdraw-failed', { defaultValue: 'Could not withdraw that suggestion' }));
    }
  };

  return (
    <section className={cn('space-y-2', arrival)} aria-labelledby="jam-suggest-title">
      <h2 id="jam-suggest-title" className="t-heading">
        {t('title', { defaultValue: 'Suggest a theme' })}
      </h2>
      <p className="t-meta">
        {view.open
          ? t('hint', {
              defaultValue: 'Only you and the jam admins see your suggestions. You can suggest up to {{max}}.',
              max: view.limit,
            })
          : t('closed', { defaultValue: 'Suggestions for this jam are closed.' })}
      </p>
      {view.mine.length > 0 && (
        <ul>
          {view.mine.map((s) => (
            <li
              key={s.id}
              className="flex min-h-9 items-center gap-2 border-b border-site-border py-2 pointer-coarse:min-h-11"
            >
              <span dir="auto" className="t-body min-w-0 flex-1 truncate">
                {s.text}
              </span>
              {s.shortlisted && (
                <span className="t-meta">{t('on-shortlist', { defaultValue: 'On the shortlist' })}</span>
              )}
              {view.open && (
                <IconButton
                  icon={X}
                  label={t('withdraw', { defaultValue: 'Withdraw suggestion' })}
                  onClick={() => void withdraw(s.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {view.open && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !full) void suggest();
          }}
        >
          <Input
            dir="auto"
            value={text}
            minLength={SUGGESTION_MIN}
            maxLength={SUGGESTION_MAX}
            disabled={full}
            className="min-w-0 flex-1"
            aria-label={t('field', { defaultValue: 'Your theme suggestion' })}
            placeholder={t('placeholder', { defaultValue: 'A theme idea' })}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="primary" loading={busy} disabled={!ready || full}>
            {t('suggest', { defaultValue: 'Suggest' })}
          </Button>
          {full && (
            <p className="t-meta w-full">
              {t('limit-reached', {
                defaultValue: 'You have suggested {{max}} themes. Withdraw one to suggest another.',
                max: view.limit,
              })}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
