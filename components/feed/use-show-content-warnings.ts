import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/Providers';
import { contentWarningSettingQuery } from '@/lib/feed/content-warning.queries';
import {
  applyContentWarning,
  type AppliedContentWarning,
  type ContentWarningSubject,
} from '@/lib/feed/content-warning';

/**
 * The signed-in viewer's "Posts with content warnings: Show them" choice (sprint 06 #16). Signed out, or before the
 * setting has loaded, posts with a warning are covered: the choice is about what to reveal, never about hiding more.
 */
export function useShowContentWarnings(): boolean {
  const { data: session } = useSession();
  const { data } = useQuery({ ...contentWarningSettingQuery(), enabled: !!session });
  return !!session && data?.showContentWarnings === true;
}

/** How a post's warning applies to this viewer (the author is never covered from their own post). */
export function useAppliedContentWarning(post: ContentWarningSubject): AppliedContentWarning {
  const { data: session } = useSession();
  const showWarned = useShowContentWarnings();
  return applyContentWarning(post, { userId: session?.user?.id ?? null, showWarned });
}
