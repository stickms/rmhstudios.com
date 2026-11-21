import { useEffect, useId, useMemo, useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FieldError, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readJson, writeJson } from '@/lib/core/persist';
import {
  allZones,
  dayDifference,
  dayPart,
  formatOffset,
  isValidZone,
  wallTimeIn,
  zoneOffsetMinutes,
  zonedTimeToUtc,
} from '@/lib/toolbox/timezones';

/** The viewer's own list of zones is a per-device convenience, so it lives in local storage. */
const STORAGE_KEY = 'rmh.toolbox.timezones';
const DEFAULT_ZONES = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
const MAX_ZONES = 24;

const pad = (n: number) => String(n).padStart(2, '0');
const zoneLabel = (zone: string) => zone.replace(/_/g, ' ').replace(/\//g, ' / ');

export function TimezonesTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const dateId = useId();
  const timeId = useId();
  const sourceId = useId();
  const addId = useId();
  const listId = useId();
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState('UTC');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [zones, setZones] = useState<string[]>(DEFAULT_ZONES);
  const [adding, setAdding] = useState('');
  // The zone list comes from the browser's Intl data, which can differ from the server's, so it is read after hydration.
  const options = useMemo(() => (ready ? allZones() : []), [ready]);

  const setToNow = (zone: string) => {
    const w = wallTimeIn(new Date(), zone);
    setDate(`${w.year}-${pad(w.month)}-${pad(w.day)}`);
    setTime(`${pad(w.hour)}:${pad(w.minute)}`);
  };

  // The viewer's zone, the clock and the saved list exist only in the browser.
  useEffect(() => {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setSource(own);
    setToNow(own);
    setZones(
      readJson(STORAGE_KEY, DEFAULT_ZONES, {
        validate: (v) =>
          Array.isArray(v) && v.every((z) => typeof z === 'string' && isValidZone(z))
            ? (v as string[]).slice(0, MAX_ZONES)
            : undefined,
      }),
    );
    setReady(true);
  }, []);

  const saveZones = (next: string[]) => {
    setZones(next);
    writeJson(STORAGE_KEY, next);
  };

  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const sourceValid = isValidZone(source);
  const instant =
    ready && sourceValid && y && mo && d && h !== undefined && mi !== undefined && !Number.isNaN(h + mi)
      ? zonedTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, source)
      : null;
  const sourceWall = instant ? wallTimeIn(instant, source) : null;

  const addZone = () => {
    const z = options.find((o) => o.toLowerCase() === adding.trim().toLowerCase().replace(/ /g, '_'));
    if (z && !zones.includes(z) && zones.length < MAX_ZONES) saveZones([...zones, z]);
    setAdding('');
  };

  return (
    <ToolFrame slug="timezones">
      <datalist id={listId}>
        {options.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label htmlFor={sourceId}>{t('tz-source', { defaultValue: 'Time zone of the time below' })}</Label>
          <Input
            id={sourceId}
            list={listId}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={sourceValid ? undefined : true}
          />
          {!sourceValid && (
            <FieldError>{t('tz-unknown-zone', { defaultValue: 'Choose a time zone from the list.' })}</FieldError>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={dateId}>{t('tz-date', { defaultValue: 'Date' })}</Label>
          <Input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={timeId}>{t('tz-time', { defaultValue: 'Time' })}</Label>
          <Input id={timeId} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button variant="default" onClick={() => sourceValid && setToNow(source)}>
            <Clock aria-hidden />
            {t('tz-now', { defaultValue: 'Now' })}
          </Button>
        </div>
      </div>
      {instant && sourceWall && (sourceWall.hour !== h || sourceWall.minute !== mi) && (
        <p className="t-body text-site-text-muted" role="status">
          {t('tz-gap', {
            defaultValue: 'That time is skipped by a clock change in this zone; shown as {{time}}.',
            time: `${pad(sourceWall.hour)}:${pad(sourceWall.minute)}`,
          })}
        </p>
      )}

      {instant && sourceWall && (
        <ToolSection title={t('tz-elsewhere', { defaultValue: 'The same moment elsewhere' })}>
          <ul aria-live="polite">
            {zones.map((zone) => {
              const wall = wallTimeIn(instant, zone);
              const shift = dayDifference(sourceWall, wall);
              const part = dayPart(wall.hour);
              return (
                <li key={zone} className="flex items-center gap-3 border-b border-site-border py-2 last:border-b-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="t-body truncate">{zoneLabel(zone)}</span>
                    <span className="t-meta">
                      {formatOffset(zoneOffsetMinutes(instant, zone))}
                      {' · '}
                      {part === 'work'
                        ? t('tz-part-work', { defaultValue: 'working hours' })
                        : part === 'edge'
                          ? t('tz-part-edge', { defaultValue: 'early or late' })
                          : t('tz-part-night', { defaultValue: 'night' })}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="font-mono text-base">
                      {pad(wall.hour)}:{pad(wall.minute)}
                    </span>
                    <span className="t-meta">
                      {new Intl.DateTimeFormat(locale, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(Date.UTC(wall.year, wall.month - 1, wall.day)))}
                      {shift !== 0 && ` (${shift > 0 ? '+' : '−'}${Math.abs(shift)})`}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('tz-remove', { defaultValue: 'Remove {{zone}}', zone: zoneLabel(zone) })}
                    onClick={() => saveZones(zones.filter((z) => z !== zone))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addZone();
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Label htmlFor={addId}>{t('tz-add-label', { defaultValue: 'Add a time zone' })}</Label>
              <Input
                id={addId}
                list={listId}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder={t('tz-add-placeholder', { defaultValue: 'For example: Asia/Kolkata' })}
              />
            </div>
            <Button type="submit" variant="default" disabled={zones.length >= MAX_ZONES}>
              <Plus aria-hidden />
              {t('tz-add', { defaultValue: 'Add' })}
            </Button>
          </form>
        </ToolSection>
      )}
    </ToolFrame>
  );
}
