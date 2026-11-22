import { Link } from '@tanstack/react-router';
import { ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** The way from a deck page into its practice test. */
export function PracticeTestLink({ deckId }: { deckId: string }) {
  const { t } = useTranslation('study-tests');
  return (
    <Button asChild variant="default" className="w-full gap-2">
      <Link to="/study/$deckId/practice" params={{ deckId }}>
        <ClipboardCheck className="h-4 w-4" aria-hidden />
        {t('practice-test', { defaultValue: 'Practice test' })}
      </Link>
    </Button>
  );
}
