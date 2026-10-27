/**
 * The camera controls both 3D viewers share: drag to rotate, right-drag (or two fingers) to move the
 * model, wheel or pinch to zoom, and a button that returns to the framed view.
 */
'use client';

import { useCallback, useEffect, useRef, type ComponentProps, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Crosshair } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useTranslation } from 'react-i18next';

type Orbit = { target: { copy: (v: unknown) => void }; update: () => void; saveState: () => void };

/** Orbit controls that remember the framed view and register a function that goes back to it. */
export function ViewerOrbit({
  resetRef,
  ...props
}: ComponentProps<typeof OrbitControls> & { resetRef: RefObject<(() => void) | null> }) {
  const controls = useThree((s) => s.controls) as unknown as (Orbit & { reset: () => void }) | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!controls) return;
    const ref = resetRef;
    ref.current = () => {
      controls.reset();
      invalidate();
    };
    return () => {
      ref.current = null;
    };
  }, [controls, invalidate, resetRef]);
  return <OrbitControls makeDefault enablePan enableZoom enableRotate enableDamping {...props} />;
}

/** Call after the camera has been framed so "reset" returns to it. */
export function rememberView(controls: unknown): void {
  (controls as Orbit | null)?.saveState();
}

export function useResetView() {
  const ref = useRef<(() => void) | null>(null);
  const reset = useCallback(() => ref.current?.(), []);
  return { ref, reset };
}

export function ResetViewButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('c-tf2-hud');
  const label = t('reset-view', { defaultValue: 'Reset view' });
  return (
    <IconButton
      icon={Crosshair}
      label={label}
      showTooltip={false}
      variant="outline"
      onClick={onClick}
      className="absolute end-2 top-2"
    />
  );
}
