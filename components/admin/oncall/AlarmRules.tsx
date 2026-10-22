import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatValue, type EffectiveRule } from '@/lib/ops/alarm-rules';

interface RuleView extends EffectiveRule {
  evaluations: { dim: string; current: number | null; samples: number; active: boolean }[];
}

/** Input units → stored units: thresholds in ms are edited in ms, percents in %. */
const unitLabel = (u: EffectiveRule['unit']) => (u === 'ms' ? 'ms' : u === '%' ? '%' : '');

function RuleRow({ rule, onSaved }: { rule: RuleView; onSaved: () => void }) {
  const { t } = useTranslation('f-oncall');
  const [draft, setDraft] = useState(String(rule.threshold));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(String(rule.threshold)), [rule.threshold]);

  const save = async (change: { threshold: number | null; muted: boolean }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/oncall-rules', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: rule.key, ...change }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(t('rule-saved', { defaultValue: 'Alarm rule saved.' }));
      onSaved();
    } catch {
      toast.error(
        t('rule-save-failed', { defaultValue: 'Could not save the alarm rule. Try again.' }),
      );
    } finally {
      setSaving(false);
    }
  };

  const parsed = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0;
  const changed = valid && parsed !== rule.threshold;
  const worst = rule.evaluations.reduce<number | null>(
    (m, e) => (e.current === null ? m : m === null ? e.current : Math.max(m, e.current)),
    null,
  );
  const firing = rule.evaluations.some((e) => e.active);

  return (
    <li className="glass-fill min-w-0 rounded-site p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-site-text">{rule.title}</h3>
          <p className="mt-0.5 break-words font-mono text-xs text-site-text-dim">
            {rule.id} · {rule.metric}
            {rule.dim
              ? ` (${rule.dim === '*' ? t('rule-each', { defaultValue: 'each' }) : rule.dim})`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={rule.sev <= 2 ? 'danger' : 'warning'} icon={false}>
            {t('sev', { defaultValue: 'SEV{{sev}}', sev: rule.sev })}
          </Badge>
          {rule.muted ? (
            <Badge variant="default">{t('rule-muted', { defaultValue: 'Muted' })}</Badge>
          ) : firing ? (
            <Badge variant="danger">{t('rule-firing', { defaultValue: 'Over threshold' })}</Badge>
          ) : (
            <Badge variant="success">{t('rule-ok', { defaultValue: 'OK' })}</Badge>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-site-text-muted sm:grid-cols-3">
        <div>
          <dt className="text-site-text-dim">{t('rule-current', { defaultValue: 'Now' })}</dt>
          <dd className="tabular-nums">{formatValue(worst, rule.unit)}</dd>
        </div>
        <div>
          <dt className="text-site-text-dim">{t('rule-window', { defaultValue: 'Window' })}</dt>
          <dd>{t('rule-minutes', { defaultValue: '{{n}} min', n: rule.forMinutes })}</dd>
        </div>
        <div>
          <dt className="text-site-text-dim">{t('rule-code', { defaultValue: 'In code' })}</dt>
          <dd className="tabular-nums">{formatValue(rule.codeThreshold, rule.unit)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-site-text-muted">
          {t('rule-threshold', {
            defaultValue: 'Alarm above ({{unit}})',
            unit: unitLabel(rule.unit),
          })}
          <Input
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 w-32"
            aria-invalid={!valid}
          />
        </label>
        <Button
          size="sm"
          disabled={!changed || saving}
          onClick={() => void save({ threshold: parsed, muted: rule.muted })}
        >
          {t('rule-save', { defaultValue: 'Save threshold' })}
        </Button>
        <label className="flex items-center gap-2 text-sm text-site-text-muted">
          <Switch
            checked={rule.muted}
            disabled={saving}
            onCheckedChange={(muted) =>
              void save({
                threshold: rule.threshold === rule.codeThreshold ? null : rule.threshold,
                muted,
              })
            }
            aria-label={t('rule-mute-label', { defaultValue: 'Mute this alarm' })}
          />
          {t('rule-mute', { defaultValue: 'Mute' })}
        </label>
        {rule.overridden && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void save({ threshold: null, muted: false })}
          >
            {t('rule-reset', { defaultValue: 'Reset to code' })}
          </Button>
        )}
      </div>
    </li>
  );
}

export function AlarmRules() {
  const { t } = useTranslation('f-oncall');
  const [rules, setRules] = useState<RuleView[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/oncall-rules', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      setRules(((await res.json()) as { rules: RuleView[] }).rules);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-site-text">
        {t('rules-title', { defaultValue: 'Alarm rules' })}
      </h2>
      <p className="mt-1 text-sm text-site-text-muted">
        {t('rules-body', {
          defaultValue:
            'Thresholds over the one-minute metrics history. Defaults live in lib/ops/alarm-rules.ts; a change here overrides the code until you reset it.',
        })}
      </p>
      {failed ? (
        <p className="glass-fill mt-3 rounded-site p-4 text-sm text-site-text-muted">
          {t('rules-failed', {
            defaultValue: 'Could not load the alarm rules. Refresh to try again.',
          })}
        </p>
      ) : !rules ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {rules.map((r) => (
            <RuleRow key={r.key} rule={r} onSaved={() => void load()} />
          ))}
        </ul>
      )}
    </section>
  );
}
