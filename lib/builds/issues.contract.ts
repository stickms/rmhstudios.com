/** Contracts for bug reports on user builds (s10-09). Client-safe: types only. `$id` is the build's id. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { IssueListPage, IssueRefusal, IssueView } from '@/lib/builds/issues';
import type {
  createIssueBody,
  editIssueBody,
  hideBody,
  listIssuesQuery,
  statusBody,
  voteBody,
} from '@/lib/builds/issues-schema';

/** A refusal's body: a static `error` and the stable `reason` the form turns into a translated sentence. */
export interface IssueRefused {
  error: string;
  reason: IssueRefusal;
}

/** One page of a build's issues, with the counts for the filter tabs. Public for a public or unlisted build. */
export const listBuildIssuesApi = endpoint<{
  query: z.infer<typeof listIssuesQuery>;
  res: IssueListPage;
}>()({
  method: 'GET',
  path: '/api/builds/$id/issues',
});

/** Report an issue. */
export const createBuildIssueApi = endpoint<{
  body: z.infer<typeof createIssueBody>;
  res: { issue: IssueView };
}>()({
  method: 'POST',
  path: '/api/builds/$id/issues',
});

/** The reporter fixes their report while it is open. */
export const editBuildIssueApi = endpoint<{
  body: z.infer<typeof editIssueBody>;
  res: { issue: IssueView };
}>()({
  method: 'PATCH',
  path: '/api/builds/$id/issues/$issueId',
});

/** The build's creator sets the status. 409 when it changed since `expected`. */
export const setBuildIssueStatusApi = endpoint<{
  body: z.infer<typeof statusBody>;
  res: { issue: IssueView };
}>()({
  method: 'POST',
  path: '/api/builds/$id/issues/$issueId/status',
});

/** The build's creator hides an issue from everyone but the reporter. */
export const hideBuildIssueApi = endpoint<{
  body: z.infer<typeof hideBody>;
  res: { hidden: boolean };
}>()({
  method: 'POST',
  path: '/api/builds/$id/issues/$issueId/hide',
});

/** The reporter closes their own open issue. */
export const closeBuildIssueApi = endpoint<{
  res: { issue: IssueView };
}>()({
  method: 'POST',
  path: '/api/builds/$id/issues/$issueId/close',
});

/** "I see this too": add or take back. */
export const voteBuildIssueApi = endpoint<{
  body: z.infer<typeof voteBody>;
  res: { voted: boolean; voteCount: number };
}>()({
  method: 'PUT',
  path: '/api/builds/$id/issues/$issueId/vote',
});
