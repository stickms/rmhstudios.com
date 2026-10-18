'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SCOPES } from '@/lib/api/scopes';

/** D1: creates an `rmh_test_` sandbox key — fixtures for reads, no-op writes. */
export function TestKeyCreator({ onCreated }: { onCreated: (plaintext: string) => void }) {
  const { t } = useTranslation('f-devplatform');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scopes: SCOPES.map((s) => s.id),
          testMode: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setName('');
        onCreated(data.key);
      } else {
        toast.error(
          data.error || t('testKeys-error', { defaultValue: 'Could not create the test key' }),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-fill mb-4 space-y-2 rounded-site p-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-site-accent" />
        <h3 className="text-sm font-bold text-site-text">
          {t('testKeys-title', { defaultValue: 'Test-mode key' })}
        </h3>
      </div>
      <p className="text-xs text-site-text-muted">
        {t('testKeys-blurb', {
          defaultValue:
            'An rmh_test_ key works against every endpoint but only returns sample data, and writes are acknowledged without changing anything. Build against it safely.',
        })}
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label={t('testKeys-name', { defaultValue: 'Test key name' })}
          placeholder={t('testKeys-name', { defaultValue: 'Test key name' })}
        />
        <Button variant="accent" size="sm" disabled={busy || !name.trim()} onClick={create}>
          {t('testKeys-create', { defaultValue: 'Create test key' })}
        </Button>
      </div>
    </div>
  );
}
