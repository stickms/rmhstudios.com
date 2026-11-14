/**
 * RmhosApp: loads the session, starts the machine inside the Screen, and shows the boot screen
 * until the machine is running. Client only (the route wraps it in ClientOnly): v86 and the
 * canvas have no server render.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { CDN_BASE } from '@/lib/storage/asset';
import { resolveImageManifest } from '../engine/image-manifest';
import { rmhosSessionApi } from '../engine/rmhos.contract';
import { createVm, type VmHandle, type VmPhase, type VmPhaseDetail } from '../engine/vm';
import BootScreen from './BootScreen';
import Screen from './Screen';

declare global {
  interface Window {
    /** Development only: lets a browser test drive the guest. */
    __rmhosVm?: VmHandle;
    __rmhosPhase?: VmPhase;
  }
}

function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}

export default function RmhosApp() {
  const { t } = useTranslation('c-rmhos');
  const screenRef = useRef<HTMLDivElement>(null);
  const vmRef = useRef<VmHandle | null>(null);
  const [phase, setPhase] = useState<VmPhase>('idle');
  const [detail, setDetail] = useState<VmPhaseDetail | undefined>();
  const [confirmed, setConfirmed] = useState(() => !isPhone());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!confirmed || !screenRef.current) return;
    let cancelled = false;
    let off: (() => void) | null = null;
    setPhase('downloading');
    setDetail(undefined);
    void (async () => {
      try {
        // The session is only needed for the relay; a failure here means no network, not no desktop.
        const session = await api(rmhosSessionApi).catch(() => null);
        const net = session?.net.enabled
          ? { url: session.net.url, ticket: session.net.ticket }
          : null;
        const vm = await createVm({
          screen: screenRef.current!,
          manifest: resolveImageManifest(CDN_BASE || undefined),
          net,
        });
        if (cancelled) {
          vm.destroy();
          return;
        }
        vmRef.current = vm;
        if (import.meta.env.DEV) window.__rmhosVm = vm;
        off = vm.onPhase((p, d) => {
          setPhase(p);
          setDetail(d);
          if (import.meta.env.DEV) window.__rmhosPhase = p;
        });
      } catch (err) {
        if (!cancelled) {
          setPhase('failed');
          setDetail({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => {
      cancelled = true;
      off?.();
      vmRef.current?.destroy();
      vmRef.current = null;
      if (import.meta.env.DEV) delete window.__rmhosVm;
    };
  }, [confirmed, attempt]);

  const onRetry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <div className="rmhos-root">
      <Screen ref={screenRef} label={t('screen-label', { defaultValue: 'rmhOS desktop' })} />
      {phase !== 'running' && (
        <BootScreen
          phase={phase}
          detail={detail}
          needsKeyboardNotice={!confirmed}
          onStart={() => setConfirmed(true)}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
