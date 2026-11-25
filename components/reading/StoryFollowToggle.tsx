/**
 * StoryFollowToggle — "Follow" / "Following" for a news story (s13-12), on the story page and beside an article's
 * "Part of" line. A secondary button, never the view's ink primary. Signed out it renders nothing. Following tells
 * you once when an admin links a new published article to the story; nobody sees who follows and no count is shown.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { HttpError } from '@/lib/http';
import { api, apiQuery } from '@/lib/contract/client';
import { readingSubscriptionsQuery } from '@/lib/reading/subscriptions.queries';
import { followStoryApi, storyFollowStateApi, unfollowStoryApi } from '@/lib/reading/stories.contract';

export function StoryFollowToggle({ slug, className }: { slug: string; className?: string }) {
  const { t } = useTranslation('news-stories');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const input = { params: { slug } };
  const { data: session } = useSession();
  const signedIn = !!session?.user;
  const state = useQuery({
    ...apiQuery(storyFollowStateApi, input),
    retry: false,
    staleTime: 30_000,
    enabled: signedIn,
  });
  const [busy, setBusy] = useState(false);

  // Signed out (401) or still loading: nothing to press.
  if (!signedIn || state.isPending || (state.error instanceof HttpError && state.error.status === 401)) return null;
  if (state.isError) return null;
  const following = state.data.following;

  async function toggle() {
    setBusy(true);
    try {
      const res = await api(following ? unfollowStoryApi : followStoryApi, input);
      queryClient.setQueryData(apiQuery(storyFollowStateApi, input).queryKey, res);
      // The settings list and the other follow buttons read the reading subscriptions: an unfollow removes one.
      void queryClient.invalidateQueries({ queryKey: readingSubscriptionsQuery(true).queryKey });
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ??
          t('error-toggle', {
            defaultValue: 'Could not update your follow. Try again.',
          }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      className={className}
      aria-pressed={following}
      aria-label={t('follow-label', {
        defaultValue: 'Follow this story',
      })}
      aria-busy={busy}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {following ? <BellRing aria-hidden /> : <Bell aria-hidden />}
      {following
        ? t('following', {
            defaultValue: 'Following',
          })
        : t('follow', {
            defaultValue: 'Follow',
          })}
    </Button>
  );
}
