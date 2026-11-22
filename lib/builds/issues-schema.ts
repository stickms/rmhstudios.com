import { z } from 'zod';
import {
  CREATOR_STATUSES,
  ISSUE_BODY_MAX,
  ISSUE_FILTERS,
  ISSUE_PLATFORMS,
  ISSUE_SORTS,
  ISSUE_STATUSES,
  ISSUE_STEPS_MAX,
  ISSUE_TITLE_MAX,
  ISSUE_WONT_FIX_REASON_MAX,
  ISSUES_PAGE,
} from '@/lib/builds/issues';

const id = z.string().min(1).max(64);

/** A new issue: the version defaults to the build's latest release on the server. */
export const createIssueBody = z.object({
  title: z.string().trim().min(1, 'Title is required').max(ISSUE_TITLE_MAX),
  body: z.string().trim().min(1, 'Say what happened').max(ISSUE_BODY_MAX),
  steps: z.string().trim().max(ISSUE_STEPS_MAX).optional(),
  versionId: id.optional(),
  platform: z.enum(ISSUE_PLATFORMS),
});

/** The reporter's fix while the issue is open. */
export const editIssueBody = createIssueBody.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to change');

/**
 * The creator's status change. `expected` is the status the creator was looking at: a different current status
 * answers 409 and changes nothing (compare-and-set).
 */
export const statusBody = z.object({
  expected: z.enum(ISSUE_STATUSES),
  status: z.enum(CREATOR_STATUSES),
  fixedInId: id.optional(),
  duplicateOfId: id.optional(),
  reason: z.string().trim().max(ISSUE_WONT_FIX_REASON_MAX).optional(),
});

export const hideBody = z.object({ hidden: z.boolean() });

export const voteBody = z.object({ voted: z.boolean() });

/** `cursor` is the last row of the previous page, as the server wrote it. */
export const listIssuesQuery = z.object({
  status: z.enum(ISSUE_FILTERS).optional(),
  sort: z.enum(ISSUE_SORTS).optional(),
  cursor: z
    .string()
    .max(120)
    .regex(/^[0-9A-Za-z.:~_-]+$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(ISSUES_PAGE).optional(),
});
