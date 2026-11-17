/**
 * The admin's entry point to site moderation on a page about one thing (a
 * community, a space, a vibe, a persona, a removed post). Renders nothing for
 * anyone who is not an admin; the dialog loads on first open.
 */

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import type { ModeratableType, ModerationAction } from '@/lib/moderation/content';
import { cn } from '@/lib/utils';

const ModerateContentDialog = lazy(() =>
  import('@/components/moderation/ModerateContentDialog').then((m) => ({
    default: m.ModerateContentDialog,
  })),
);

export interface AdminModerateButtonProps {
  entityType: ModeratableType;
  entityId: string;
  current?: Record<string, string | null | undefined>;
  removed?: boolean;
  onDone?: (action: ModerationAction) => void;
  className?: string;
  size?: 'default' | 'sm' | 'xs';
}

export function AdminModerateButton({
  entityType,
  entityId,
  current,
  removed,
  onDone,
  className,
  size = 'sm',
}: AdminModerateButtonProps) {
  const { t } = useTranslation('c-moderation');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  if (!isAdmin) return null;

  return (
    <>
      <Button
        variant="danger"
        size={size}
        className={cn(className)}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <ShieldAlert aria-hidden />
        {removed
          ? t('moderate-button-restore', { defaultValue: 'Moderate: restore' })
          : t('moderate-button', { defaultValue: 'Moderate' })}
      </Button>
      {mounted && (
        <Suspense fallback={null}>
          <ModerateContentDialog
            open={open}
            onOpenChange={setOpen}
            entityType={entityType}
            entityId={entityId}
            {...(current ? { current } : {})}
            {...(removed !== undefined ? { removed } : {})}
            {...(onDone ? { onDone } : {})}
          />
        </Suspense>
      )}
    </>
  );
}
