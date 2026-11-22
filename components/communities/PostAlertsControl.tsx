import { useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem, MenuLabel } from '@/components/ui/menu';
import { useArrival } from '@/components/ui/arrive';
import { useQuery } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { getPostAlertsApi, setPostAlertsApi, type PostAlertsDTO } from '@/lib/communities/post-alerts.contract';
import type { PostAlertLevel } from '@/lib/communities/post-alerts';

/**
 * "Post alerts: Off / All new posts" for one community. A bell button opens a two-row menu; the button's accessible
 * name states the current choice. Members only (the page mounts it for a joined member), and nothing is shown until
 * the setting has loaded.
 */
export function PostAlertsControl({ slug, className }: { slug: string; className?: string }) {
  const { t } = useTranslation('community-alerts');
  // The stored setting, read once per community; a choice made here overrides it until the next read.
  const stored = useQuery({
    ...apiQuery(getPostAlertsApi, { params: { slug } }),
    retry: false,
  });
  const [chosen, setAlerts] = useState<PostAlertsDTO | null>(null);
  const alerts = chosen ?? stored.data ?? null;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Steel M9: the control appears after a fetch.
  const arrival = useArrival(!!alerts);

  if (!alerts) return null;

  const choose = async (level: PostAlertLevel) => {
    setOpen(false);
    if (level === alerts.level || saving) return;
    const previous = alerts;
    setAlerts({
      ...alerts,
      level,
    });
    setSaving(true);
    try {
      setAlerts(
        await api(setPostAlertsApi, {
          params: {
            slug,
          },
          body: {
            level,
          },
        }),
      );
    } catch {
      setAlerts(previous);
      toast.error(
        t('save-failed', {
          defaultValue: 'Could not change your post alerts.',
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const on = alerts.level === 'all';
  return (
    <span className={cn('inline-flex', arrival, className)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="default"
        size="icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          on
            ? t('button-label-all', {
                defaultValue: 'Post alerts: all new posts',
              })
            : t('button-label-off', {
                defaultValue: 'Post alerts: off',
              })
        }
        title={t('menu-label', {
          defaultValue: 'Post alerts',
        })}
        onClick={() => setOpen((v) => !v)}
      >
        {on ? <Bell aria-hidden /> : <BellOff aria-hidden />}
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={t('menu-label', {
          defaultValue: 'Post alerts',
        })}
        className="w-60"
      >
        <MenuItem icon={BellOff} checked={!on} onSelect={() => void choose('off')}>
          {t('level-off', {
            defaultValue: 'Off',
          })}
        </MenuItem>
        <MenuItem icon={Bell} checked={on} onSelect={() => void choose('all')}>
          {t('level-all', {
            defaultValue: 'All new posts',
          })}
        </MenuItem>
        {alerts.tooLarge && (
          <MenuLabel className="font-normal">
            {t('too-large', {
              defaultValue: 'This community is too large to alert for every post. Use the feed.',
            })}
          </MenuLabel>
        )}
      </AnchoredMenu>
    </span>
  );
}
