import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The right-hand pane for library pages that bring their own content (a guide, the
 * Slice It! hub). Gives them the heading and a way back; the content itself is
 * existing site components, brought onto the Steam palette by `.stm-legacy`.
 */
export function SteamPane({
  title,
  backTo = '/games',
  hero,
  children,
}: {
  title?: string;
  backTo?: string;
  /** A hero (`GameHero` + `GamePlayBar`) drawn above the content; it carries the page's `<h1>`, so `title` is not drawn. */
  hero?: React.ReactNode;
  children: React.ReactNode;
}) {
  const {
    t,
  } =
    useTranslation(
      'games-hub',
    );
  if (
    hero
  ) {
    return (
      <article className="stm-hub">
        <Link
          to={
            backTo
          }
          className="stm-back"
        >
          <ArrowLeft
            aria-hidden
          />
          {t(
            'steam-back',
            {
              defaultValue:
                'Back',
            },
          )}
        </Link>
        {
          hero
        }
        <div className="stm-pane-page">
          <div className="stm-legacy">
            {
              children
            }
          </div>
        </div>
      </article>
    );
  }
  return (
    <section className="stm-pane-page">
      <Link
        to={
          backTo
        }
        className="stm-back"
      >
        <ArrowLeft
          aria-hidden
        />
        {t(
          'steam-back',
          {
            defaultValue:
              'Back',
          },
        )}
      </Link>
      {title ? (
        <h1 className="stm-pane-title">
          {
            title
          }
        </h1>
      ) : null}
      <div className="stm-legacy">
        {
          children
        }
      </div>
    </section>
  );
}
