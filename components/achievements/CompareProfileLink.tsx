import { Link } from '@tanstack/react-router';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';

/** The profile's way into `/progress/compare` for this member. Its own component so the key reaches the extractor. */
export function CompareProfileLink({ handle, id }: { handle?: string | null; id: string }) {
  const { t } = useTranslation('achievement-compare');
  return (
    <IconButton asChild label={t('profile-link', { defaultValue: 'Compare achievements' })}>
      <Link to="/progress/compare" search={{ with: handle || id }}>
        <Trophy aria-hidden />
      </Link>
    </IconButton>
  );
}
