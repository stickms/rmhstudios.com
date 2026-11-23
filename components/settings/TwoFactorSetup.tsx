/**
 * Turning on two-step verification, in three steps: confirm the password (skipped right after sign-up, where
 * it was just typed), scan the QR code into an authenticator app and type the code it shows, then save the ten
 * backup codes. Used by Settings → Security (`TwoFactorPanel`) and offered once after an email sign-up
 * (`/login`). Optional everywhere: Cancel or "Not now" leaves the account as it was.
 *
 * Better Auth's twoFactor plugin does the work: `enable` stores an encrypted secret marked unconfirmed and
 * returns the otpauth URI and the backup codes; the first correct code (`verifyTotp`, signed in) is what turns
 * 2FA on. Nothing is on until that code is right, so a setup abandoned half-way changes nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { QrCode } from '@/components/feed/QrCode';
import { cn } from '@/lib/utils';

type Step = 'password' | 'scan' | 'codes';

/**
 * `page`: on /login, which stacks full-width large buttons with the main action in ink, centred content.
 * `inline`: in a Settings row, which ends in small buttons at the end of the row, like its other forms.
 */
export type SetupLayout = 'page' | 'inline';

/** The step's buttons, laid out the way the surrounding surface lays out its own. */
function Actions({ layout, main, cancel }: { layout: SetupLayout; main: React.ReactNode; cancel?: React.ReactNode }) {
  return layout === 'page' ? (
    <div className="flex flex-col gap-2">
      {main}
      {cancel}
    </div>
  ) : (
    <div className="flex flex-wrap justify-end gap-2">
      {cancel}
      {main}
    </div>
  );
}

/** Size and variant for a step's buttons in each layout. */
function buttonProps(layout: SetupLayout, main: boolean) {
  return layout === 'page'
    ? ({ size: 'lg', className: 'w-full', variant: main ? 'primary' : 'default' } as const)
    : ({ variant: 'default' } as const);
}

/** The base32 secret inside an otpauth:// URI, for typing in by hand. */
export function secretFromUri(uri: string): string {
  try {
    return new URL(uri).searchParams.get('secret') ?? '';
  } catch {
    return '';
  }
}

/** "ABCD EFGH …": the secret in groups of four, easier to read and type. */
export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

export function TwoFactorSetup({
  password: knownPassword,
  onDone,
  onCancel,
  cancelLabel,
  layout = 'inline',
}: {
  /** The account's password when it was just typed (after sign-up); asked for otherwise. */
  password?: string;
  onDone: () => void;
  onCancel: () => void;
  /** "Cancel" in Settings, "Not now" after sign-up. */
  cancelLabel?: string;
  layout?: SetupLayout;
}) {
  const { t } = useTranslation('feed');
  const [step, setStep] = useState<Step>(knownPassword ? 'scan' : 'password');
  const [password, setPassword] = useState('');
  const [uri, setUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  const cancel = cancelLabel ?? t('signin-methods-cancel', { defaultValue: 'Cancel' });

  const start = async (pw: string) => {
    setError(null);
    setPending(true);
    try {
      const res = await authClient.twoFactor.enable({ password: pw, issuer: 'RMH Studios' });
      if (res.error || !res.data || !('totpURI' in res.data) || !res.data.totpURI) {
        setError(
          res.error?.code === 'INVALID_PASSWORD'
            ? t('two-factor-password-wrong', { defaultValue: 'That password is not right.' })
            : res.error?.message || t('two-factor-start-failed', { defaultValue: 'Could not start the setup.' }),
        );
        if (knownPassword) setStep('password');
        return;
      }
      setUri(res.data.totpURI);
      setBackupCodes(res.data.backupCodes ?? []);
      setStep('scan');
    } catch {
      setError(t('two-factor-start-failed', { defaultValue: 'Could not start the setup.' }));
    } finally {
      setPending(false);
    }
  };

  // After sign-up the password is in hand: start at once (once, even under StrictMode's double effect).
  useEffect(() => {
    if (!knownPassword || started.current) return;
    started.current = true;
    void start(knownPassword);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount
  }, []);

  const confirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(value)) {
      setError(t('two-factor-code-format', { defaultValue: 'Enter the 6-digit code from your app.' }));
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: value });
      if (res.error) {
        setError(
          t('two-factor-code-wrong', {
            defaultValue: 'That code is not right. Check the time on your phone and try the newest code.',
          }),
        );
        return;
      }
      setStep('codes');
    } catch {
      setError(t('two-factor-confirm-failed', { defaultValue: 'Could not check the code.' }));
    } finally {
      setPending(false);
    }
  };

  const secret = useMemo(() => (uri ? secretFromUri(uri) : ''), [uri]);

  if (step === 'password') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password) {
            setError(t('two-factor-password-missing', { defaultValue: 'Enter your password.' }));
            return;
          }
          void start(password);
        }}
        noValidate
        className="flex flex-col gap-3"
      >
        <p className="t-body">{t('two-factor-password-intro', { defaultValue: 'Enter your password to start.' })}</p>
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('password-change-current', { defaultValue: 'Current password' })}
          aria-label={t('password-change-current', { defaultValue: 'Current password' })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'two-factor-error' : undefined}
          autoFocus
        />
        <SetupError error={error} />
        <Actions
          layout={layout}
          main={
            <Button type="submit" loading={pending} {...buttonProps(layout, true)}>
              {t('two-factor-continue', { defaultValue: 'Continue' })}
            </Button>
          }
          cancel={
            <Button type="button" onClick={onCancel} disabled={pending} {...buttonProps(layout, false)}>
              {cancel}
            </Button>
          }
        />
      </form>
    );
  }

  if (step === 'scan') {
    if (!uri) {
      return (
        <div className="flex flex-col gap-3">
          <p className="t-body text-site-text-muted" role="status">
            {t('two-factor-starting', { defaultValue: 'Setting up…' })}
          </p>
          <SetupError error={error} />
        </div>
      );
    }
    return (
      <form onSubmit={confirmCode} noValidate className="flex flex-col gap-3">
        <p className="t-body">
          {t('two-factor-scan', {
            defaultValue:
              'Scan this code with an authenticator app (1Password, Google Authenticator, Authy, or the one built into your password manager), then type the 6-digit code it shows.',
          })}
        </p>
        <figure
          className={cn(
            'm-0 overflow-hidden rounded-site border border-site-border',
            layout === 'page' ? 'self-center' : 'self-start',
          )}
        >
          <QrCode value={uri} size={176} />
          <figcaption className="sr-only">
            {t('two-factor-qr-label', { defaultValue: 'QR code for your authenticator app' })}
          </figcaption>
        </figure>
        <div className={cn(layout === 'page' && 'text-center')}>
          <p className="t-label">{t('two-factor-key-label', { defaultValue: 'Or enter this key' })}</p>
          <div className={cn('flex items-center gap-1', layout === 'page' && 'justify-center')}>
            <code className="t-meta min-w-0 text-site-text">{groupSecret(secret)}</code>
            <CopyButton value={secret} label={t('two-factor-key-copy', { defaultValue: 'Copy key' })} />
          </div>
        </div>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('two-factor-code-placeholder', { defaultValue: '6-digit code' })}
          aria-label={t('two-factor-code-placeholder', { defaultValue: '6-digit code' })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'two-factor-error' : undefined}
        />
        <SetupError error={error} />
        <Actions
          layout={layout}
          main={
            <Button type="submit" loading={pending} {...buttonProps(layout, true)}>
              {t('two-factor-turn-on', { defaultValue: 'Turn on' })}
            </Button>
          }
          cancel={
            <Button type="button" onClick={onCancel} disabled={pending} {...buttonProps(layout, false)}>
              {cancel}
            </Button>
          }
        />
      </form>
    );
  }

  return <BackupCodes codes={backupCodes} onDone={onDone} layout={layout} />;
}

function SetupError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p id="two-factor-error" role="alert" className="t-body text-site-danger">
      {error}
    </p>
  );
}

/** The backup codes, shown once: copy them or save them as a text file. */
export function BackupCodes({
  codes,
  onDone,
  intro = 'enabled',
  layout = 'inline',
}: {
  codes: string[];
  onDone: () => void;
  layout?: SetupLayout;
  /** `enabled`: shown at the end of setup. `replaced`: new codes made from Settings. */
  intro?: 'enabled' | 'replaced';
}) {
  const { t } = useTranslation('feed');
  const text = codes.join('\n');

  const download = () => {
    const blob = new Blob([`RMH Studios backup codes\n\n${text}\n`], { type: 'text/plain' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'rmh-studios-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="t-body" role="status">
        {intro === 'enabled'
          ? t('two-factor-codes-intro', {
              defaultValue:
                'Two-step verification is on. Save these backup codes somewhere safe: if you lose your phone, each one signs you in once. They are not shown again.',
            })
          : t('two-factor-codes-replaced', {
              defaultValue:
                'Your new backup codes. The old ones no longer work. Save these somewhere safe: each one signs you in once.',
            })}
      </p>
      <ul
        className={cn('m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1 p-0', layout === 'page' && 'mx-auto w-fit')}
        aria-label={t('two-factor-codes-label', { defaultValue: 'Backup codes' })}
      >
        {codes.map((c) => (
          <li key={c} className="t-meta text-site-text">
            {c}
          </li>
        ))}
      </ul>
      {layout === 'page' ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <CopyButton value={text} variant="default" size="lg" toastOnCopy className="w-full">
              {t('two-factor-codes-copy', { defaultValue: 'Copy' })}
            </CopyButton>
            <Button onClick={download} size="lg" className="w-full gap-2">
              <Download className="size-4" aria-hidden />
              {t('two-factor-codes-download', { defaultValue: 'Download' })}
            </Button>
          </div>
          <Button variant="primary" size="lg" className="w-full" onClick={onDone}>
            {t('two-factor-codes-done', { defaultValue: 'Done' })}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <CopyButton value={text} variant="default" toastOnCopy>
            {t('two-factor-codes-copy', { defaultValue: 'Copy' })}
          </CopyButton>
          <Button onClick={download} className="gap-2">
            <Download className="size-4" aria-hidden />
            {t('two-factor-codes-download', { defaultValue: 'Download' })}
          </Button>
          <Button onClick={onDone}>{t('two-factor-codes-done', { defaultValue: 'Done' })}</Button>
        </div>
      )}
    </div>
  );
}
