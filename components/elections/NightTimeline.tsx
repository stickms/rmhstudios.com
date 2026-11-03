import { useTranslation } from 'react-i18next';
import type { ElectionEvent } from '@/lib/elections/events';

const KIND_WORD: Record<ElectionEvent['kind'], string> = {
  call: 'Call',
  flip: 'Flip',
  'lead-change': 'Lead change',
  'polls-closed': 'Polls closed',
  clinch: 'Control',
  news: 'News',
};

/** The night as it happened: calls, flips, closings and lead changes, newest first. */
export function NightTimeline({
  events,
  onSelectState,
}: {
  events: ElectionEvent[];
  onSelectState: (postal: string) => void;
}) {
  const { t } = useTranslation('c-elections');
  const rows = [...events].filter((e) => e.kind !== 'news').reverse().slice(0, 60);
  if (!rows.length) {
    return (
      <p className="el-eyebrow">
        {t('timeline.empty', { defaultValue: 'The night starts here — calls, flips and closing polls land as they happen.' })}
      </p>
    );
  }
  return (
    <ol className="el-timeline el-box el-proj" aria-label={t('timeline.label', { defaultValue: 'Election night timeline' })}>
      {rows.map((e) => (
        <li key={e.id} className={`el-timeline__row el-timeline__row--${e.importance}`}>
          <time className="el-timeline__time" dateTime={new Date(e.at).toISOString()}>
            {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </time>
          <span className="el-chip">{KIND_WORD[e.kind]}</span>
          <span className="el-timeline__text">
            {e.state ? (
              <button type="button" className="el-linkbtn" onClick={() => onSelectState(e.state!)}>
                {e.text}
              </button>
            ) : (
              e.text
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
