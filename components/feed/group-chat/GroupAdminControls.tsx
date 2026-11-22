import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { errorField } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { setGroupAdmin } from '@/lib/group-chat/manage.queries';
import type { GroupMember } from '@/lib/group-chat/types';

/** The "Admin" marker under a member's name in the group info list (`t-meta`, text not a chip). */
export function AdminMarker() {
  const { t } = useTranslation('group-admins');
  return (
    <p className="t-meta">
      {t('marker-admin', {
        defaultValue: 'Admin',
      })}
    </p>
  );
}

/** The owner's per-member "Make admin" / "Remove as admin" button; removal asks first. */
export function AdminToggle({
  groupId,
  member,
  who,
  disabled,
  onBusy,
  onChanged,
}: {
  groupId: string;
  member: GroupMember;
  who: string;
  disabled: boolean;
  onBusy: (id: string | null) => void;
  onChanged: () => void | Promise<void>;
}) {
  const { t } = useTranslation('group-admins');
  const confirm = useConfirm();
  const isAdmin = member.role === 'admin';
  const label = isAdmin
    ? t('remove-admin-name', {
        name: who,
        defaultValue: 'Remove {{name}} as admin',
      })
    : t('make-admin-name', {
        name: who,
        defaultValue: 'Make {{name}} admin',
      });

  async function toggle() {
    if (isAdmin) {
      const ok = await confirm({
        title: t('remove-admin-confirm', {
          name: who,
          defaultValue: 'Remove {{name}} as admin?',
        }),
        description: t('remove-admin-description', {
          defaultValue: 'Invite links they made stop working.',
        }),
        confirmLabel: t('remove-admin', {
          defaultValue: 'Remove as admin',
        }),
        danger: true,
      });
      if (!ok) return;
    }
    onBusy(member.id);
    try {
      await setGroupAdmin(groupId, member.id, !isAdmin);
      await onChanged();
    } catch (e) {
      toast.error(
        errorField(e, 'code') === 'ADMIN_LIMIT'
          ? t('admin-limit', {
              defaultValue: 'A group can have 5 admins.',
            })
          : (serverError(e) ??
              t('could-not-set-admin', {
                defaultValue: 'Could not change the admin',
              })),
      );
    } finally {
      onBusy(null);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
    >
      {isAdmin ? <ShieldOff aria-hidden /> : <ShieldCheck aria-hidden />}
    </Button>
  );
}

/** The viewer's own standing in the header's subtitle: " · Admin" for an admin (the owner's mark is in the info dialog). */
export function ViewerRoleMeta({ role }: { role: 'member' | 'admin' }) {
  const { t } = useTranslation('group-admins');
  if (role !== 'admin') return null;
  return (
    <>
      {' '}
      ·{' '}
      {t('viewer-admin', {
        defaultValue: 'You are an admin',
      })}
    </>
  );
}
