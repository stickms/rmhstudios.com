import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsSelectRow } from '@/components/settings/SettingsSelectRow';
import { KeyCaps, ShortcutCapture } from '@/components/settings/ShortcutCapture';
import { detectKeyPlatform } from '@/components/site/KeyboardShortcuts';
import { ALL_SHORTCUTS, SITE_SHORTCUTS, type Shortcut } from '@/lib/shortcuts/registry';
import {
  applyOverrides,
  effectiveBindings,
  sequenceText,
  validateOverride,
  type KeyPlatform,
  type OverrideResult,
  type SingleKeyMode,
} from '@/lib/shortcuts/bindings';
import { useKeyboardPrefsStore } from '@/stores/keyboardPrefsStore';

/**
 * /settings/keyboard: the single-key mode and a remap table for every site
 * shortcut (WCAG 2.1.4). Works signed out (kept on this device) and signed in
 * (saved to the account and applied on every device). Changes apply at once;
 * the dispatcher reads the same store.
 */
export function KeyboardSettings() {
  const { t } = useTranslation('keyboard');
  const { data: session, isPending } = useSession();
  const signedIn = !!session?.user;
  const prefs = useKeyboardPrefsStore((s) => s.prefs);
  const remote = useKeyboardPrefsStore((s) => s.remote);
  const hydrated = useKeyboardPrefsStore((s) => s.hydrated);
  const [platform, setPlatform] = useState<KeyPlatform>('other');
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => setPlatform(detectKeyPlatform()), []);
  useEffect(() => {
    if (!isPending) useKeyboardPrefsStore.getState().hydrate({ remote: signedIn });
  }, [isPending, signedIn]);

  const ready = hydrated && !isPending && (!signedIn || remote === 'ready' || remote === 'error');
  const arrive = useArrival(ready);

  const nameOf = (s: Shortcut) => t(s.labelKey, { ns: s.ns ?? 'feed', defaultValue: s.label ?? s.id });
  const saved = (ok: boolean) => {
    if (!ok) {
      toast.error(
        t('save-failed', {
          defaultValue: 'Could not save your shortcuts to your account. They still apply on this device.',
        }),
      );
    }
  };

  const store = useKeyboardPrefsStore.getState;
  const withOverrides = applyOverrides(SITE_SHORTCUTS, prefs.overrides);
  const effective = effectiveBindings(SITE_SHORTCUTS, prefs);
  const games = ALL_SHORTCUTS().filter((s) => s.scope.startsWith('game:'));
  const changed = prefs.singleKeys !== 'on' || Object.keys(prefs.overrides).length > 0;

  const optionAlt = platform === 'mac' ? 'Option' : 'Alt';
  const modes: Array<{ value: SingleKeyMode; label: string; hint: string }> = [
    {
      value: 'on',
      label: t('mode-on', { defaultValue: 'On' }),
      hint: t('mode-on-hint', {
        defaultValue: 'Single keys such as C, and sequences such as G then H, work on their own.',
      }),
    },
    {
      value: 'off',
      label: t('mode-off', { defaultValue: 'Off' }),
      hint: t('mode-off-hint', {
        defaultValue: 'Shortcuts made of plain keys are turned off. Shortcuts with Ctrl or Command still work.',
      }),
    },
    {
      value: 'alt',
      label: t('mode-alt', { defaultValue: 'With {{modifier}}', modifier: optionAlt }),
      hint: t('mode-alt-hint', {
        defaultValue: 'Hold {{modifier}} first: {{modifier}}+C, or {{modifier}}+G then H.',
        modifier: optionAlt,
      }),
    },
  ];
  const mode = modes.find((m) => m.value === prefs.singleKeys) ?? modes[0];

  const checkFor = (target: Shortcut) => (steps: string[]) => {
    const result: OverrideResult = validateOverride(target.id, steps, withOverrides);
    if (result.ok) return null;
    switch (result.reason) {
      case 'reserved':
        return t('error-reserved', {
          defaultValue: '{{keys}} is used by the browser and cannot be a shortcut.',
          keys: sequenceText([result.keystroke], platform),
        });
      case 'conflict':
        return t('error-conflict', {
          defaultValue: 'Already used by {{name}}. Change that one first.',
          name: nameOf(result.with),
        });
      default:
        return t('error-invalid', { defaultValue: 'That is not a key this shortcut can use.' });
    }
  };

  if (!ready) {
    return (
      <SettingsSection title={t('title', { defaultValue: 'Keyboard' })}>
        <div className="flex flex-col gap-3 py-3" role="status" aria-label={t('loading', { defaultValue: 'Loading' })}>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </SettingsSection>
    );
  }

  return (
    <div className={arrive}>
      <SettingsSection
        title={t('single-title', { defaultValue: 'Single-key shortcuts' })}
        description={
          signedIn
            ? t('single-description-account', {
                defaultValue:
                  'Choose whether shortcuts made of plain keys are active. Saved to your account and used on every device.',
              })
            : t('single-description-device', {
                defaultValue:
                  'Choose whether shortcuts made of plain keys are active. Saved on this device; sign in to use them everywhere.',
              })
        }
      >
        <SettingsSelectRow
          label={t('single-label', { defaultValue: 'Character-key shortcuts' })}
          hint={mode.hint}
          value={prefs.singleKeys}
          options={modes.map(({ value, label }) => ({ value, label }))}
          onChange={(value) => {
            const next = modes.find((m) => m.value === value);
            if (next) void store().setSingleKeys(next.value).then(saved);
          }}
        />
        {remote === 'error' && signedIn ? (
          <div className="settings-row">
            <span className="settings-row__text">
              <span className="settings-row__hint block">
                {t('load-failed', {
                  defaultValue: 'Could not load the shortcuts saved to your account. Showing this device.',
                })}
              </span>
            </span>
            <Button onClick={() => store().hydrate({ remote: true })}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          </div>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title={t('shortcuts-title', { defaultValue: 'Shortcuts' })}
        description={t('shortcuts-description', {
          defaultValue: 'Change any shortcut to a key or two-key sequence of your own.',
        })}
        action={
          <Button disabled={!changed} onClick={() => void store().resetAll().then(saved)}>
            {t('reset-all', { defaultValue: 'Reset all' })}
          </Button>
        }
      >
        {SITE_SHORTCUTS.map((shortcut) => {
          const name = nameOf(shortcut);
          const current = effective.find((s) => s.id === shortcut.id);
          const custom = prefs.overrides[shortcut.id];
          if (editing === shortcut.id) {
            return (
              <div key={shortcut.id} className="settings-row">
                <ShortcutCapture
                  name={name}
                  platform={platform}
                  check={checkFor(shortcut)}
                  onCancel={() => setEditing(null)}
                  onSave={(steps) => {
                    setEditing(null);
                    void store().setOverride(shortcut.id, steps).then(saved);
                  }}
                />
              </div>
            );
          }
          return (
            <div key={shortcut.id} className="settings-row flex-wrap">
              <span className="settings-row__text">
                <span className="settings-row__name block">{name}</span>
                <span className="settings-row__hint block">
                  {t('default-keys', {
                    defaultValue: 'Default: {{keys}}',
                    keys: sequenceText(shortcut.keys, platform, t('then', { defaultValue: 'then' })),
                  })}
                </span>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                {current ? (
                  <KeyCaps keys={current.keys} platform={platform} />
                ) : (
                  <span className="t-meta">{t('turned-off', { defaultValue: 'Off' })}</span>
                )}
                <Button
                  aria-label={t('change-named', { defaultValue: 'Change {{name}}', name })}
                  onClick={() => setEditing(shortcut.id)}
                >
                  {t('change', { defaultValue: 'Change' })}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!custom}
                  aria-label={t('reset-named', { defaultValue: 'Reset {{name}}', name })}
                  onClick={() => void store().resetOverride(shortcut.id).then(saved)}
                >
                  {t('reset', { defaultValue: 'Reset' })}
                </Button>
              </span>
            </div>
          );
        })}
      </SettingsSection>

      {games.length > 0 ? (
        <SettingsSection
          title={t('games-title', { defaultValue: 'Game controls' })}
          description={t('games-description', {
            defaultValue: 'Each game sets its own controls. They are listed here and cannot be changed.',
          })}
        >
          {games.map((shortcut) => (
            <div key={shortcut.id} className="settings-row">
              <span className="settings-row__name">{nameOf(shortcut)}</span>
              <KeyCaps keys={shortcut.keys} platform={platform} />
            </div>
          ))}
        </SettingsSection>
      ) : null}
    </div>
  );
}
