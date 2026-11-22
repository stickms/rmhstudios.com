import { useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { useReadingFollow } from '@/components/reading/useReadingFollow';

/**
 * "Follow a tag": a menu of the Log's tags, each a toggle with a check when followed. Members only, and nothing
 * for a Log without tags.
 */
export function FollowTagMenu({ tags, className }: { tags: readonly string[]; className?: string }) {
  const { t } = useTranslation('subscriptions');
  const { signedIn, loading, find, toggle } = useReadingFollow();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!signedIn || tags.length === 0) return null;
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="default"
        size="sm"
        className={className}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
      >
        <Tag aria-hidden />
        {t('follow-a-tag', {
          defaultValue: 'Follow a tag',
        })}
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        label={t('tags-label', {
          defaultValue: 'Tags',
        })}
        className="w-56"
      >
        {tags.map((tag) => (
          <MenuItem
            key={tag}
            checked={!!find('blog_tag', tag)}
            onSelect={() => {
              setOpen(false);
              void toggle('blog_tag', tag);
            }}
          >
            #{tag}
          </MenuItem>
        ))}
      </AnchoredMenu>
    </>
  );
}
