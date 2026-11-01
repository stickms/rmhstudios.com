const COVER_PASSTHROUGH = /^image\/(png|jpe?g|webp|gif)$/i;

/**
 * Re-encode a picked cover as a bounded JPEG when the browser can decode it.
 * Returns the original for already-supported small images when decoding is
 * unavailable, and `null` for formats (HEIC on non-Safari) we cannot convert.
 */
export async function normalizeCover(file: File): Promise<File | null> {
  const supported = COVER_PASSTHROUGH.test(file.type);
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1024;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (supported && scale === 1 && file.size < 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    if (!blob) throw new Error('toBlob failed');
    return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
  } catch {
    return supported ? file : null;
  }
}
