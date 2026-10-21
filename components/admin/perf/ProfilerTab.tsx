import { useState } from 'react';
import { Download, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { ProfileResponse } from '@/lib/perf/admin-types';
import { DataTable, type Column } from './DataTable';
import { fmtMs, fmtNum, fmtInt } from './format';
import type { ProfileSummaryRow } from '@/lib/perf/admin-types';

const DURATIONS = ['5', '10', '20', '30'];

/** Shorten a script URL for display: keep the tail, which is the informative part. */
function shortUrl(url: string): string {
  const clean = url.replace(/^file:\/\//, '');
  return clean.length > 70 ? `…${clean.slice(-69)}` : clean;
}

export function ProfilerTab() {
  const { t } = useTranslation('f-perf');
  const [seconds, setSeconds] = useState('10');
  const [busy, setBusy] = useState<'download' | 'summary' | null>(null);
  const [result, setResult] = useState<ProfileResponse | null>(null);

  const run = async (mode: 'download' | 'summary') => {
    setBusy(mode);
    try {
      const res = await fetch(`/api/admin/perf/profile${mode === 'summary' ? '?summary=1' : ''}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seconds: Number(seconds) }),
      });
      if (res.status === 409) {
        toast.error(
          t('profile-busy', {
            defaultValue: 'A profile is already running on that worker. Try again in a moment.',
          }),
        );
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      if (mode === 'summary') {
        setResult((await res.json()) as ProfileResponse);
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
        'web.cpuprofile';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        t('profile-saved', {
          defaultValue: 'Saved {{name}}. Open it in Chrome DevTools, Performance tab.',
          name,
        }),
      );
    } catch {
      toast.error(t('profile-failed', { defaultValue: 'Profiling failed.' }));
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<ProfileSummaryRow>[] = [
    {
      id: 'fn',
      header: t('col-function', { defaultValue: 'Function' }),
      render: (r) => <span className="font-mono text-xs break-all">{r.functionName}</span>,
    },
    {
      id: 'loc',
      header: t('col-location', { defaultValue: 'Location' }),
      render: (r) =>
        r.url ? (
          <span
            className="font-mono text-xs break-all text-site-text-muted"
            title={`${r.url}:${r.line}:${r.column}`}
          >
            {shortUrl(r.url)}:{r.line}:{r.column}
          </span>
        ) : (
          <span className="text-site-text-dim">—</span>
        ),
    },
    {
      id: 'self',
      header: t('col-self-time', { defaultValue: 'Self time' }),
      align: 'right',
      sortValue: (r) => r.selfMs,
      render: (r) => fmtMs(r.selfMs),
    },
    {
      id: 'pct',
      header: t('col-self-pct', { defaultValue: 'Self %' }),
      align: 'right',
      sortValue: (r) => r.selfPercent,
      render: (r) => `${fmtNum(r.selfPercent, 1)}%`,
    },
    {
      id: 'samples',
      header: t('col-samples', { defaultValue: 'Samples' }),
      align: 'right',
      sortValue: (r) => r.samples,
      render: (r) => fmtInt(r.samples),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="glass-fill space-y-4 rounded-site p-4">
        <p className="text-sm text-site-text-muted">
          {t('profile-intro', {
            defaultValue:
              'Samples the JavaScript call stack of ONE web worker (whichever the cluster routes this request to; its pid is shown with the result) at 1 ms intervals. Users are not affected beyond a few percent of that worker’s CPU while it runs.',
          })}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-site-text-muted">
            <span>{t('profile-duration', { defaultValue: 'Duration' })}</span>
            <Select
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              disabled={busy !== null}
              controlSize="sm"
              aria-label={t('profile-duration-label', {
                defaultValue: 'Profile duration in seconds',
              })}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {t('profile-seconds', { defaultValue: '{{count}} s', count: Number(d) })}
                </option>
              ))}
            </Select>
          </label>
          <Button onClick={() => void run('download')} disabled={busy !== null}>
            <Download aria-hidden />
            {t('profile-capture', { defaultValue: 'Capture CPU profile' })}
          </Button>
          <Button variant="outline" onClick={() => void run('summary')} disabled={busy !== null}>
            <Flame aria-hidden />
            {t('profile-summarise', { defaultValue: 'Capture & summarise' })}
          </Button>
        </div>
        <p className="text-xs text-site-text-dim">
          {t('profile-hint', {
            defaultValue:
              'The downloaded .cpuprofile opens in Chrome DevTools: Performance tab, Load profile.',
          })}
        </p>
        {busy && (
          <div className="flex items-center gap-2 text-sm text-site-text-muted" role="status">
            <Spinner size={18} />
            {t('profile-running', {
              defaultValue: 'Profiling for {{count}} s…',
              count: Number(seconds),
            })}
          </div>
        )}
      </section>

      {result && (
        <section className="space-y-3">
          <h2 className="site-section-label">
            {t('profile-result', {
              defaultValue: 'Top functions by self time (worker pid {{pid}}, {{count}} s)',
              pid: result.pid,
              count: result.seconds,
            })}
          </h2>
          <p className="text-xs text-site-text-dim">
            {t('profile-result-meta', {
              defaultValue: '{{samples}} samples; the worker was idle {{idle}}% of the time.',
              samples: fmtInt(result.sampleCount),
              idle: fmtNum(result.idlePercent, 1),
            })}
          </p>
          <DataTable
            rows={result.top}
            columns={columns}
            rowKey={(r) => `${r.functionName}|${r.url}|${r.line}|${r.column}`}
            initialSort={{ id: 'self', dir: 'desc' }}
            empty={t('profile-empty', { defaultValue: 'No samples were captured.' })}
            sortLabel={(h) => t('sort-by', { defaultValue: 'Sort by {{column}}', column: h })}
          />
        </section>
      )}
    </div>
  );
}
