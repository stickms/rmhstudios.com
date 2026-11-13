import { randomBytes } from 'node:crypto';
import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { validateImageBuffer, detectImageExt } from '@/lib/slice-it/upload-validation';
import { putObject } from '@/lib/storage/s3.server';
import { blogMediaKey, blogMediaUrl, contentTypeForFilename, withImageDimensions } from '@/lib/storage/keys';
import { optimizeImage, imageDimensions } from '@/lib/image-optimize';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 82;

type VideoExt = '.mp4' | '.webm' | '.mov';

/** Identify mp4/mov (ISO base media `ftyp`) and webm (EBML) by magic bytes. */
function detectVideoExt(buf: Buffer): VideoExt | null {
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') {
    return buf.toString('latin1', 8, 12) === 'qt  ' ? '.mov' : '.mp4';
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return '.webm';
  }
  return null;
}

function randomName(): string {
  return `${Date.now()}-${randomBytes(8).toString('hex')}`;
}

export const Route = createFileRoute('/api/admin/blog/media')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          if (!(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'admin-blog-media',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many uploads. Try again later.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const formData = await request.formData();
          const file = formData.get('file');
          if (!(file instanceof File) || file.size === 0) {
            return Response.json({ error: 'No file provided' }, { status: 400 });
          }
          if (file.size > MAX_VIDEO_BYTES) {
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
            dims = await imageDimensions(buffer);
          }

          const filename = withImageDimensions(`${randomName()}${outExt}`, dims?.width, dims?.height);
          await putObject(blogMediaKey(filename), outBuffer, outContentType);
          return Response.json({ url: blogMediaUrl(filename), kind: 'image' as const });
        } catch (error) {
          console.error('Blog media upload error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
