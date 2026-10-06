'use client';

/**
 * The watch list: every title, what's in the plan, what's been watched, and
 * the order it'll be watched in. Also where runtimes get corrected and the
 * viewer's own extras get added.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Minus,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AeroWindow } from './AeroWindow';
import { formatMinutes } from '@/lib/dunesday/schedule';
import {
  isIncluded,
  isWatched,
  orderedTitles,
  runtimeOf,
  type DunesdayState,
} from '@/lib/dunesday/state';
import type { WatchTitle } from '@/lib/dunesday/titles';
import { DURATION, EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { bubbleBurst } from './fx';
import { Segmented } from './Segmented';
import { sfx } from './sound';
import { Win7Progress } from './Win7Progress';
import type { DunesdayActions } from './useDunesdayState';

type KindFilter = 'all' | 'film' | 'series';

function useGroupName() {
  const { t } = useTranslation('c-dunesday');
  return (title: WatchTitle) => {
    if (title.franchise === 'dune') return t('group-dune', { defaultValue: 'Dune' });
    if (title.franchise === 'extra') return t('group-extra', { defaultValue: 'Your extras' });
    return t('group-phase', { defaultValue: 'MCU Phase {{n}}', n: title.phase });
  };
}

export function Watchlist({ state, actions }: { state: DunesdayState; actions: DunesdayActions }) {
  const { t } = useTranslation('c-dunesday');
  const groupName = useGroupName();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [hideWatched, setHideWatched] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const ordered = useMemo(() => orderedTitles(state), [state]);
  const filtered = ordered.filter((title) => {
    if (query && !title.title.toLowerCase().includes(query.toLowerCase())) return false;
    if (kind === 'film' && title.kind === 'series') return false;
    if (kind === 'series' && title.kind !== 'series') return false;
    if (hideWatched && isWatched(state, title)) return false;
    return true;
  });

  const grouped = state.order === 'release';
  const groups = useMemo(() => {
    const out: { key: string; name: string; titles: WatchTitle[] }[] = [];
    if (!grouped) return [{ key: 'all', name: '', titles: filtered }];
    for (const title of filtered) {
      const name = groupName(title);
      const last = out[out.length - 1];
      if (last && last.name === name) last.titles.push(title);
      else out.push({ key: `${name}-${out.length}`, name, titles: [title] });
    }
    return out;
  }, [filtered, grouped, groupName]);

  const positions = new Map(ordered.map((title, i) => [title.id, i]));

  return (
    <AeroWindow title={t('list-title', { defaultValue: 'Watch list' })}>
      <div className="ds-stack" style={{ gap: 12 }}>
        <div className="ds-row">
          <span className="ds-label">{t('order-label', { defaultValue: 'Order' })}</span>
          <Segmented
            label={t('order-label', { defaultValue: 'Order' })}
            value={state.order}
            onChange={actions.setOrder}
            options={[
              { value: 'release', label: t('order-release', { defaultValue: 'Release' }) },
              { value: 'story', label: t('order-story', { defaultValue: 'Story (timeline)' }) },
              { value: 'custom', label: t('order-custom', { defaultValue: 'My order' }) },
            ]}
          />
        </div>
        {state.order !== 'custom' && (
          <div className="ds-row">
            <span className="ds-label">{t('dune-label', { defaultValue: 'Dune goes' })}</span>
            <Segmented
              label={t('dune-label', { defaultValue: 'Dune goes' })}
              value={state.dunePlacement}
              onChange={(v) => actions.set('dunePlacement', v)}
              options={[
                { value: 'end', label: t('dune-end', { defaultValue: 'Last (freshest)' }) },
                { value: 'start', label: t('dune-start', { defaultValue: 'First' }) },
                { value: 'mixed', label: t('dune-mixed', { defaultValue: 'By date' }) },
              ]}
            />
          </div>
        )}

        <div className="ds-toolbar">
          <label className="ds-row ds-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="ds-input"
              style={{ flex: 1 }}
              placeholder={t('search', { defaultValue: 'Search titles…' })}
              aria-label={t('search', { defaultValue: 'Search titles…' })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Segmented
            label={t('kind-label', { defaultValue: 'Show' })}
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: t('kind-all', { defaultValue: 'All' }) },
              { value: 'film', label: t('kind-film', { defaultValue: 'Films' }) },
              { value: 'series', label: t('kind-series', { defaultValue: 'Series' }) },
            ]}
          />
          <label className="ds-check">
            <input
              type="checkbox"
              checked={hideWatched}
              onChange={(e) => setHideWatched(e.target.checked)}
            />
            {t('hide-watched', { defaultValue: 'Hide watched' })}
          </label>
        </div>
      </div>

      {groups.map((group) => {
        const open = !collapsed[group.key];
        const inPlan = group.titles.filter((x) => isIncluded(state, x));
        const seen = inPlan.filter((x) => isWatched(state, x)).length;
        return (
          <div key={group.key} className="ds-group">
            {grouped && (
              <button
                type="button"
                className="ds-group-head"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => ({ ...c, [group.key]: open }))}
              >
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  style={{
                    transform: open ? 'none' : 'rotate(-90deg)',
                    transition: 'transform 0.15s ease',
                  }}
                />
                {group.name}
                <span className="ds-hint">
                  {seen}/{inPlan.length}
                </span>
                <Win7Progress
                  className="ds-group-progress"
                  value={inPlan.length ? seen / inPlan.length : 0}
                  shine={false}
                />
              </button>
            )}
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: DURATION.slow, ease: EASE.standard }}
                  style={{ overflow: 'hidden' }}
                >
                  {grouped && group.titles.length > 1 && (
                    <div className="ds-row" style={{ margin: '8px 0 2px' }}>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--sm"
                        onClick={() =>
                          actions.setIncludedMany(
                            group.titles.map((x) => x.id),
                            true,
                          )
                        }
                      >
                        {t('group-all-in', { defaultValue: 'Include all' })}
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--sm"
                        onClick={() =>
                          actions.setIncludedMany(
                            group.titles.map((x) => x.id),
                            false,
                          )
                        }
                      >
                        {t('group-all-out', { defaultValue: 'Skip all' })}
                      </button>
                      <button
                        type="button"
                        className="ds-btn ds-btn--ghost ds-btn--sm"
                        onClick={() => actions.markWatchedMany(inPlan.map((x) => x.id))}
                      >
                        {t('group-all-seen', { defaultValue: 'Mark all watched' })}
                      </button>
                    </div>
                  )}
                  {group.titles.map((title) => (
                    <TitleRow
                      key={title.id}
                      title={title}
                      state={state}
                      actions={actions}
                      index={grouped ? null : (positions.get(title.id) ?? 0) + 1}
                      movable={state.order === 'custom'}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {!filtered.length && (
        <p className="ds-muted">{t('no-match', { defaultValue: 'No titles match.' })}</p>
      )}

      <AddCustom actions={actions} />
    </AeroWindow>
  );
}

function TitleRow({
  title,
  state,
  actions,
  index,
  movable,
}: {
  title: WatchTitle;
  state: DunesdayState;
  actions: DunesdayActions;
  index: number | null;
  movable: boolean;
}) {
  const { t } = useTranslation('c-dunesday');
  const [editing, setEditing] = useState(false);
  const included = isIncluded(state, title);
  const watched = isWatched(state, title);
  const runtime = runtimeOf(state, title);
  const overridden = state.runtimeOverrides[title.id] !== undefined;
  const eps = state.episodesWatched[title.id] ?? 0;
  const year = title.released.startsWith('9999') ? null : title.released.slice(0, 4);

  return (
    <div
      className={cn(
        'ds-card ds-title-row',
        !included && 'ds-title-row--off',
        watched && 'ds-title-row--seen',
      )}
    >
      <button
        type="button"
        className="ds-watch-orb"
        aria-pressed={watched}
        aria-label={
          watched
            ? t('unmark', { defaultValue: 'Mark {{title}} as not watched', title: title.title })
            : t('mark', { defaultValue: 'Mark {{title}} as watched', title: title.title })
        }
        data-sfx="custom"
        onClick={(e) => {
          if (watched) sfx.undo();
          else {
            sfx.chime();
            const r = e.currentTarget.getBoundingClientRect();
            void bubbleBurst(r.left + r.width / 2, r.top + r.height / 2);
          }
          actions.toggleWatched(title.id);
        }}
      >
        <Check size={18} aria-hidden="true" />
      </button>

      <div style={{ minWidth: 0 }}>
        <div className="ds-title-name">
          {index !== null && <span className="ds-faint">{index}. </span>}
          {title.title}
          {title.essential && (
            <Star
              size={14}
              aria-label={t('essential', { defaultValue: 'Essential' })}
              style={{ marginLeft: 6, verticalAlign: '-1px', color: '#e8a317', fill: '#ffd25e' }}
            />
          )}
        </div>
        {title.hook && <div className="ds-title-hook">{title.hook}</div>}
        <div className="ds-title-meta">
          {year && <span>{year}</span>}
          {editing ? (
            <form
              className="ds-row"
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
              }}
            >
              <input
                type="number"
                className="ds-input ds-input--num"
                min={1}
                max={6000}
                defaultValue={runtime}
                aria-label={t('runtime-edit', {
                  defaultValue: 'Runtime in minutes for {{title}}',
                  title: title.title,
                })}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  actions.setRuntime(title.id, v === title.minutes ? null : v);
                  setEditing(false);
                }}
                autoFocus
              />
              <span>{t('unit-min', { defaultValue: 'min' })}</span>
            </form>
          ) : (
            <button
              type="button"
              className="ds-mini-btn ds-pill-btn"
              onClick={() => setEditing(true)}
              aria-label={t('runtime-edit-open', {
                defaultValue: 'Edit runtime for {{title}} ({{time}})',
                title: title.title,
                time: formatMinutes(runtime),
              })}
            >
              {title.approx && !overridden ? '≈ ' : ''}
              {formatMinutes(runtime)} <Pencil size={10} aria-hidden="true" />
            </button>
          )}
          {overridden && (
            <button
              type="button"
              className="ds-mini-btn ds-pill-btn"
              onClick={() => actions.setRuntime(title.id, null)}
            >
              {t('runtime-reset', { defaultValue: 'reset' })}
            </button>
          )}
          {title.kind === 'series' && title.episodes && (
            <span className="ds-row" style={{ gap: 4 }}>
              <button
                type="button"
                className="ds-mini-btn"
                disabled={eps <= 0 && !watched}
                onClick={() =>
                  actions.setEpisodes(
                    title.id,
                    (watched ? title.episodes! : eps) - 1,
                    title.episodes!,
                  )
                }
                aria-label={t('ep-less', { defaultValue: 'One fewer episode watched' })}
              >
                <Minus size={12} aria-hidden="true" />
              </button>
              <span>
                {t('ep-progress', {
                  defaultValue: 'Ep {{n}}/{{total}}',
                  n: watched ? title.episodes : eps,
                  total: title.episodes,
                })}
              </span>
              <button
                type="button"
                className="ds-mini-btn"
                disabled={watched}
                onClick={() => actions.setEpisodes(title.id, eps + 1, title.episodes!)}
                aria-label={t('ep-more', { defaultValue: 'One more episode watched' })}
              >
                <Plus size={12} aria-hidden="true" />
              </button>
            </span>
          )}
          {title.kind === 'special' && (
            <span>{t('kind-special', { defaultValue: 'Special' })}</span>
          )}
          {title.animated && <span>{t('animated', { defaultValue: 'Animated' })}</span>}
        </div>
      </div>

      <div className="ds-title-actions">
        {movable && (
          <>
            <button
              type="button"
              className="ds-mini-btn"
              onClick={() => actions.move(title.id, -1)}
              aria-label={t('move-up', {
                defaultValue: 'Move {{title}} earlier',
                title: title.title,
              })}
            >
              <ArrowUp size={12} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="ds-mini-btn"
              onClick={() => actions.move(title.id, 1)}
              aria-label={t('move-down', {
                defaultValue: 'Move {{title}} later',
                title: title.title,
              })}
            >
              <ArrowDown size={12} aria-hidden="true" />
            </button>
          </>
        )}
        {title.franchise === 'extra' && (
          <button
            type="button"
            className="ds-mini-btn"
            onClick={() => actions.removeCustom(title.id)}
            aria-label={t('remove-custom', {
              defaultValue: 'Remove {{title}}',
              title: title.title,
            })}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        )}
        <label className="ds-check" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={included}
            onChange={() => actions.toggleIncluded(title.id)}
          />
          <span className="ds-hint">{t('in-plan', { defaultValue: 'In plan' })}</span>
        </label>
      </div>
    </div>
  );
}

function AddCustom({ actions }: { actions: DunesdayActions }) {
  const { t } = useTranslation('c-dunesday');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [episodes, setEpisodes] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const m = Number(minutes);
    const ep = Number(episodes);
    if (!name.trim() || !(m > 0)) return;
    actions.addCustom({
      title: name.trim().slice(0, 80),
      minutes: Math.round(m),
      episodes: ep > 0 ? Math.round(ep) : undefined,
    });
    setName('');
    setMinutes('');
    setEpisodes('');
  };

  return (
    <form className="ds-card" style={{ marginTop: 18, padding: 14 }} onSubmit={submit}>
      <div className="ds-label" style={{ marginBottom: 8 }}>
        {t('custom-title', { defaultValue: 'Add your own title' })}
      </div>
      <p className="ds-hint" style={{ margin: '0 0 10px' }}>
        {t('custom-hint', {
          defaultValue:
            'Sony’s Spider-Man films, the Fox X-Men, Agents of S.H.I.E.L.D., the Netflix Defenders — anything you want in the run.',
        })}
      </p>
      <div className="ds-row">
        <input
          className="ds-input"
          style={{ flex: '1 1 200px' }}
          placeholder={t('custom-name', { defaultValue: 'Title' })}
          aria-label={t('custom-name', { defaultValue: 'Title' })}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          className="ds-input"
          style={{ width: 130 }}
          min={1}
          placeholder={t('custom-minutes', { defaultValue: 'Total minutes' })}
          aria-label={t('custom-minutes', { defaultValue: 'Total minutes' })}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
        <input
          type="number"
          className="ds-input"
          style={{ width: 130 }}
          min={0}
          placeholder={t('custom-episodes', { defaultValue: 'Episodes (opt.)' })}
          aria-label={t('custom-episodes', { defaultValue: 'Episodes (opt.)' })}
          value={episodes}
          onChange={(e) => setEpisodes(e.target.value)}
        />
        <button
          type="submit"
          className="ds-btn ds-btn--green ds-btn--sm"
          disabled={!name.trim() || !(Number(minutes) > 0)}
        >
          <Plus size={14} aria-hidden="true" />
          {t('custom-add', { defaultValue: 'Add' })}
        </button>
      </div>
    </form>
  );
}
