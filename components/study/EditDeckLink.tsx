import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** The owner's way from a deck page into its editor. */
export function EditDeckLink({ deckId }: { deckId: string }) {
  const { t } = useTranslation('study-editor');
  const label = t('edit-deck', { defaultValue: 'Edit deck' });
  return (
    <Link
      to="/study/$deckId/edit"
      params={{ deckId }}
      className="text-site-text-muted hover:text-site-text"
      title={label}
      aria-label={label}
    >
      <Pencil className="h-4 w-4" aria-hidden />
    </Link>
  );
}
