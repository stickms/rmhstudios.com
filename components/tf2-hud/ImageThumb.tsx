/**
 * What an `image` property resolves to: the file it points at (following `.vmt`
 * → `$basetexture`), drawn small, or the missing-texture checkerboard.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageStore } from '@/lib/tf2-hud/assets/images';
import { imagePath } from '@/lib/tf2-hud/scene/build';
import { useEditor } from '@/lib/tf2-hud/store';

export default function ImageThumb({ value, size = 56 }: { value: string; size?: number }) {
  const readBytes = useEditor((s) => s.readBytes);
  const overlay = useEditor((s) => s.overlay);
  const tfVersion = useEditor((s) => s.tfVersion);
  const baseVersion = useEditor((s) => s.baseVersion);
  const [, bump] = useState(0);
  const path = useMemo(() => imagePath(value), [value]);
  const store = useMemo(
    () =>
      new ImageStore(
        () => undefined,
        () => bump((n) => n + 1),
      ),
    [],
  );
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    store.setLookup((p) => readBytes(p));
    store.invalidate();
    bump((n) => n + 1);
  }, [store, readBytes, overlay, tfVersion, baseVersion]);
  useEffect(() => () => store.dispose(), [store]);

  const img = store.get(path);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.clearRect(0, 0, size, size);
    if (img) {
      const k = Math.min(size / img.width, size / img.height);
      g.drawImage(
        img,
        (size - img.width * k) / 2,
        (size - img.height * k) / 2,
        img.width * k,
        img.height * k,
      );
    } else if (img === null) {
      const cell = size / 6;
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 6; x++) {
          g.fillStyle = (x + y) % 2 ? '#000' : '#f0f';
          g.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
  }, [img, size]);

  return (
    <div className="flex items-center gap-2">
      <canvas
        ref={ref}
        width={size}
        height={size}
        className="tf2hud-checker shrink-0 rounded-(--app-radius-sm) border border-(--app-border)"
        aria-hidden
      />
      <p className="min-w-0 break-all font-mono text-[11px] text-(--app-text-dim)">
        {path}
        {img === null ? <span className="block text-(--app-warning)">missing texture</span> : null}
      </p>
    </div>
  );
}
