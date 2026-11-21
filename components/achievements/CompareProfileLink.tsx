import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** The profile's way into `/progress/compare` for this member. Its own component so the key reaches the extractor. */
export function CompareProfileLink({ handle, id }: { handle?: string | null; id: string }) {
  const { t } = useTranslation('achievement-compare');
  return (
    <Button asChild variant="ghost">
      <Link to="/progress/compare" search={{ with: handle || id }}>
        {t('profile-link', { defaultValue: 'Compare achievements' })}
      </Link>
    </Button>
  );
}
