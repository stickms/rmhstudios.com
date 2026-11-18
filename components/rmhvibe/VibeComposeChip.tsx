import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The vibe attached to a post being written: its title, and a control to take it off. */
export function VibeComposeChip({
  title,
  onRemove,
}: {
  title: string;
  onRemove: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhvibe',
    );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="xs"
        variant="default"
        onClick={
          onRemove
        }
      >
        <Sparkles
          aria-hidden
        />
        <span className="max-w-48 truncate">
          {
            title
          }
        </span>
        <X
          aria-hidden
        />
        <span className="sr-only">
          {t(
            'vibe-chip-remove',
            {
              defaultValue:
                'Remove vibe',
            },
          )}
        </span>
      </Button>
    </div>
  );
}
