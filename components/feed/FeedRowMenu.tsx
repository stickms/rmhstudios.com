import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { translatePostApi } from '@/lib/ai/ai.contract';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import type { FeedItem } from '@/lib/feed-types';
import { LOCALE_TO_LANGUAGE_NAME } from '@/lib/i18n/config';
import { toast } from '@/lib/toast';
import { useFeedStore } from '@/stores/feedStore';
import { useLocaleStore } from '@/stores/localeStore';
import { RMHarkOverflowPanel } from './RMHarkOverflowMenu';

interface FeedRowMenuProps {
  item: FeedItem;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * The translated text to show under the post and the language it is in, or null to show the original alone. The row
   * shows it only while that is still the site's language.
   */
  onTranslation: (translation: { text: string; locale: string } | null) => void;
}

/**
 * What the three dots on a home feed row open. Its own chunk: `FeedRow` fetches it the first time a menu is opened, so
 * the menu's rows, dialogs and the translate call stay off the home page's critical path.
 *
 * It is the same panel the post card and the post page use (`RMHarkOverflowPanel`), wired to the feed store the row is
 * drawn from: an edit, a pin or a bookmark updates the row, and a delete, mute or block removes it.
 */
export default function FeedRowMenu({ item, open, onClose, anchorRef, onTranslation }: FeedRowMenuProps) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const locale = useLocaleStore((s) => s.locale);
  const updateItem = useFeedStore((s) => s.updateItem);
  const removeItem = useFeedStore((s) => s.removeItem);
  const actualId = item.actualId ?? item.id;
  // A translation is into the site's language: one made for another language is not this one's.
  const [made, setMade] = useState<{ text: string; locale: string } | null>(null);
  const translated = made && made.locale === locale ? made.text : null;
  const [shown, setShown] = useState(false);
  const showing = shown && translated !== null;
  const [translating, setTranslating] = useState(false);

  const toggleTranslation = async () => {
    if (translated) {
      onTranslation(showing ? null : { text: translated, locale });
      setShown(!showing);
      return;
    }
    setTranslating(true);
    try {
      const data = await api(translatePostApi, {
        params: { id: actualId },
        query: { to: LOCALE_TO_LANGUAGE_NAME[locale] },
        timeoutMs: AI_TIMEOUT_MS,
      });
      if (data.text) {
        setMade({ text: data.text, locale });
        setShown(true);
        onTranslation({ text: data.text, locale });
      }
    } catch {
      toast.error(t('translate-error', { defaultValue: 'Could not translate this post.' }));
    } finally {
      setTranslating(false);
    }
  };

  return (
    <RMHarkOverflowPanel
      item={item}
      isAuthor={session?.user?.id === item.user?.id}
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      onUpdate={(updates) => updateItem(item.id, updates)}
      onRemove={() => removeItem(item.id)}
      translate={{ translating, hasTranslation: translated !== null, showing, onToggle: toggleTranslation }}
    />
  );
}
