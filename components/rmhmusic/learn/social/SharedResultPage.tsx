/**
 * A shared result's public page (RMH Music Phase 6, plan 1.4): `/rmhmusic/r/$token`.
 *
 * Signed out or in, a small page of notebook paper in the app's look (static paper: no animated
 * backdrop): the result as a heading and lines built from the stored snapshot (never client text),
 * the name and picture only when the link shows them ("A learner" otherwise), and one primary
 * link, Try RMH Music. A signed-in viewer also gets "Play today's challenge" on today's Daily
 * result and a Report text button. A link that cannot be seen, for any reason, says one generic
 * sentence. The data comes from the route loader (`musicSharedResultQuery`).
 */
import {
  lazy,
  Suspense,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { musicSharedResultQuery } from '@/lib/music-social/music-social.queries';
import type { SharedResultView } from '@/lib/music-social/share.contract';
import {
  PRIMARY_BUTTON,
  TEXT_BUTTON,
} from '../buttons';
import { ModeToggle } from '../ModeToggle';
import { Notehead } from '../Notehead';
import { learnerName } from './board-text';
import { shareText } from './share-text';

// Lazy, as everywhere else it mounts: the dialog validates with the report route's zod schema.
const ReportDialog =
  lazy(
    () =>
      import('@/components/moderation/ReportDialog').then(
        (
          m,
        ) => ({
          default:
            m.ReportDialog,
        }),
      ),
  );

export function SharedResultPage({
  token,
}: {
  token: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const {
    data: session,
  } =
    useSession();
  const {
    data: view,
  } =
    useQuery(
      musicSharedResultQuery(
        token,
      ),
    );
  const [
    reporting,
    setReporting,
  ] =
    useState(
      false,
    );
  const signedIn =
    !!session?.user;
  const live =
    view?.state ===
    'live'
      ? view
      : null;

  const tryIt =
    (
      <Link
        to="/rmhmusic"
        className={
          PRIMARY_BUTTON
        }
      >
        {t(
          'share-try',
          {
            defaultValue:
              'Try RMH Music',
          },
        )}
      </Link>
    );

  return (
    <div className="app-page">
      <div className="rmm-column mx-auto flex w-full max-w-xl flex-1 flex-col pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))]">
        <header className="flex flex-wrap items-center justify-between gap-2 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to="/rmhmusic"
            className="-ms-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-app-sm px-3 py-2 text-sm font-medium text-app-text-muted transition-colors hover:text-app-text"
          >
            <ArrowLeft
              className="h-4 w-4 shrink-0 rtl-flip"
              aria-hidden="true"
            />
            <span>
              {t(
                'share-app-name',
                {
                  defaultValue:
                    'RMH Music',
                },
              )}
            </span>
          </Link>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <ModeToggle />
          </div>
        </header>

        <main className="flex-1 space-y-4 pt-3 pb-8">
          {live ? (
            <SharedResult
              view={
                live
              }
              language={
                i18n.language
              }
            />
          ) : (
            <div className="rmm-sheet space-y-2 p-6">
              <h1 className="rmm-display text-[2rem] leading-10 text-app-text">
                {t(
                  'share-gone-title',
                  {
                    defaultValue:
                      'This result is no longer shared',
                  },
                )}
              </h1>
              <p className="text-base leading-6 text-app-text-muted">
                {t(
                  'share-gone-body',
                  {
                    defaultValue:
                      'The link has stopped working. RMH Music teaches reading music and playing it, one short lesson at a time.',
                  },
                )}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {
              tryIt
            }
            {live &&
            signedIn &&
            live.today ? (
              <Link
                to="/rmhmusic/sprint"
                className={
                  TEXT_BUTTON
                }
              >
                {t(
                  'share-play-today',
                  {
                    defaultValue:
                      "Play today's challenge",
                  },
                )}
              </Link>
            ) : null}
            {live &&
            signedIn ? (
              <button
                type="button"
                onClick={() =>
                  setReporting(
                    true,
                  )
                }
                className={
                  TEXT_BUTTON
                }
              >
                {t(
                  'share-report',
                  {
                    defaultValue:
                      'Report',
                  },
                )}
              </button>
            ) : null}
          </div>
        </main>
      </div>
      {live &&
      reporting ? (
        <Suspense
          fallback={
            null
          }
        >
          <ReportDialog
            open
            onOpenChange={(
              open,
            ) => {
              if (
                !open
              )
                setReporting(
                  false,
                );
            }}
            entityType="music-share"
            entityId={
              live.id
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function SharedResult({
  view,
  language,
}: {
  view: Extract<
    SharedResultView,
    {
      state: 'live';
    }
  >;
  language: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const lines =
    shareText(
      t,
      language,
      view.payload,
    );
  const name =
    learnerName(
      t,
      view.name,
    );
  return (
    <article className="rmm-sheet divide-y divide-app-border">
      <div className="space-y-2 p-6">
        <p className="text-base leading-6 text-app-text-muted">
          {
            lines.lead
          }
        </p>
        <h1 className="rmm-display text-[2.5rem] leading-[3rem] text-app-text">
          {
            lines.title
          }
        </h1>
        <p className="text-base leading-6 text-app-text">
          {
            lines.subtitle
          }
        </p>
        <p
          className="flex items-center gap-1"
          role="img"
          aria-label={
            lines.stars
          }
        >
          {[
            0,
            1,
            2,
          ].map(
            (
              i,
            ) => (
              <Notehead
                key={
                  i
                }
                kind={
                  i <
                  view
                    .payload
                    .stars
                    ? 'filled'
                    : 'open'
                }
                className="h-4 w-6 text-app-accent"
              />
            ),
          )}
        </p>
      </div>
      <div className="flex items-center gap-3 px-6 py-4">
        {/* No picture stands in for "A learner": a placeholder face would read as someone's. */}
        {view.name ? (
          <UserAvatar
            src={
              view.image
            }
            alt=""
            size={
              32
            }
            fallbackName={
              name
            }
          />
        ) : null}
        <p className="min-w-0 truncate text-base leading-6 text-app-text">
          {
            name
          }
        </p>
      </div>
    </article>
  );
}
