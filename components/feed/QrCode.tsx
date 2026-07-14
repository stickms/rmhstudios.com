'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Renders a scannable QR code for `value` as a crisp (pixelated) image. Uses
 * high-contrast black-on-white regardless of theme so cameras read it reliably.
 */
export function QrCode({
  value,
  size = 160,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const src = useMemo(() => {
    try {
      const qr = qrcode(0, 'M'); // type 0 = auto-size, medium error correction
      qr.addData(value);
      qr.make();
      return qr.createDataURL(6, 2);
    } catch {
      return '';
    }
  }, [value]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', width: size, height: size }}
    />
  );
}
