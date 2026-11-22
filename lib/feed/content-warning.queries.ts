/**
 * The reader's "Posts with content warnings" choice as a route-seeded query (redesign audit B4). Signed out, nothing is
 * seeded and posts with a warning are covered.
 */
import { getContentWarningSettingApi } from '@/lib/feed/content-warning-settings.contract';
import { contractQuery } from '@/lib/route/route-query';

export const contentWarningSettingQuery = () =>
  contractQuery(['settings', 'content-warnings'], getContentWarningSettingApi, undefined, { staleTime: 60_000 });
