/**
 * The "More" menu on someone else's profile (sprint 14, feature 09): Mute, Block, Report and "Pretending to be
 * someone". Until now a member could do these only from one of the account's posts. It does not appear on one's own
 * profile or for a signed-out visitor.
 */
import { lazy, Suspense, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Flag, MoreHorizontal, UserRoundX, Volume2, VolumeX } from 'lucide-react';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { MuteDurationChoices, useMutedToastText } from '@/components/feed/MuteDurationMenu';
import { api } from '@/lib/contract/client';
import { isolateText } from '@/lib/i18n/user-text';
import { toggleBlockApi, toggleMuteApi } from '@/lib/moderation/moderation.contract';
import type { AccountMuteDuration } from '@/lib/moderation/mute-expiry';
import { toast } from '@/lib/toast';
import type { ProfileData, ProfileViewerPatch } from './profile-types';

// Both dialogs open only from a menu action: code-split so the profile's first paint does not carry them (the report
// dialog and the impersonation form both bring zod).
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);
const ImpersonationReportDialog = lazy(() =>
  import('./ImpersonationReportDialog').then((m) => ({ default: m.ImpersonationReportDialog })),
);

type MenuProfile = Pick<
  ProfileData,
  'id' | 'handle' | 'isAdmin' | 'isOwnProfile' | 'viewerHasMuted' | 'viewerHasBlocked'
>;

/** The menu is for a signed-in member looking at another member. */
export function profileMenuVisible(signedIn: boolean, profile: Pick<ProfileData, 'isOwnProfile'>): boolean {
  return signedIn && !profile.isOwnProfile;
}

/**
 * The rows. Their wording follows the viewer's current mute and block: "Unmute" and "Unblock" when they apply. An
 * administrator cannot be blocked (the server refuses it), so the row is not offered, unless a block is already there
 * to lift.
 */
export function ProfileMenuRows({
  profile,
  onMute,
  onUnmute,
  onBlockToggle,
  onReport,
  onImpersonation,
}: {
  profile: MenuProfile;
  onMute: () => void;
  onUnmute: () => void;
  onBlockToggle: () => void;
  onReport: () => void;
  onImpersonation: () => void;
}) {
  const { t } = useTranslation('profile-reports');
  const muted = profile.viewerHasMuted === true;
  const blocked = profile.viewerHasBlocked === true;
  return (
    <>
      {muted ? (
        <MenuItem icon={Volume2} onSelect={onUnmute}>
          {t('unmute', { defaultValue: 'Unmute' })}
        </MenuItem>
      ) : (
        <MenuItem icon={VolumeX} onSelect={onMute}>
          {t('mute', { defaultValue: 'Mute' })}
        </MenuItem>
      )}
      {blocked || !profile.isAdmin ? (
        <MenuItem icon={Ban} tone={blocked ? 'default' : 'danger'} onSelect={onBlockToggle}>
          {blocked ? t('unblock', { defaultValue: 'Unblock' }) : t('block', { defaultValue: 'Block' })}
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem icon={Flag} onSelect={onReport}>
        {t('report-profile', { defaultValue: 'Report' })}
      </MenuItem>
      <MenuItem icon={UserRoundX} onSelect={onImpersonation}>
        {t('report-impersonation', { defaultValue: 'Pretending to be someone' })}
      </MenuItem>
    </>
  );
}

export function ProfileMenu({
  profile,
  name,
  signedIn,
  onChange,
}: {
  profile: MenuProfile;
  /** The name the page shows for this account; it names the button. */
  name: string;
  signedIn: boolean;
  /** Called with what changed, so the page's copy of the profile follows. */
  onChange?: ((patch: ProfileViewerPatch) => void) | undefined;
}) {
  if (!profileMenuVisible(signedIn, profile)) return null;
  return <ProfileMenuControl profile={profile} name={name} onChange={onChange} />;
}

function ProfileMenuControl({
  profile,
  name,
  onChange,
}: {
  profile: MenuProfile;
  name: string;
  onChange?: ((patch: ProfileViewerPatch) => void) | undefined;
}) {
  const { t } = useTranslation('profile-reports');
  const refusalText = useRefusalText();
  const confirm = useConfirm();
  const mutedToastText = useMutedToastText();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [impersonationOpen, setImpersonationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Mount each dialog the first time it opens and keep it, so it closes with its animation.
  const mounted = useRef({ report: false, impersonation: false });
  mounted.current.report ||= reportOpen;
  mounted.current.impersonation ||= impersonationOpen;

  const who = profile.handle ? `@${profile.handle}` : name;

  const mute = async (duration: AccountMuteDuration) => {
    if (busy) return;
    setBusy(true);
    try {
      // An explicit `mute: true`, so a stale menu never flips an existing mute off.
      await api(toggleMuteApi, { body: { targetUserId: profile.id, mute: true, duration } });
      onChange?.({ viewerHasMuted: true });
      toast.success(mutedToastText(duration));
    } catch (e) {
      toast.error(refusalText.maybe(e) || t('mute-error', { defaultValue: 'Could not mute this account' }));
    } finally {
      setBusy(false);
    }
  };

  const unmute = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api(toggleMuteApi, { body: { targetUserId: profile.id, mute: false } });
      onChange?.({ viewerHasMuted: false });
      toast.success(t('unmuted', { defaultValue: 'Unmuted' }));
    } catch (e) {
      toast.error(refusalText.maybe(e) || t('unmute-error', { defaultValue: 'Could not unmute this account' }));
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    if (busy) return;
    const blocking = profile.viewerHasBlocked !== true;
    if (
      blocking &&
      !(await confirm({
        title: t('block-confirm-title', { who: isolateText(who), defaultValue: 'Block {{who}}?' }),
        description: t('block-confirm-description', {
          defaultValue: 'You will not see their posts and they will not see yours. Any follow between you is removed.',
        }),
        confirmLabel: t('block', { defaultValue: 'Block' }),
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      // An explicit `block`, so a stale menu never flips the other way.
      await api(toggleBlockApi, { body: { targetUserId: profile.id, block: blocking } });
      onChange?.({ viewerHasBlocked: blocking });
      toast.success(
        blocking
          ? t('blocked', { defaultValue: 'Account blocked' })
          : t('unblocked', { defaultValue: 'Account unblocked' }),
      );
    } catch (e) {
      toast.error(
        refusalText.maybe(e) ||
          (blocking
            ? t('block-error', { defaultValue: 'Could not block this account' })
            : t('unblock-error', { defaultValue: 'Could not unblock this account' })),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={t('more-options-for', { name: isolateText(name), defaultValue: 'More options for {{name}}' })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal aria-hidden />
      </Button>

      <AnchoredMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={triggerRef}
        label={t('menu-label', { defaultValue: 'Profile actions' })}
        className="w-60"
      >
        <ProfileMenuRows
          profile={profile}
          onMute={() => {
            setMenuOpen(false);
            setDurationOpen(true);
          }}
          onUnmute={() => {
            setMenuOpen(false);
            void unmute();
          }}
          onBlockToggle={() => {
            setMenuOpen(false);
            void toggleBlock();
          }}
          onReport={() => {
            setMenuOpen(false);
            setReportOpen(true);
          }}
          onImpersonation={() => {
            setMenuOpen(false);
            setImpersonationOpen(true);
          }}
        />
      </AnchoredMenu>

      <MuteDurationChoices
        open={durationOpen}
        onClose={() => setDurationOpen(false)}
        anchorRef={triggerRef}
        onChoose={(duration) => void mute(duration)}
      />

      {mounted.current.report ? (
        <Suspense fallback={null}>
          <ReportDialog open={reportOpen} onOpenChange={setReportOpen} entityType="user" entityId={profile.id} />
        </Suspense>
      ) : null}
      {mounted.current.impersonation ? (
        <Suspense fallback={null}>
          <ImpersonationReportDialog
            open={impersonationOpen}
            onOpenChange={setImpersonationOpen}
            accusedUserId={profile.id}
            accusedName={name}
          />
        </Suspense>
      ) : null}
    </>
  );
}
