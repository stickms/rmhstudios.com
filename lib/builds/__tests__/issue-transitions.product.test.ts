import { describe, expect, it } from 'vitest';
import {
  ISSUE_STATUSES,
  canReporterClose,
  canReporterEdit,
  checkTransition,
  issueRights,
  issueVisibleTo,
  issuesReadable,
  statusColumns,
  statusFilter,
} from '@/lib/builds/issues';

describe('checkTransition', () => {
  it('needs a release for "fixed" and another issue for "duplicate"', () => {
    expect(checkTransition('open', { status: 'fixed' }, 'i1')).toBe('needs-release');
    expect(checkTransition('open', { status: 'fixed', fixedInId: 'v1' }, 'i1')).toBeNull();
    expect(checkTransition('open', { status: 'duplicate' }, 'i1')).toBe('needs-duplicate');
    expect(checkTransition('open', { status: 'duplicate', duplicateOfId: 'i1' }, 'i1')).toBe('duplicate-of-self');
    expect(checkTransition('open', { status: 'duplicate', duplicateOfId: 'i2' }, 'i1')).toBeNull();
  });

  it('must change something, except where the details can change (release, target, reason)', () => {
    expect(checkTransition('open', { status: 'open' }, 'i1')).toBe('same-status');
    expect(checkTransition('confirmed', { status: 'confirmed' }, 'i1')).toBe('same-status');
    expect(checkTransition('fixed', { status: 'fixed', fixedInId: 'v2' }, 'i1')).toBeNull();
    expect(checkTransition('wont_fix', { status: 'wont_fix', reason: 'later' }, 'i1')).toBeNull();
  });

  it('allows reopening a settled issue and refuses to reopen one the reporter closed', () => {
    for (const from of ISSUE_STATUSES.filter((s) => s !== 'closed')) {
      const to = from === 'open' ? 'confirmed' : 'open';
      expect(checkTransition(from, { status: to }, 'i1'), `${from} to ${to}`).toBeNull();
    }
    expect(checkTransition('closed', { status: 'open' }, 'i1')).toBe('closed');
  });
});

describe('statusColumns', () => {
  it('keeps only what belongs to the new status', () => {
    expect(statusColumns({ status: 'fixed', fixedInId: 'v1', duplicateOfId: 'i2', reason: 'x' })).toEqual({
      status: 'fixed',
      fixedInId: 'v1',
      duplicateOfId: null,
      wontFixReason: null,
    });
    expect(statusColumns({ status: 'duplicate', duplicateOfId: 'i2', fixedInId: 'v1' })).toMatchObject({
      fixedInId: null,
      duplicateOfId: 'i2',
    });
    expect(statusColumns({ status: 'wont_fix', reason: '  by design ' })).toMatchObject({ wontFixReason: 'by design' });
    expect(statusColumns({ status: 'wont_fix', reason: '   ' })).toMatchObject({ wontFixReason: null });
    expect(statusColumns({ status: 'open', fixedInId: 'v1', reason: 'x' })).toEqual({
      status: 'open',
      fixedInId: null,
      duplicateOfId: null,
      wontFixReason: null,
    });
  });
});

describe('rights and visibility', () => {
  const issue = { reporterId: 'rae', status: 'open' as const, hiddenAt: null };
  const viewer = (userId: string | null) => ({ userId, buildOwnerId: 'creator' });

  it('lets a signed-out viewer do nothing', () => {
    expect(Object.values(issueRights(issue, viewer(null))).every((v) => v === false)).toBe(true);
  });

  it('gives the reporter edit and close while open, never a vote or a report on their own issue', () => {
    const r = issueRights(issue, viewer('rae'));
    expect(r).toMatchObject({
      canEdit: true,
      canClose: true,
      canVote: false,
      canReport: false,
      canSetStatus: false,
      canHide: false,
    });
    expect(issueRights({ ...issue, status: 'confirmed' }, viewer('rae'))).toMatchObject({
      canEdit: false,
      canClose: false,
    });
  });

  it('gives the creator status and hide, and no say once the reporter closed it', () => {
    expect(issueRights(issue, viewer('creator'))).toMatchObject({ canSetStatus: true, canHide: true, canEdit: false });
    expect(issueRights({ ...issue, status: 'closed' }, viewer('creator')).canSetStatus).toBe(false);
  });

  it('lets other members add "me too" only while the issue is open or confirmed', () => {
    for (const status of ISSUE_STATUSES) {
      expect(issueRights({ ...issue, status }, viewer('sam')).canVote, status).toBe(
        status === 'open' || status === 'confirmed',
      );
    }
  });

  it('shows a hidden issue to the creator and the reporter only', () => {
    const hidden = { reporterId: 'rae', hiddenAt: new Date() };
    expect(issueVisibleTo(hidden, viewer('creator'))).toBe(true);
    expect(issueVisibleTo(hidden, viewer('rae'))).toBe(true);
    expect(issueVisibleTo(hidden, viewer('sam'))).toBe(false);
    expect(issueVisibleTo(hidden, viewer(null))).toBe(false);
    expect(issueVisibleTo({ reporterId: 'rae', hiddenAt: null }, viewer(null))).toBe(true);
  });

  it('reads the issues of a public or unlisted build, and of a private build only for its creator', () => {
    expect(issuesReadable('PUBLIC')).toBe(true);
    expect(issuesReadable('UNLISTED')).toBe(true);
    expect(issuesReadable('PRIVATE')).toBe(false);
    expect(issuesReadable('PRIVATE', true)).toBe(true);
    expect(issuesReadable('', true)).toBe(false);
    expect(issuesReadable('')).toBe(false);
  });

  it('exposes the filters and the reporter rules as plain functions', () => {
    expect(statusFilter('all')).toBeNull();
    expect(statusFilter('wont_fix')).toBe('wont_fix');
    expect(canReporterClose('open')).toBe(true);
    expect(canReporterClose('fixed')).toBe(false);
    expect(canReporterEdit('closed')).toBe(false);
  });
});
