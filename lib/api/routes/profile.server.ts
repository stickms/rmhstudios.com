import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { updateProfileApi } from '@/lib/profile.contract';
import { prisma } from '@/lib/prisma.server';
import { updateProfileSchema, type ProfileLink } from '@/lib/profile-schema';
import { changeHandle, handleRefusalBody } from '@/lib/handles/history.server';
import { handleSchema } from '@/lib/handle-schema';
import { normalizeFollowListVisibility } from '@/lib/social/follow-list-privacy';
import { invalidateUserDisplay } from '@/lib/user-display.server';

export const route = apiRoute('/api/profile', {
  PATCH: implement(
    updateProfileApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'profile-update' },
      body: updateProfileSchema,
      invalid: (err) =>
        Response.json({ error: err.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ userId, isAdmin, body: data }) => {
      const {
        handle,
        displayName,
        bio,
        location,
        website,
        links,
        showLikes,
        showSupporterMarks,
        dmPrivacy,
        followListVisibility,
        dmRequests,
        profileSongSpotifyId,
        profileSongTitle,
        profileSongArtist,
        profileSongPreviewUrl,
        profileSongAlbumArt,
        tipGoal,
        tipGoalLabel,
        membershipPriceCoins,
      } = data;

      // Handle change: `changeHandle` owns the cooldown (30 days), the reclaim block, uniqueness and the
      // `HandleChange` row, in one transaction. This route only maps its failures onto its own messages.
      let newHandle: string | undefined;
      if (handle !== undefined) {
        const handleValidation = handleSchema.safeParse(handle);
        if (!handleValidation.success) {
          return Response.json(
            { error: handleValidation.error.issues[0]?.message ?? 'Invalid handle' },
            { status: 400 },
          );
        }

        const result = await changeHandle(userId, handle, { isAdmin });
        if (result.ok) {
          newHandle = result.newHandle;
        } else if (result.reason !== 'unchanged') {
          const status =
            result.reason === 'taken' || result.reason === 'reclaim-blocked'
              ? 409
              : result.reason === 'cooldown'
                ? 429
                : result.reason === 'no-account'
                  ? 404
                  : 400;
          return Response.json(
            { ...handleRefusalBody(result) },
            {
              status,
              ...(result.reason === 'cooldown' && result.retryAfterMs
                ? { headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } }
                : {}),
            },
          );
        }
      }

      const songFields =
        profileSongSpotifyId !== undefined
          ? {
              profileSongSpotifyId: profileSongSpotifyId || null,
              profileSongTitle: profileSongTitle || null,
              profileSongArtist: profileSongArtist || null,
              profileSongPreviewUrl: profileSongPreviewUrl || null,
              profileSongAlbumArt: profileSongAlbumArt || null,
            }
          : {};

      // Link-in-bio: `undefined` leaves it unchanged; an empty array clears it.
      const linksField = links !== undefined ? { links: links ?? [] } : {};

      const profile = await prisma.userProfile.upsert({
        where: { userId: userId },
        create: {
          userId: userId,
          displayName: displayName ?? null,
          bio: bio ?? null,
          location: location ?? null,
          website: website || null,
          showLikes: showLikes ?? false,
          ...(showSupporterMarks !== undefined ? { showSupporterMarks } : {}),
          ...linksField,
          ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
          ...(followListVisibility !== undefined ? { followListVisibility } : {}),
          ...(dmRequests !== undefined ? { dmRequests } : {}),
          ...(tipGoal !== undefined ? { tipGoal } : {}),
          ...(tipGoalLabel !== undefined ? { tipGoalLabel: tipGoalLabel || null } : {}),
          ...(membershipPriceCoins !== undefined
            ? { membershipPriceCoins: membershipPriceCoins || null }
            : {}),
          ...songFields,
        },
        update: {
          ...(displayName !== undefined ? { displayName: displayName ?? null } : {}),
          bio: bio ?? null,
          location: location ?? null,
          website: website || null,
          ...linksField,
          ...(showLikes !== undefined ? { showLikes } : {}),
          ...(showSupporterMarks !== undefined ? { showSupporterMarks } : {}),
          ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
          ...(followListVisibility !== undefined ? { followListVisibility } : {}),
          ...(dmRequests !== undefined ? { dmRequests } : {}),
          ...(tipGoal !== undefined ? { tipGoal } : {}),
          ...(tipGoalLabel !== undefined ? { tipGoalLabel: tipGoalLabel || null } : {}),
          ...(membershipPriceCoins !== undefined
            ? { membershipPriceCoins: membershipPriceCoins || null }
            : {}),
          ...songFields,
        },
      });

      // handle / displayName feed the cached feed author display — refresh it so
      // the user's own next feed read shows the new name/handle immediately.
      invalidateUserDisplay(userId);

      return {
        ...(newHandle ? { handle: newHandle } : {}),
        displayName: profile.displayName,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
        links: (profile.links ?? []) as ProfileLink[],
        tipGoal: profile.tipGoal,
        tipGoalLabel: profile.tipGoalLabel,
        membershipPriceCoins: profile.membershipPriceCoins,
        showLikes: profile.showLikes,
        showSupporterMarks: profile.showSupporterMarks,
        dmPrivacy: profile.dmPrivacy,
        followListVisibility: normalizeFollowListVisibility(profile.followListVisibility),
        dmRequests: profile.dmRequests,
        profileSongSpotifyId: profile.profileSongSpotifyId,
        profileSongTitle: profile.profileSongTitle,
        profileSongArtist: profile.profileSongArtist,
        profileSongPreviewUrl: profile.profileSongPreviewUrl,
        profileSongAlbumArt: profile.profileSongAlbumArt,
      };
    },
  ),
});
