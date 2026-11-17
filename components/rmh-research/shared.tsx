/**
 * RMH Research — shared primitives for the microsite (rmh-research.css).
 *
 * The site's chrome (the top bar and the footer), the page head, and the small
 * typed pieces every page draws the catalogue with: `PaperRow`, `AuthorNames`,
 * `FieldChip`, `Stat`, `Crumbs`. The pinned-scene markup is the shared
 * `components/shared/scroll-scene.tsx`, re-exported here.
 *
 * There is no script in this file beyond `useVerticalNav` (the mobile menu):
 * all motion is CSS on scroll timelines.
 */
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVerticalNav } from '@/hooks/useVerticalNav';
import { authorsOf, resonanceOf } from '@/lib/rmh-research/catalog';
import { getField } from '@/lib/rmh-research/fields';
import type { Author, FieldId, Paper } from '@/lib/rmh-research/types';
import { useFieldLabels } from './labels';

export { cssVars, Scene, SceneDots, sceneGeometry, Step, stepWindow } from '@/components/shared/scroll-scene';
export { useFieldLabels };

export const BASE = '/rmh-research';

/* ── marks and icons ─────────────────────────────────────────────────────── */

/** Three nested arcs around a point: a result, and the work that built on it. Flat, in the current ink. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <path d="M12 6.6a5.4 5.4 0 0 1 5.4 5.4" />
      <path d="M12 17.4A5.4 5.4 0 0 1 6.6 12" />
      <path d="M12 2.8A9.2 9.2 0 0 1 21.2 12" />
      <path d="M12 21.2A9.2 9.2 0 0 1 2.8 12" />
    </svg>
  );
}

/** An arrow that flips in RTL (the CSS mirrors `.arw`). */
export function Arrow() {
  return <ArrowRight className="arw" aria-hidden="true" strokeWidth={1.8} />;
}

/** Locale-aware whole-number formatting. */
export function useNumber(): (n: number) => string {
  const { i18n } = useTranslation('c-rmh-research');
  return (n) => n.toLocaleString(i18n.language);
}

/* ── catalogue pieces ────────────────────────────────────────────────────── */

/** A field's mono code, linked to the field page unless `plain`. */
export function FieldChip({ field, plain = false }: { field: FieldId; plain?: boolean }) {
  const labels = useFieldLabels();
  const code = getField(field).code;
  if (plain) {
    return (
      <span className="chip" title={labels.name(field)}>
        {code}
      </span>
    );
  }
  return (
    <Link className="chip" to="/rmh-research/fields/$fieldId" params={{ fieldId: field }} title={labels.name(field)}>
      {code}
    </Link>
  );
}

/** A byline: each named author linked to their page, or the institutional byline. */
export function AuthorNames({ paper, authors, link = true }: { paper: Paper; authors?: readonly Author[]; link?: boolean }) {
  const list = authors ?? authorsOf(paper);
  if (list.length === 0) return <>{paper.byline ?? 'RMH Research'}</>;
  return (
    <>
      {list.map((a, i) => (
        <span key={a.id}>
          {link ? (
            <Link to="/rmh-research/authors/$authorId" params={{ authorId: a.id }}>
              {a.name}
            </Link>
          ) : (
            a.name
          )}
          {i < list.length - 1 ? ', ' : null}
        </span>
      ))}
    </>
  );
}

/** The link to a paper: its archive page, or the full page of a report. */
export function PaperLink({ paper, className, children }: { paper: Paper; className?: string; children: ReactNode }) {
  if (paper.kind === 'report' && paper.href) {
    return (
      <a className={className} href={paper.href}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to="/rmh-research/paper/$paperId" params={{ paperId: paper.id }}>
      {children}
    </Link>
  );
}

/**
 * One archive entry, the way a scholar index lists it: title, byline, an
 * optional two-line abstract, then field · venue · year · cited by · resonance.
 * Render inside a `.rows` list (or any container; it draws its own rule).
 */
export function PaperRow({
  paper,
  abstract = false,
  field = true,
  as: Tag = 'li',
}: {
  paper: Paper;
  abstract?: boolean;
  field?: boolean;
  as?: 'li' | 'div' | 'article';
}) {
  const { t } = useTranslation('c-rmh-research');
  const n = useNumber();
  const res = resonanceOf(paper.id);
  return (
    <Tag className="paper-row">
      <h3 className="paper-row-title">
        <PaperLink paper={paper}>{paper.title}</PaperLink>
      </h3>
      <p className="paper-row-by">
        <AuthorNames paper={paper} />
      </p>
      {abstract ? <p className="paper-row-abs">{paper.abstract}</p> : null}
      <p className="paper-row-meta meta">
        {field ? <FieldChip field={paper.field} /> : null}
        {paper.kind === 'report' ? <span className="chip">{t('kind-report', { defaultValue: 'Report' })}</span> : null}
        <span>{paper.venue}</span>
        <span className="num">{paper.year}</span>
        <Link to="/rmh-research/paper/$paperId" params={{ paperId: paper.id }} hash="cited-by">
          {t('cited-by-count', { defaultValue: 'Cited by {{count}}', count: res.raw, formatted: n(res.raw) })}
        </Link>
        <span>
          {t('resonance-label', { defaultValue: 'Resonance' })} <b className="num">{n(res.score)}</b>
        </span>
      </p>
    </Tag>
  );
}

/** A big mono figure over its label. Put several in a `.stats` grid. */
export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-v">{value}</span>
      <span className="stat-k">{label}</span>
    </div>
  );
}

/* ── page structure ──────────────────────────────────────────────────────── */

export interface Crumb {
  label: string;
  /** Omit for the current page. */
  to?: string;
}

export function Crumbs({ items }: { items: readonly Crumb[] }) {
  const { t } = useTranslation('c-rmh-research');
  return (
    <nav className="crumbs" aria-label={t('breadcrumb-label', { defaultValue: 'Breadcrumb' })}>
      <Link to="/rmh-research" activeOptions={{ exact: true }}>
        RMH Research
      </Link>
      {items.map((c) => (
        <span key={c.label} style={{ display: 'contents' }}>
          <span aria-hidden="true">/</span>
          {c.to ? <a href={c.to}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** The head of an interior page: breadcrumb, one `h1`, a lede, then `children` (actions or figures). */
export function PageHead({
  crumbs,
  title,
  lede,
  children,
}: {
  crumbs: readonly Crumb[];
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="pagehead">
      <div className="wrap">
        <Crumbs items={crumbs} />
        <h1 className="h1">{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
        {children}
      </div>
    </header>
  );
}

/** A section header: a `.label`, an `h2`, an optional lede, and an optional action on the right. */
export function SecHead({ label, title, lede, action }: { label?: ReactNode; title: ReactNode; lede?: ReactNode; action?: ReactNode }) {
  return (
    <header className="sechead">
      {label ? <span className="label">{label}</span> : null}
      <div className="sechead-row">
        <h2 className="h2">{title}</h2>
        {action}
      </div>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}

/* ── the site's chrome ───────────────────────────────────────────────────── */

export function TopBar() {
  const { t } = useTranslation('c-rmh-research');
  const NAV = [
    { to: '/rmh-research/fields', label: t('nav-fields', { defaultValue: 'Fields' }) },
    { to: '/rmh-research/archive', label: t('nav-archive', { defaultValue: 'Archive' }) },
    { to: '/rmh-research/authors', label: t('nav-authors', { defaultValue: 'Authors' }) },
    { to: '/rmh-research/r-index', label: t('nav-r-index', { defaultValue: 'The r-index' }) },
  ] as const;
  const { toggleMenu, closeMenu, current } = useVerticalNav({ rootClass: 'rmhr-root', barClass: 'topbar' });

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <a className="backlink" href="/" aria-label={t('back-to-rmh-studios', { defaultValue: 'Back to RMH Studios' })}>
            <span aria-hidden="true">←</span>
            <span className="backlink-label">RMH Studios</span>
          </a>
          <Link className="brand" to="/rmh-research" activeOptions={{ exact: true }} aria-label={t('home-label', { defaultValue: 'RMH Research home' })}>
            <BrandMark />
            <span className="brand-text">RMH&nbsp;Research</span>
          </Link>
        </div>
        <nav className="navlinks" aria-label={t('nav-primary-label', { defaultValue: 'Primary' })}>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} aria-current={current(item.to)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <button
            className="nav-toggle"
            aria-label={t('open-menu', { defaultValue: 'Open menu' })}
            aria-expanded="false"
            aria-controls="rmhr-menu"
            onClick={toggleMenu}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="8" x2="20" y2="8" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="16" x2="20" y2="16" />
            </svg>
          </button>
        </div>
      </div>
      <nav className="mobile-menu" id="rmhr-menu" aria-label={t('nav-mobile-label', { defaultValue: 'Mobile' })}>
        {NAV.map((item) => (
          <Link key={item.to} to={item.to} aria-current={current(item.to)} onClick={closeMenu}>
            {item.label}
          </Link>
        ))}
        <Link to="/rmh-research/psychology" aria-current={current('/rmh-research/psychology')} onClick={closeMenu}>
          {t('nav-psychology', { defaultValue: 'Psychology' })}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useTranslation('c-rmh-research');
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="brand" to="/rmh-research" activeOptions={{ exact: true }} aria-label={t('home-label', { defaultValue: 'RMH Research home' })}>
              <BrandMark />
              <span className="brand-text">RMH&nbsp;Research</span>
            </Link>
            <p>{t('footer-tagline', { defaultValue: 'The research institute of RMH Studios. Twelve fields, one archive, and one number for how far a result travelled.' })}</p>
          </div>
          <div className="footer-col">
            <h4>{t('footer-research-heading', { defaultValue: 'Research' })}</h4>
            <Link to="/rmh-research/fields">{t('nav-fields', { defaultValue: 'Fields' })}</Link>
            <Link to="/rmh-research/archive">{t('nav-archive', { defaultValue: 'Archive' })}</Link>
            <Link to="/rmh-research/authors">{t('nav-authors', { defaultValue: 'Authors' })}</Link>
            <Link to="/rmh-research/r-index">{t('nav-r-index', { defaultValue: 'The r-index' })}</Link>
          </div>
          <div className="footer-col">
            <h4>{t('footer-reports-heading', { defaultValue: 'Sections and reports' })}</h4>
            <Link to="/rmh-research/psychology">{t('nav-psychology', { defaultValue: 'Psychology' })}</Link>
            <a href="/rmh-research/reports/optimization">{t('footer-report-optimization', { defaultValue: 'Speed & Optimization' })}</a>
            <a href="/rmh-research/reports/feature-leak">{t('footer-report-feature-leak', { defaultValue: 'Feature Leak' })}</a>
          </div>
          <div className="footer-col">
            <h4>{t('footer-arms-heading', { defaultValue: 'Sister arms' })}</h4>
            <a href="/adaptive-intelligence">Adaptive Intelligence</a>
            <a href="/deeplink">RMH Deeplink</a>
            <a href="/ventures">{t('footer-all-ventures', { defaultValue: 'All RMH ventures' })}</a>
          </div>
        </div>

        <p className="notice">
          {t('footer-fiction-notice', {
            defaultValue:
              'RMH Research is part of the RMH Studios universe. The papers, authors, labs, journals and figures in this archive are illustrative fiction; no real person is named, and nothing here is scientific, medical or financial advice. The Psychology section is the exception: it credits real, published research and the people who did it.',
          })}
        </p>

        <div className="footer-bottom">
          <span className="meta">{t('footer-copyright', { defaultValue: '© 2026 RMH Research · An RMH Studios institute' })}</span>
          <a className="meta" href="/">
            rmhstudios.com
          </a>
        </div>
      </div>
    </footer>
  );
}
