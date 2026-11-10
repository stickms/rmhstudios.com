import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { updateProfileApi } from '@/lib/profile.contract';
import { prisma } from '@/lib/prisma.server';
import { updateProfileSchema, type ProfileLink } from '@/lib/profile-schema';
import { canChangeHandle } from '@/lib/handle';
import { handleSchema } from '@/lib/handle-schema';
import { invalidateUserDisplay } from '@/lib/user-display.server';

export const Route = createFileRoute('/api/profile')({
  server: {
    handlers: {
      PATCH: implement(
        updateProfileApi,
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'profile-update' },
          body: updateProfileSchema,
          invalid: (err) =>
            Response.json({ error: err.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
        },
        async ({ userId, body: data }) => {
          const {
            handle,
            displayName,
            bio,
            location,
            website,
            links,
            showLikes,
            dmPrivacy,
            profileSongSpotifyId,
            profileSongTitle,
            profileSongArtist,
            profileSongPreviewUrl,
            profileSongAlbumArt,
            tipGoal,
            tipGoalLabel,
            membershipPriceCoins,
          } = data;

          // Handle change logic
          let newHandle: string | undefined;
          if (handle !== undefined) {
            const handleValidation = handleSchema.safeParse(handle);
            if (!handleValidation.success) {
              return Response.json(
                { error: handleValidation.error.issues[0]?.message ?? 'Invalid handle' },
                { status: 400 },
              );
            }

            // Check if handle actually changed
            const currentUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { handle: true, handleChangedAt: true, isAdmin: true },
            });

            if (handle !== currentUser?.handle) {
              // Check cooldown
              if (
                !canChangeHandle(
                  currentUser?.handleChangedAt ?? null,
                  currentUser?.isAdmin ?? false,
                )
              ) {
                return Response.json(
                  { error: 'You can only change your handle once every two weeks' },
                  { status: 429 },
                );
              }

              // Check uniqueness
              const existing = await prisma.user.findUnique({
                where: { handle },
                select: { id: true },
              });
              if (existing && existing.id !== userId) {
                return Response.json({ error: 'This handle is already taken' }, { status: 409 });
              }

              newHandle = handle;
            }
          }

          // Update handle on user model if changed
          if (newHandle) {
            await prisma.user.update({
              where: { id: userId },
              data: { handle: newHandle, handleChangedAt: new Date() },
            });
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
              ...linksField,
              ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
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
              ...(dmPrivacy !== undefined ? { dmPrivacy } : {}),
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
            dmPrivacy: profile.dmPrivacy,
            profileSongSpotifyId: profile.profileSongSpotifyId,
            profileSongTitle: profile.profileSongTitle,
            profileSongArtist: profile.profileSongArtist,
            profileSongPreviewUrl: profile.profileSongPreviewUrl,
            profileSongAlbumArt: profile.profileSongAlbumArt,
          };
        },
      ),
    },
  },
});
