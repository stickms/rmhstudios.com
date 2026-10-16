import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

interface Rule {
  domain: string;
  kind: 'DENY' | 'ALLOW';
  note: string | null;
}

/** S6: the admin-editable list behind the /out link warning. */
export function LinkRulesAdmin() {
  const { t } = useTranslation('f-safety');
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [domain, setDomain] = useState('');
  const [kind, setKind] = useState<'DENY' | 'ALLOW'>('DENY');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/link-rules', { credentials: 'include' });
    setRules(r.ok ? ((await r.json()) as { items: Rule[] }).items : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const r = await fetch('/api/admin/link-rules', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, kind, note: note || undefined }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      return toast.error(d.error || t('rules-failed', { defaultValue: "Couldn't save the rule" }));
    }
    setDomain('');
    setNote('');
    void load();
  };

  const remove = async (d: string) => {
    await fetch(`/api/admin/link-rules?domain=${encodeURIComponent(d)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    void load();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-site-text-muted">
        {t('rules-intro', {
          defaultValue:
            'Links to blocked domains, and to domains that only just started appearing, open a warning page first. Allowed domains skip the new-domain warning.',
        })}
      </p>
      <div className="glass-fill flex flex-wrap items-end gap-2 rounded-site p-3">
        <Input
          className="min-w-48 flex-1"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder={t('rules-domain', { defaultValue: 'example.com' })}
          aria-label={t('rules-domain-label', { defaultValue: 'Domain' })}
        />
        <Select
          controlSize="sm"
          containerClassName="inline-block w-auto"
          className="w-auto"
          value={kind}
          onChange={(e) => setKind(e.target.value as 'DENY' | 'ALLOW')}
          aria-label={t('rules-kind-label', { defaultValue: 'Rule type' })}
        >
          <option value="DENY">{t('rules-deny', { defaultValue: 'Block' })}</option>
          <option value="ALLOW">{t('rules-allow', { defaultValue: 'Allow' })}</option>
        </Select>
        <Input
          className="min-w-40 flex-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={t('rules-note', { defaultValue: 'Note (optional)' })}
          aria-label={t('rules-note', { defaultValue: 'Note (optional)' })}
        />
        <Button variant="accent" disabled={domain.trim().length < 3} onClick={add}>
          {t('rules-add', { defaultValue: 'Add rule' })}
        </Button>
      </div>
      {!rules ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-site-text-muted">
          {t('rules-empty', { defaultValue: 'No rules yet.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((r) => (
            <li key={r.domain} className="glass-fill flex items-center gap-3 rounded-site p-3">
              <span className="rounded-site-sm border border-site-border px-2 py-0.5 text-xs font-semibold text-site-text">
                {r.kind === 'DENY'
                  ? t('rules-deny', { defaultValue: 'Block' })
                  : t('rules-allow', { defaultValue: 'Allow' })}
              </span>
              <span className="min-w-0 flex-1 break-all font-mono text-sm text-site-text">
                {r.domain}
              </span>
              {r.note && (
                <span className="hidden text-xs text-site-text-muted sm:inline">{r.note}</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(r.domain)}
                aria-label={t('rules-remove', { defaultValue: 'Remove rule' })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
