import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { Terminal, BookOpen, ExternalLink } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { KeysManager } from '@/components/developer/KeysManager';
import { RecipesManager } from '@/components/developer/RecipesManager';
import { BadgeSnippets } from '@/components/developer/BadgeSnippets';
import { AiPracticesLink } from '@/components/developer/AiPracticesLink';
import { PageLayout } from '@/components/feed/PageLayout';
import { DEVELOPER_DOCS_URL } from '@/lib/docs-site';

export const Route = createFileRoute('/_site/developer/')({
  head: () => ({
    meta: buildMeta({
      title: 'Developer API | RMH Studios',
      description:
        'Build on RMH Studios: scoped API keys, a documented REST API, webhooks and usage quotas.',
      path: '/developer',
    }),
    links: [buildCanonical('/developer')],
  }),
  component: DeveloperHome,
});

function DeveloperHome() {
  const { t } = useTranslation('site');
  const { data: session, isPending } = useSession();

  return (
    <PageLayout
      title={t('developer-title', { defaultValue: 'Developer API' })}
      wide
      headerRight={
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="/api/v1/openapi.json">
              <Terminal aria-hidden /> {t('developer-openapi', { defaultValue: 'OpenAPI spec' })}
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={DEVELOPER_DOCS_URL} target="_blank" rel="noreferrer">
              <BookOpen aria-hidden /> {t('developer-docs', { defaultValue: 'Docs' })}
              <ExternalLink aria-hidden />
              <span className="sr-only">
                {t('developer-opens-new-tab', { defaultValue: '(opens in a new tab)' })}
              </span>
            </a>
          </Button>
        </div>
      }
    >
      <div className="space-y-[var(--site-section-gap)] px-4 pt-4 pb-12">
        <p className="max-w-prose text-sm leading-relaxed text-site-text-muted">
          {t('developer-intro', {
            defaultValue:
              'Build on RMH Studios programmatically. The REST API is available to HARD-R subscribers and above. Create a scoped key below, then read the documentation or point your codegen at the OpenAPI spec.',
          })}
        </p>

        <AiPracticesLink />

        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <SignedOutPrompt
            icon={Terminal}
            callbackURL="/developer"
            title={t('developer-sign-in', { defaultValue: 'Sign in to manage developer keys' })}
          />
        ) : (
          <>
            <KeysManager />
            <RecipesManager />
            <BadgeSnippets userId={session.user.id} />
          </>
        )}
      </div>
    </PageLayout>
  );
}
