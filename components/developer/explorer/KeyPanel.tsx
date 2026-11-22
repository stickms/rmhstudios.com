import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface KeyPanelProps {
  value: string;
  onChange: (value: string) => void;
  isTest: boolean;
  keep: boolean;
  onKeep: (keep: boolean) => void;
}

/**
 * The key field. It is a password input that never autofills, the key is held in memory, and "Keep for this tab"
 * (sessionStorage, owned by the caller) is the member's choice.
 */
export function KeyPanel({ value, onChange, isTest, keep, onKeep }: KeyPanelProps) {
  const { t } = useTranslation('dev-explorer');
  const id = useId();
  const [shown, setShown] = useState(false);
  const trimmed = value.trim();

  return (
    <section aria-labelledby={`${id}-label`} className="space-y-2">
      <label id={`${id}-label`} htmlFor={id} className="t-label text-site-text">
        {t('key-label', { defaultValue: 'API key' })}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          dir="ltr"
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('key-placeholder', { defaultValue: 'Paste a key' })}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-pressed={shown}
          aria-label={shown ? t('key-hide', { defaultValue: 'Hide key' }) : t('key-show', { defaultValue: 'Show key' })}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      <p className="t-meta" aria-live="polite">
        {!trimmed
          ? t('key-none', { defaultValue: 'Without a key the API answers 401, which is also worth seeing.' })
          : isTest
            ? t('key-test', { defaultValue: 'Test key: reads return sample data and writes change nothing.' })
            : t('key-live', { defaultValue: 'Live key: requests act on your real account.' })}{' '}
        <Link to="/developer" className="underline">
          {t('key-manage', { defaultValue: 'Manage keys and create a test key' })}
        </Link>
      </p>
      <div className="flex items-center gap-2">
        <Switch checked={keep} onCheckedChange={onKeep} aria-labelledby={`${id}-keep`} />
        <span id={`${id}-keep`} className="t-body">
          {t('key-keep', { defaultValue: 'Keep for this tab' })}
        </span>
      </div>
    </section>
  );
}
