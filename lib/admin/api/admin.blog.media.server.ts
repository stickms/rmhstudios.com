import { randomBytes } from 'node:crypto';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { uploadBlogMediaApi } from '@/lib/admin/blog-media.contract';
import { validateImageBuffer, detectImageExt } from '@features/slice-it/engine/upload-validation';
import { optimizeImage } from '@/lib/image-optimize';
import { putObject } from '@/lib/storage/s3.server';
import {
  blogMediaKey,
  blogMediaUrl,
  contentTypeForFilename,
  withImageDimensions,
} from '@/lib/storage/keys';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_BLOG_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 82;

type VideoExt = '.mp4' | '.webm' | '.mov';

/** Identify mp4/mov (ISO base media `ftyp`) and webm (EBML) by magic bytes. */
export function detectVideoExt(buf: Buffer): VideoExt | null {
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') {
    return buf.toString('latin1', 8, 12) === 'qt  ' ? '.mov' : '.mp4';
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return '.webm';
  }
  return null;
}

/** Server-generated name: the uploaded name is never part of the key. */
function randomName(): string {
  return `${Date.now()}-${randomBytes(8).toString('hex')}`;
}

/**
 * POST /api/admin/blog/media — an admin uploads one image or video (multipart
 * field `file`) for embedding in a blog post / sitewide announcement.
 * Responds `{ url, kind }`; the URL loads directly in the browser (CDN in prod,
 * else the Range-capable proxy at /api/blog/media/<filename>).
 */
export const route = apiRoute('/api/admin/blog/media', {
  POST: implement(uploadBlogMediaApi, { auth: 'admin', rateLimit: 'upload' }, async ({ request }) => {
    // Before `formData()` buffers it.
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BLOG_VIDEO_BYTES + 1024 * 1024) {
      return Response.json({ error: 'File too large.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BLOG_VIDEO_BYTES) {
      return Response.json({ error: 'File too large.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const videoExt = detectVideoExt(buffer);
    if (videoExt) {
      const filename = `${randomName()}${videoExt}`;
      await putObject(blogMediaKey(filename), buffer, contentTypeForFilename(filename));
      return Response.json({ url: blogMediaUrl(filename), kind: 'video' as const });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: `Image too large. Maximum size is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` },
        { status: 413 },
      );
    }
    const validation = validateImageBuffer(buffer);
    if (!validation.ok) return Response.json({ error: validation.error }, { status: 400 });
    const ext = detectImageExt(buffer);
    if (!ext) return Response.json({ error: 'Unsupported file type.' }, { status: 400 });

    let outBuffer: Buffer = buffer;
    let outExt: string = ext;
    let outContentType = contentTypeForFilename(`x${ext}`);
    let dims: { width: number; height: number } | null = null;
    try {
      const optimized = await optimizeImage(buffer, {
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        quality: WEBP_QUALITY,
        format: 'webp',
        animated: ext === '.gif',
        autoOrient: ext !== '.gif',
      });
      outBuffer = optimized.buffer;
      outExt = '.webp';
      outContentType = optimized.contentType;
      dims = { width: optimized.width, height: optimized.height };
    } catch (err) {
      console.warn('[blog-media] webp conversion failed, storing original:', err);
    }

    const filename = withImageDimensions(`${randomName()}${outExt}`, dims?.width, dims?.height);
    await putObject(blogMediaKey(filename), outBuffer, outContentType);
    return Response.json({ url: blogMediaUrl(filename), kind: 'image' as const });
  }),
});
