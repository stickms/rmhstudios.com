/**
 * JobDrawer — right-side detail drawer (480px).
 *
 * Opens when a job row is clicked. Esc and outside-click close it.
 * Focus is trapped while open; on close, focus returns to the trigger.
 *
 * Layout:
 *   Header  — eyebrow (VERIFIED · PLATFORM · <ago>), display title, company + location
 *   Body    — RungMeter lg, evidence sentence, description summary, alternate URLs
 *   Footer  — Open original, Apply link (when canonicalApplyUrl differs), Save/Apply/Ignore
 */

import { useEffect, useRef } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { Bookmark, CheckCircle, EyeOff } from 'lucide-react';
import type { JobRow } from '@/lib/rmhladder/server/queries';
import type { JobActionValue } from '@/lib/rmhladder/server/actions';
import { RungMeter } from './RungMeter';
import { timeAgo } from './time';

const FOCUSABLE_SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SEL));
}

interface JobDrawerProps {
  job: JobRow | null;
  onClose: () => void;
  onAction: (jobId: string, action: JobActionValue) => Promise<void>;
}

export function JobDrawer({ job, onClose, onAction }: JobDrawerProps) {
  const open = job !== null;
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Capture focus to return to on open/close transition
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement;
    } else {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      // Defer slightly so the row is re-visible before focus
      if (target) requestAnimationFrame(() => target.focus());
    }
  }, [open]);

  // Initial focus: only on false→true transition
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    if (wasOpenRef.current) return; // Not a false→true transition

    const container = drawerRef.current;
    const focusables = getFocusables(container);
    if (focusables.length) focusables[0].focus();
  }, [open]);

  // Tab cycling and Esc close
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const container = drawerRef.current;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = getFocusables(container);
      if (!els.length) return;
      const first = els[0];
      const last  = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Track open state for transition detection
  useEffect(() => {
    wasOpenRef.current = open;
  }, [open]);

  // Outside-click close (delayed to avoid closing from the same click that opened)
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, onClose]);

  if (!open || !job) return null;

  // Extract typed fields
  const id          = job.id as string;
  const title       = job.title as string;
  const city        = job.city as string | null;
  const state       = job.state as string | null;
  const company     = job.company as { name: string } | null;
  const platform    = job.sourcePlatform as string;
  const origUrl     = job.originalPostingUrl as string;
  const applyUrl    = job.canonicalApplyUrl as string | null;
  const summary     = job.descriptionSummary as string | null;
  const altUrls     = job.alternateUrls as string[];
  const userAction  = job.userAction as string | null;
  const relevance   = job.finalRelevance as number;

  const latestVer   = job.latestVerification as {
    status: string;
    evidence: string;
    checkedAt: Date | string;
    confidence: number;
  } | null;

  const locationParts = [city, state].filter(Boolean);
  const location = locationParts.length ? locationParts.join(', ') : null;

  const eyebrow = [
    latestVer ? 'Verified' : 'Unverified',
    platform.toUpperCase(),
    latestVer ? timeAgo(latestVer.checkedAt) : null,
  ].filter(Boolean).join(' · ');

  function handleAction(action: JobActionValue) {
    const next: JobActionValue = userAction === action ? null : action;
    void onAction(id, next);
  }

  const showApplyLink = applyUrl && applyUrl !== origUrl;

  return (
    <>
      {/* Overlay */}
      <div className="rl-drawer-overlay" aria-hidden="true" />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="rl-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Job detail: ${title}`}
      >
        {/* Header */}
        <div className="rl-drawer__header">
          <p className="rl-eyebrow">{eyebrow}</p>
          <h2 className="rl-drawer__title">{title}</h2>
          {(company?.name || location) && (
            <p className="rl-drawer__subtitle">
              {[company?.name, location].filter(Boolean).join(' · ')}
            </p>
          )}

          <button
            type="button"
            className="rl-drawer__close"
            aria-label="Close job detail"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="rl-drawer__body">
          {/* Relevance */}
          <div className="rl-relevance-row">
            <RungMeter score={relevance} size="lg" />
            <span className="rl-mono">{relevance}</span>
          </div>

          {/* Verification evidence */}
          {latestVer?.evidence && (
            <div className="rl-drawer__section">
              <p className="rl-drawer__section-label">Verification evidence</p>
              <p className="rl-drawer__evidence">{latestVer.evidence}</p>
            </div>
          )}

          {/* Description summary */}
          {summary && (
            <div className="rl-drawer__section">
              <p className="rl-drawer__section-label">Summary</p>
              <p className="rl-drawer__description">{summary}</p>
            </div>
          )}

          {/* Alternate URLs */}
          {altUrls.length > 0 && (
            <div className="rl-drawer__section">
              <p className="rl-drawer__section-label">Alternate URLs</p>
              <ul className="rl-drawer__alt-list">
                {altUrls.map((url) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rl-drawer__footer">
          <div className="rl-drawer__links">
            <a
              href={origUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rl-drawer__primary-link"
            >
              Open original posting <ExternalLink size={12} />
            </a>

            {showApplyLink && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rl-drawer__apply-link"
              >
                Apply <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Save / Apply / Ignore */}
          <div className="rl-drawer__actions" role="group" aria-label="Job actions">
            <button
              type="button"
              className={`rl-drawer__action-btn ${userAction === 'saved' ? 'rl-drawer__action-btn--saved' : ''}`}
              aria-pressed={userAction === 'saved'}
              aria-label={userAction === 'saved' ? 'Unsave job' : 'Save job'}
              onClick={() => handleAction('saved')}
            >
              <Bookmark size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Save
            </button>

            <button
              type="button"
              className={`rl-drawer__action-btn ${userAction === 'applied' ? 'rl-drawer__action-btn--applied' : ''}`}
              aria-pressed={userAction === 'applied'}
              aria-label={userAction === 'applied' ? 'Unapply job' : 'Mark as applied'}
              onClick={() => handleAction('applied')}
            >
              <CheckCircle size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Apply
            </button>

            <button
              type="button"
              className={`rl-drawer__action-btn ${userAction === 'ignored' ? 'rl-drawer__action-btn--ignored' : ''}`}
              aria-pressed={userAction === 'ignored'}
              aria-label={userAction === 'ignored' ? 'Unignore job' : 'Ignore job'}
              onClick={() => handleAction('ignored')}
            >
              <EyeOff size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Ignore
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
