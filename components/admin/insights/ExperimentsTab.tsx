import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { send, useInsight } from './api';

interface Arm {
  exposed: number;
  converted: number;
}
interface Experiment {
  id: string;
  key: string;
  name: string;
  status: 'DRAFT' | 'RUNNING' | 'STOPPED';
  testPct: number;
  control: Arm;
  test: Arm;
  result: { p1: number; p2: number; lift: number; pValue: number } | null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function ExperimentsTab() {
  const { t } = useTranslation('f-ops');
  const { data, loading, reload } = useInsight<{ experiments: Experiment[] }>(
    '/api/admin/insights/experiments',
  );
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [testPct, setTestPct] = useState(50);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await send('/api/admin/insights/experiments', 'POST', { key, name, testPct });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return void toast.error(
        j.error ?? t('exp-create-failed', { defaultValue: 'Could not create.' }),
      );
    }
    setKey('');
    setName('');
    await reload();
  };

  const setStatus = async (id: string, status: Experiment['status']) => {
    const r = await send('/api/admin/insights/experiments', 'PATCH', { id, status });
    if (r.ok) await reload();
  };

  const verdict = (x: Experiment) => {
    if (!x.result) return t('exp-nodata', { defaultValue: 'No data yet' });
    if (x.control.exposed < 100 || x.test.exposed < 100)
      return t('exp-small', { defaultValue: 'Too few members to call (need 100 per arm)' });
    return x.result.pValue < 0.05
      ? t('exp-significant', {
          defaultValue: 'Significant (p = {{p}})',
          p: x.result.pValue.toFixed(3),
        })
      : t('exp-notsig', {
          defaultValue: 'Not significant (p = {{p}})',
          p: x.result.pValue.toFixed(3),
        });
  };

  return (
    <section className="space-y-6">
      <p className="text-sm text-site-text-muted">
        {t('exp-intro', {
          defaultValue:
            'Signed-in members are split by a sticky hash of their id. Code reads useExperiment(key) and calls convertExperiment(key) on the goal; exposures and conversions are counted once per member.',
        })}
      </p>
      <form
        onSubmit={create}
        className="glass-pane grid gap-3 rounded-site p-4 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-end"
      >
        <div className="space-y-1">
          <Label htmlFor="exp-key">{t('exp-key', { defaultValue: 'Key' })}</Label>
          <Input
            id="exp-key"
            value={key}
            required
            placeholder="new-onboarding"
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-name">{t('exp-name', { defaultValue: 'Name' })}</Label>
          <Input
            id="exp-name"
            value={name}
            required
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exp-pct">{t('exp-pct', { defaultValue: 'Test %' })}</Label>
          <Input
            id="exp-pct"
            type="number"
            min={1}
            max={100}
            value={testPct}
            onChange={(e) => setTestPct(Number(e.target.value))}
          />
        </div>
        <Button type="submit">{t('exp-create', { defaultValue: 'Create' })}</Button>
      </form>

      {loading ? (
        <Spinner />
      ) : (
        <ul className="space-y-3">
          {(data?.experiments ?? []).map((x) => (
            <li key={x.id} className="glass-fill space-y-2 rounded-site p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-site-text">{x.name}</span>
                  <span className="font-mono text-xs text-site-text-dim">{x.key}</span>
                  <Badge variant={x.status === 'RUNNING' ? 'success' : 'default'}>{x.status}</Badge>
                </div>
                {x.status === 'RUNNING' ? (
                  <Button size="xs" variant="outline" onClick={() => setStatus(x.id, 'STOPPED')}>
                    {t('exp-stop', { defaultValue: 'Stop' })}
                  </Button>
                ) : (
                  <Button size="xs" onClick={() => setStatus(x.id, 'RUNNING')}>
                    {t('exp-start', { defaultValue: 'Start' })}
                  </Button>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(['control', 'test'] as const).map((arm) => (
                  <div key={arm}>
                    <dt className="font-mono text-[0.68rem] uppercase tracking-widest text-site-text-dim">
                      {arm === 'control'
                        ? t('exp-control', { defaultValue: 'Control' })
                        : t('exp-test', { defaultValue: 'Test ({{pct}}%)', pct: x.testPct })}
                    </dt>
                    <dd className="text-site-text">
                      {t('exp-arm', {
                        defaultValue: '{{converted}} of {{exposed}} converted ({{rate}})',
                        converted: x[arm].converted,
                        exposed: x[arm].exposed,
                        rate: pct(x[arm].exposed ? x[arm].converted / x[arm].exposed : 0),
                      })}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-site-text-muted">
                {x.result &&
                  t('exp-lift', {
                    defaultValue: 'Lift {{lift}} points. ',
                    lift: (x.result.lift * 100).toFixed(1),
                  })}
                {verdict(x)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
