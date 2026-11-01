import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { clampRollout, isValidFlagKey } from '@/lib/flags/key';

export const Route = createFileRoute('/_site/admin/flags')({
  head: () => ({ meta: [{ title: 'Feature Flags | RMH Studios' }] }),
  component: FlagsPage,
});

interface Flag {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  description: string;
}

async function saveFlag(flag: Flag): Promise<Flag | null> {
  const res = await fetch('/api/admin/flags', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: flag.key,
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
      description: flag.description,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { flag: Flag };
  return data.flag;
}

function FlagsPage() {
  const { t } = useTranslation('admin');
  const confirm = useConfirm();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/flags', { credentials: 'include' });
    const data = res.ok ? ((await res.json()) as { flags: Flag[] }) : { flags: [] };
    setFlags(data.flags);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const failed = () => toast.error(t('flags-save-failed', { defaultValue: 'Could not save the flag.' }));

  async function update(next: Flag) {
    setBusy(true);
    try {
      const saved = await saveFlag(next);
      if (!saved) return failed();
      setFlags((cur) => (cur ?? []).map((f) => (f.key === saved.key ? saved : f)));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const saved = await saveFlag({
        key: newKey,
        enabled: false,
        rolloutPercent: 100,
        description: newDescription.trim(),
      });
      if (!saved) return failed();
      setNewKey('');
      setNewDescription('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(flag: Flag) {
    const ok = await confirm({
      title: t('flags-delete-title', { defaultValue: 'Delete this flag?' }),
      description: t('flags-delete-description', {
        defaultValue: 'Anything that checks it will treat it as off.',
      }),
      confirmLabel: t('flags-delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flag.key }),
      });
      if (!res.ok) return failed();
      setFlags((cur) => (cur ?? []).filter((f) => f.key !== flag.key));
    } finally {
      setBusy(false);
    }
  }

  const keyTaken = (flags ?? []).some((f) => f.key === newKey);
  const keyValid = isValidFlagKey(newKey);

  return (
    <PageLayout title={t('flags-title', { defaultValue: 'Feature flags' })} wide backTo="/admin">
      <AdminBody width="narrow">
        <div className="glass-fill mb-6 grid gap-2 rounded-site p-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.trim().toLowerCase())}
              placeholder={t('flags-key-placeholder', { defaultValue: 'flag.key' })}
              aria-label={t('flags-key-placeholder', { defaultValue: 'flag.key' })}
              aria-invalid={newKey !== '' && !keyValid}
            />
            {newKey !== '' && !keyValid ? (
              <p className="mt-1 text-xs text-site-danger">
                {t('flags-key-invalid', {
                  defaultValue:
                    'Lowercase letters, digits, dots, dashes or underscores, starting with a letter.',
                })}
              </p>
            ) : null}
          </div>
          <Input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={280}
            placeholder={t('flags-description-placeholder', { defaultValue: 'What does it gate?' })}
            aria-label={t('flags-description-placeholder', { defaultValue: 'What does it gate?' })}
          />
          <Button variant="accent" onClick={create} disabled={busy || !keyValid || keyTaken}>
            {t('flags-create', { defaultValue: 'Create flag' })}
          </Button>
        </div>

        {flags === null ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : flags.length === 0 ? (
          <EmptyState description={t('flags-empty', { defaultValue: 'No flags yet.' })} />
        ) : (
          <ul className="glass-fill divide-y divide-site-border overflow-hidden rounded-site">
            {flags.map((f) => (
              <FlagRow key={f.key} flag={f} busy={busy} onChange={update} onDelete={() => remove(f)} />
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}

function FlagRow({
  flag,
  busy,
  onChange,
  onDelete,
}: {
  flag: Flag;
  busy: boolean;
  onChange: (next: Flag) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('admin');
  const [rollout, setRollout] = useState(String(flag.rolloutPercent));

  // Commit the rollout box on blur / Enter, and only when it actually changed.
  function commitRollout() {
    const next = clampRollout(rollout);
    setRollout(String(next));
    if (next !== flag.rolloutPercent) onChange({ ...flag, rolloutPercent: next });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <code className="font-mono text-sm text-site-accent">{flag.key}</code>
        {flag.description ? (
          <p className="truncate text-xs text-site-text-muted">{flag.description}</p>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-site-text-muted">
        {t('flags-rollout', { defaultValue: 'Rollout %' })}
        <Input
          type="number"
          min={0}
          max={100}
          value={rollout}
          onChange={(e) => setRollout(e.target.value)}
          onBlur={commitRollout}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          disabled={busy}
          className="h-9 w-20 px-2 py-1"
        />
      </label>
      <Switch
        checked={flag.enabled}
        disabled={busy}
        onCheckedChange={(enabled) => onChange({ ...flag, enabled })}
        aria-label={t('flags-enabled', { defaultValue: 'Enabled' })}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={onDelete}
        disabled={busy}
        aria-label={t('flags-delete', { defaultValue: 'Delete' })}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </li>
  );
}
