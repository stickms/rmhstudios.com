'use client';

/**
 * TiltEffectsRow (§5.5x C.3) — the iOS motion-permission gate for tilt-driven glass
 * light. On iOS, `DeviceOrientationEvent.requestPermission()` needs a user gesture,
 * so useLiquidBackground never prompts on load; this row does the gesture-grant.
 *
 * Rendered ONLY where that permission gate exists (iOS Safari). Everywhere else the
 * event fires without a prompt and useLiquidBackground auto-enables tilt, so no
 * toggle is needed and this component renders nothing. Consent persists as
 * `rmh-motion-ok`; toggling fires `rmh:tilt-consent` so the (already-mounted) hook
 * starts/stops listening live without a reload.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

const MOTION_OK_KEY = 'rmh-motion-ok';

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

/** True only where the browser gates deviceorientation behind requestPermission. */
function permissionGateExists(): boolean {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return false;
  return typeof (window.DeviceOrientationEvent as OrientationCtor).requestPermission === 'function';
}

export function TiltEffectsRow() {
  const { t } = useTranslation('settings-appearance');
  // SSR-safe: decide on the client after mount so the row never mismatches.
  const [gated, setGated] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setGated(permissionGateExists());
    try {
      setEnabled(localStorage.getItem(MOTION_OK_KEY) === '1');
    } catch {
      /* storage disabled */
    }
  }, []);

  if (!gated) return null;

  // Assign the translated strings to variables so the label renders `{text}` (an
  // identifier jsx-a11y reads as the label's accessible text) rather than a raw
  // t() call it can't statically resolve — mirrors AppearancePanel's ToggleRow.
  const label = t('tilt-effects', { defaultValue: 'Tilt effects' });
  const desc = t('tilt-effects-desc', {
    defaultValue: 'Let the glass catch light as you tilt your device.',
  });

  async function onChange(next: boolean) {
    if (next) {
      try {
        const req = (window.DeviceOrientationEvent as OrientationCtor).requestPermission;
        const res = req ? await req() : 'granted';
        if (res !== 'granted') {
          toast.info(
            t('tilt-denied', {
              defaultValue: 'Motion access was declined. You can enable it in Safari settings.',
            }),
          );
          return;
        }
      } catch {
        toast.info(
          t('tilt-denied', {
            defaultValue: 'Motion access was declined. You can enable it in Safari settings.',
          }),
        );
        return;
      }
      try {
        localStorage.setItem(MOTION_OK_KEY, '1');
      } catch {
        /* storage disabled — still enable for this session */
      }
      setEnabled(true);
      window.dispatchEvent(new CustomEvent<boolean>('rmh:tilt-consent', { detail: true }));
      toast.success(t('tilt-enabled', { defaultValue: 'Tilt effects on' }));
    } else {
      try {
        localStorage.removeItem(MOTION_OK_KEY);
      } catch {
        /* ignore */
      }
      setEnabled(false);
      window.dispatchEvent(new CustomEvent<boolean>('rmh:tilt-consent', { detail: false }));
    }
  }

  return (
    <label htmlFor="tilt-effects-switch" className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-site-text">{label}</span>
        <span className="block text-xs text-site-text-muted">{desc}</span>
      </span>
      <Switch id="tilt-effects-switch" checked={enabled} onCheckedChange={onChange} />
    </label>
  );
}
