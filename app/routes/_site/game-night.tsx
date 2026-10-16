import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { GameNightBoard } from '@/components/competitive/GameNightBoard';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/game-night')({
  head: () => ({
    meta: buildMeta({
      title: 'Game Night | RMH Studios',
      description:
        'A weekly lobby that rotates through party games. See what is on now and what is next.',
      path: '/game-night',
    }),
    links: [buildCanonical('/game-night')],
  }),
  component: GameNightPage,
});

function GameNightPage() {
  const { t } = useTranslation('f-competitive');
  return (
    <PageLayout
      title={t('gn-title', { defaultValue: 'Game night' })}
      description={t('gn-desc', {
        defaultValue: 'A weekly rotation of party games, one lobby at a time.',
      })}
      wide
    >
      <GameNightBoard />
    </PageLayout>
  );
}
