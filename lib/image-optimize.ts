import sharp from 'sharp';

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

interface OptimizeOptions {
  /** Max width in pixels */
  width?: number;
  /** Max height in pixels */
  height?: number;
  /** Quality 1-100 (default 80) */
  quality?: number;
  /** Output format (default webp) */
  format?: ImageFormat;
}

const FORMAT_CONTENT_TYPES: Record<ImageFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Optimize an image buffer using Sharp.
 * Returns the optimized buffer and its content type.
 */
export async function optimizeImage(
  input: Buffer,
  opts: OptimizeOptions = {}
): Promise<{ buffer: Buffer; contentType: string }> {
  const {
    width,
    height,
    quality = 80,
    format = 'webp',
  } = opts;

  let pipeline = sharp(input);

  // Resize if dimensions provided (maintains aspect ratio with fit inside)
  if (width || height) {
    pipeline = pipeline.resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Convert to target format
  switch (format) {
    case 'avif':
      pipeline = pipeline.avif({ quality });
      break;
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
      break;
    case 'png':
      pipeline = pipeline.png({ quality });
      break;
    case 'webp':
    default:
      pipeline = pipeline.webp({ quality });
      break;
  }

  const buffer = await pipeline.toBuffer();
  return { buffer, contentType: FORMAT_CONTENT_TYPES[format] };
}

/**
 * Parse a supported format string, returning undefined for unsupported values.
 */
export function parseFormat(f: string | null | undefined): ImageFormat | undefined {
  if (!f) return undefined;
  const lower = f.toLowerCase();
  if (lower === 'webp' || lower === 'avif' || lower === 'jpeg' || lower === 'jpg' || lower === 'png') {
    return lower === 'jpg' ? 'jpeg' : lower as ImageFormat;
  }
  return undefined;
}

/**
 * Negotiate the best image format from the Accept header.
 */
export function negotiateFormat(accept: string | null): ImageFormat {
  if (!accept) return 'webp';
  if (accept.includes('image/avif')) return 'avif';
  if (accept.includes('image/webp')) return 'webp';
  return 'jpeg';
}
