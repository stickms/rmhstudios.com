/**
 * JobsTable — real <table> for the Jobs route.
 *
 * Columns: Title (+company), Location, Program, Posted, Deadline,
 *          Verification badge, Relevance (RungMeter sm), Actions.
 *
 * Row click opens the detail drawer. All rows animate with rl-settle
 * on mount. Action buttons call the parent's onAction handler.
 */

import { Bookmark, CheckCircle, EyeOff } from 'lucide-react';
import type { JobRow } from '@/lib/rmhladder/server/queries';
import type { JobActionValue } from '@/lib/rmhladder/server/actions';
import { RungMeter } from './RungMeter';

const PROGRAM_LABELS: Record<string, string> = {
  internship:             'Internship',
  summer_analyst:         'Summer Analyst',
  summer_associate:       'Summer Associate',
  analyst_program:        'Analyst Program',
  rotational_program:     'Rotational',
  new_grad:               'New Grad',
  leadership_development: 'LDP',
  entry_level:            'Entry Level',
  mba:                    'MBA',
  other:                  'Other',
};

interface VerBadgeProps {
  status: string | null | undefined;
  includeNonUS: boolean;
}

function VerBadge({ status, includeNonUS }: VerBadgeProps) {
  let cls = 'rl-badge--other';
  let label = 'unknown';

  if (status === 'verified_active') {
    cls = 'rl-badge--active';
    label = 'Verified active';
  } else if (status === 'verified_probable') {
    cls = 'rl-badge--probable';
    label = 'Verified probable';
  } else if (status === 'non_us_role' && includeNonUS) {
    cls = 'rl-badge--non-us';
    label = 'Non-US role';
  }

  return <span className={`rl-badge ${cls}`} title={label} aria-label={label} />;
}

function fmtDate(d: Date | string | null | undefined, mono = false) {
  if (!d) return <span className={mono ? 'rl-mono' : undefined}>—</span>;
  const date = new Date(d as string);
  const str = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return mono ? <span className="rl-mono">{str}</span> : <span>{str}</span>;
}

interface DeadlineProps {
  date: Date | string | null | undefined;
}

function Deadline({ date }: DeadlineProps) {
  if (!date) return <span className="rl-mono">—</span>;
  const d = new Date(date as string);
  const msLeft = d.getTime() - Date.now();
  const daysLeft = msLeft / 86_400_000;
  const isExpiring = daysLeft >= 0 && daysLeft <= 14;
  const str = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <span className={`rl-mono${isExpiring ? ' rl-expiring' : ''}`}>
      {isExpiring ? '⚑ ' : ''}{str}
    </span>
  );
}

interface ActionCellProps {
  jobId: string;
  userAction: string | null;
  onAction: (jobId: string, action: JobActionValue) => Promise<void>;
}

function ActionCell({ jobId, userAction, onAction }: ActionCellProps) {
  function handleClick(action: JobActionValue, e: React.MouseEvent) {
    e.stopPropagation(); // Don't open drawer
    const next: JobActionValue = userAction === action ? null : action;
    void onAction(jobId, next);
  }

  return (
    <div className="rl-actions" role="group" aria-label="Job actions">
      <button
        type="button"
        className={`rl-action-btn ${userAction === 'saved' ? 'rl-action-btn--saved' : ''}`}
        aria-label={userAction === 'saved' ? 'Unsave job' : 'Save job'}
        aria-pressed={userAction === 'saved'}
        onClick={(e) => handleClick('saved', e)}
      >
        <Bookmark size={14} />
      </button>
      <button
        type="button"
        className={`rl-action-btn ${userAction === 'applied' ? 'rl-action-btn--applied' : ''}`}
        aria-label={userAction === 'applied' ? 'Unapply job' : 'Mark as applied'}
        aria-pressed={userAction === 'applied'}
        onClick={(e) => handleClick('applied', e)}
      >
        <CheckCircle size={14} />
      </button>
      <button
        type="button"
        className={`rl-action-btn ${userAction === 'ignored' ? 'rl-action-btn--ignored' : ''}`}
        aria-label={userAction === 'ignored' ? 'Unignore job' : 'Ignore job'}
        aria-pressed={userAction === 'ignored'}
        onClick={(e) => handleClick('ignored', e)}
      >
        <EyeOff size={14} />
      </button>
    </div>
  );
}

interface JobsTableProps {
  rows: JobRow[];
  includeNonUS: boolean;
  onRowClick: (row: JobRow) => void;
  onAction: (jobId: string, action: JobActionValue) => Promise<void>;
}

export function JobsTable({ rows, includeNonUS, onRowClick, onAction }: JobsTableProps) {
  return (
    <table className="rl-jobs-table" aria-label="Job postings">
      <thead>
        <tr>
          <th scope="col">Title / Company</th>
          <th scope="col">Location</th>
          <th scope="col">Program</th>
          <th scope="col">Posted</th>
          <th scope="col">Deadline</th>
          <th scope="col">Verified</th>
          <th scope="col">Relevance</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = row.id as string;
          const title = row.title as string;
          const city = row.city as string | null;
          const state = row.state as string | null;
          const programType = row.programType as string;
          const latestVer = row.latestVerification as { status: string; evidence: string; checkedAt: Date | string } | null;
          const company = row.company as { name: string } | null;
          const locationParts = [city, state].filter(Boolean);
          const location = locationParts.length ? locationParts.join(', ') : '—';

          return (
            <tr
              key={id}
              className="rl-jobs-table__row"
              tabIndex={0}
              aria-label={`${title} at ${company?.name ?? 'Unknown'}`}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
            >
              {/* Title + Company */}
              <td>
                <div className="rl-jobs-table__title">{title}</div>
                {company?.name && (
                  <div className="rl-jobs-table__company">{company.name}</div>
                )}
              </td>

              {/* Location */}
              <td>{location}</td>

              {/* Program */}
              <td>
                <span className="rl-program-chip">
                  {PROGRAM_LABELS[programType] ?? programType}
                </span>
              </td>

              {/* Posted */}
              <td>
                {fmtDate(row.postingDate as Date | string | null | undefined)}
              </td>

              {/* Deadline */}
              <td>
                <Deadline date={row.applicationDeadline as Date | string | null | undefined} />
              </td>

              {/* Verification badge */}
              <td>
                <VerBadge
                  status={latestVer?.status}
                  includeNonUS={includeNonUS}
                />
              </td>

              {/* Relevance */}
              <td>
                <div className="rl-relevance-row">
                  <RungMeter score={row.finalRelevance} size="sm" />
                  <span className="rl-mono">{row.finalRelevance}</span>
                </div>
              </td>

              {/* Actions */}
              <td onClick={(e) => e.stopPropagation()}>
                <ActionCell
                  jobId={id}
                  userAction={row.userAction}
                  onAction={onAction}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
