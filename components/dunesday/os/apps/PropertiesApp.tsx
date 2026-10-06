'use client';

/**
 * The Properties sheet, for either a title on the watch list (`params.title`)
 * or a file-system item (`params.node`).
 *
 * For a title it is where the details live that the planner needs from you:
 * in the plan or not, watched or not, how many episodes of a series you've
 * seen, and a corrected runtime if the estimate is off.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { isIncluded, isWatched, runtimeOf, titleById } from '@/lib/dunesday/state';
import { pathOf } from '@/lib/dunesday/vfs';
import { useDunesday } from '../../DunesdayProvider';
import { fmtDay, LONG } from '../../format';
import { sfx } from '../../sound';
import { openApp } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { iconFor, sizeLabel, typeLabel } from '../nodeIcon';
import { useOs } from '../store';
import { useEffect } from 'react';

export default function PropertiesApp({ win }: AppProps) {
  return win.params?.title ? <TitleProps win={win} /> : <NodeProps win={win} />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ds-props-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Foot({ id }: { id: string }) {
  const { t } = useTranslation('c-dunesday');
  const close = useOs((s) => s.close);
  return (
    <div className="ds-dialog-foot">
      <button type="button" className="ds-btn7" onClick={() => close(id)}>
        {t('ok', { defaultValue: 'OK' })}
      </button>
    </div>
  );
}

function TitleProps({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, actions } = useDunesday();
  const setTitle = useOs((s) => s.setTitle);
  const x = titleById(state, win.params?.title ?? '');
  const [runtime, setRuntime] = useState(() => (x ? String(runtimeOf(state, x)) : ''));

  useEffect(() => {
    if (x)
      setTitle(win.id, t('props-title', { defaultValue: '{{name}} Properties', name: x.title }));
  }, [x, setTitle, t, win.id]);

  if (!x)
    return (
      <p className="ds-props-missing">
        {t('props-missing', { defaultValue: 'This title no longer exists.' })}
      </p>
    );

  const watched = isWatched(state, x);
  const included = isIncluded(state, x);
  const eps = state.episodesWatched[x.id] ?? 0;
  const commitRuntime = () => {
    const n = Math.round(Number(runtime));
    if (!Number.isFinite(n) || n < 1 || n > 6000) return setRuntime(String(runtimeOf(state, x)));
    actions.setRuntime(x.id, n === x.minutes ? null : n);
  };

  return (
    <div className="ds-props">
      <div className="ds-props-head">
        <Icon name={watched ? 'film-watched' : x.kind === 'series' ? 'series' : 'film'} size={48} />
        <strong>{x.title}</strong>
      </div>
      <p className="ds-props-hook">{x.hook}</p>
      <dl>
        <Row label={t('props-type', { defaultValue: 'Type:' })}>
          {x.kind === 'series'
            ? t('props-series', { defaultValue: 'Series · {{n}} episodes', n: x.episodes ?? 0 })
            : x.kind === 'special'
              ? t('type-special', { defaultValue: 'Special' })
              : t('type-film', { defaultValue: 'Film' })}
          {x.animated ? ` · ${t('props-animated', { defaultValue: 'Animated' })}` : ''}
        </Row>
        <Row label={t('props-franchise', { defaultValue: 'Saga:' })}>
          {x.franchise === 'dune'
            ? 'Dune'
            : x.franchise === 'extra'
              ? t('group-extra', { defaultValue: 'Your extras' })
              : t('group-phase', { defaultValue: 'MCU Phase {{n}}', n: x.phase })}
        </Row>
        <Row label={t('props-released', { defaultValue: 'Released:' })}>
          {x.released.startsWith('9999')
            ? '—'
            : fmtDay(x.released, i18n.language, { ...LONG, year: 'numeric', weekday: undefined })}
        </Row>
        <Row label={t('props-runtime', { defaultValue: 'Length:' })}>
          <span className="ds-props-runtime">
            <input
              className="ds-field7"
              type="number"
              min={1}
              max={6000}
              value={runtime}
              aria-label={t('props-runtime-min', { defaultValue: 'Length in minutes' })}
              onChange={(e) => setRuntime(e.target.value)}
              onBlur={commitRuntime}
              onKeyDown={(e) => e.key === 'Enter' && commitRuntime()}
            />
            {t('props-min', { defaultValue: 'min' })} ({formatMinutes(runtimeOf(state, x))}
            {x.approx ? `, ${t('props-approx', { defaultValue: 'estimated' })}` : ''})
          </span>
        </Row>
        {x.essential && (
          <Row label={t('props-track', { defaultValue: 'Track:' })}>
            {t('fav-essentials', { defaultValue: 'Essentials' })}
          </Row>
        )}
      </dl>
      <hr />
      <fieldset className="ds-props-attrs">
        <legend>{t('props-attributes', { defaultValue: 'Attributes:' })}</legend>
        <label className="ds-check">
          <input
            type="checkbox"
            checked={included}
            onChange={() => {
              sfx.tick();
              actions.toggleIncluded(x.id);
            }}
          />
          {t('props-in-plan', { defaultValue: 'In my plan' })}
        </label>
        <label className="ds-check">
          <input
            type="checkbox"
            checked={watched}
            onChange={() => {
              if (!watched) sfx.chime();
              else sfx.undo();
              actions.toggleWatched(x.id);
            }}
          />
          {t('status-watched', { defaultValue: 'Watched' })}
        </label>
        {x.episodes ? (
          <label className="ds-props-eps">
            {t('props-eps', {
              defaultValue: 'Episodes watched: {{n}} of {{total}}',
              n: eps,
              total: x.episodes,
            })}
            <input
              type="range"
              min={0}
              max={x.episodes}
              value={eps}
              onChange={(e) => actions.setEpisodes(x.id, Number(e.target.value), x.episodes ?? 0)}
            />
          </label>
        ) : null}
      </fieldset>
      <div className="ds-row">
        <button
          type="button"
          className="ds-btn7"
          onClick={() =>
            openApp('messenger', {
              params: {
                ask: t('ask-about-q', {
                  defaultValue: 'Tell me about {{title}} — why does it matter for Dunesday?',
                  title: x.title,
                }),
              },
            })
          }
        >
          <Icon name="messenger" size={16} />
          {t('ask-about', { defaultValue: 'Ask Messenger about this' })}
        </button>
      </div>
      <Foot id={win.id} />
    </div>
  );
}

function NodeProps({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const vfs = useOs((s) => s.vfs);
  const setTitle = useOs((s) => s.setTitle);
  const node = vfs[win.params?.node ?? ''];

  useEffect(() => {
    if (node)
      setTitle(win.id, t('props-title', { defaultValue: '{{name}} Properties', name: node.name }));
  }, [node, setTitle, t, win.id]);

  if (!node)
    return (
      <p className="ds-props-missing">
        {t('props-missing-file', { defaultValue: 'This item no longer exists.' })}
      </p>
    );
  const when = (ms: number) =>
    new Date(ms).toLocaleString(i18n.language, { dateStyle: 'long', timeStyle: 'short' });
  return (
    <div className="ds-props">
      <div className="ds-props-head">
        <Icon name={iconFor(node, vfs)} size={48} shortcut={node.kind === 'shortcut'} />
        <strong>{node.name}</strong>
      </div>
      <hr />
      <dl>
        <Row label={t('props-type', { defaultValue: 'Type:' })}>{typeLabel(node, t)}</Row>
        <Row label={t('props-location', { defaultValue: 'Location:' })}>
          {node.parent ? pathOf(vfs, node.parent) : '—'}
        </Row>
        {node.kind === 'shortcut' && node.target && (
          <Row label={t('props-target', { defaultValue: 'Target:' })}>{node.target}</Row>
        )}
        {node.kind !== 'folder' && (
          <Row label={t('props-size', { defaultValue: 'Size:' })}>{sizeLabel(node)}</Row>
        )}
      </dl>
      <hr />
      <dl>
        <Row label={t('props-created', { defaultValue: 'Created:' })}>{when(node.created)}</Row>
        <Row label={t('props-modified', { defaultValue: 'Modified:' })}>{when(node.modified)}</Row>
      </dl>
      <Foot id={win.id} />
    </div>
  );
}
