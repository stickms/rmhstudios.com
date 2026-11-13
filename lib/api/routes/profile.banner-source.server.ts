import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { bannerSourceApi } from '@/lib/profile.contract';
import { prisma } from '@/lib/prisma.server';
import { readBannerSource } from '@/lib/profile/banner-store.server';

/**
 * GET /api/profile/banner-source: the picture the caller's own banner was cut from, for
 * the crop editor.
 *
 * It exists for two reasons. The source holds what the owner cropped OUT, so it is never
 * given a public URL; and the public banner is served from the CDN in production, a
 * different origin, which a crop canvas cannot read back without the CDN sending CORS
 * headers. Streaming the bytes from here keeps the editor same-origin with no change to
 * the CSP or the bucket.
 */
export const route = apiRoute('/api/profile/banner-source', {
  GET: implement(
    bannerSourceApi,
    { rateLimit: { policy: 'read', scope: 'user', prefix: 'read:profile/banner-source' } },
    async ({ session }) => {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { bannerUrl: true },
      });
      const source = await readBannerSource(profile?.bannerUrl);
      if (!source) {
        return Response.json({ error: 'No banner' }, { status: 404 });
      }
      return new Response(new Uint8Array(source.body), {
        headers: {
          'Content-Type': source.contentType || 'image/webp',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    },
  ),
});
