'use client';

/**
 * Credits.
 *
 * The attribution line is quoted from the design doc §0.3 word for word and is
 * the ONLY place in shipped UI where the source is named. It is a statement of
 * lineage, not an endorsement, and it stays exactly as written — shortening it
 * to "inspired by" would change what it claims.
 */

import { useTranslation } from 'react-i18next';
import { PaperCard, StickyNote } from '../paper/PaperSurface';
import { ScreenFrame } from './ScreenFrame';

interface CreditsScreenProps {
  onBack: () => void;
}

export function CreditsScreen({ onBack }: CreditsScreenProps) {
  const { t } = useTranslation('c-bums-rush');

  return (
    <ScreenFrame
      title={t('credits.title', { defaultValue: 'Credits' })}
      width="narrow"
      onBack={onBack}
      backLabel={t('nav.back', { defaultValue: 'Back' })}
    >
      <div className="space-y-[clamp(0.75rem,2vmin,1.25rem)]">
        <PaperCard tilt={-0.9} taped className="p-[clamp(1rem,3vmin,2rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('credits.made-by', { defaultValue: 'Made at RMH Studios' })}
          </h2>
          <p className="mt-2 text-sm text-bum-graphite">
            {t('credits.body', {
              defaultValue:
                'Drawn, coded and playtested in-house. Every head, hat and level in this game is ours.',
            })}
          </p>
        </PaperCard>

        <StickyNote className="rotate-[0.8deg]">
          <p className="text-sm text-bum-ink">
            {t('credits.attribution', {
              defaultValue:
                'A physics party game in the tradition of Heave Ho by Le Cartel Studio. Unaffiliated.',
            })}
          </p>
        </StickyNote>

        <PaperCard className="p-[clamp(0.875rem,2.5vmin,1.5rem)]">
          <h2 className="text-lg font-semibold text-bum-ink">
            {t('credits.tech', { defaultValue: 'Built with' })}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-bum-graphite">
            <li>matter-js</li>
            <li>React · TanStack Start · Vite</li>
            <li>Socket.IO</li>
          </ul>
        </PaperCard>
      </div>
    </ScreenFrame>
  );
}
