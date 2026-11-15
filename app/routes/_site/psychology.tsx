/**
 * /psychology — the research behind how the site behaves.
 *
 * Every entry names a finding, the people behind it, what it says, and the
 * exact place on the site that applies it, including the things the site
 * deliberately does NOT do. Portraits and their licences come from
 * lib/psychology/people.ts.
 */
import {
  createFileRoute,
  Link,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { PageLayout } from '@/components/feed/PageLayout';
import {
  buildCanonical,
  buildMeta,
} from '@/lib/seo';
import {
  CREDIT_CHANGES,
  initials,
  PEOPLE,
  type Person,
} from '@/lib/psychology/people';

export const Route =
  createFileRoute(
    '/_site/psychology',
  )(
    {
      head: () => ({
        meta: buildMeta(
          {
            title:
              'Psychology | RMH Studios',
            description:
              'The psychology research behind how RMH Studios works, the people who did it, and the things we choose not to do.',
            path: '/psychology',
          },
        ),
        links:
          [
            buildCanonical(
              '/psychology',
            ),
          ],
      }),
      component:
        PsychologyPage,
    },
  );

function Portrait({
  person,
}: {
  person: Person;
}) {
  const p =
    person.portrait;
  return (
    <span className="flex h-24 w-20 shrink-0 items-end justify-center overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
      {p ? (
        <img
          src={`/images/psychology/${person.id}.webp`}
          alt={
            person.name
          }
          width={
            p.width
          }
          height={
            p.height
          }
          loading="lazy"
          decoding="async"
          className="h-full w-auto max-w-none object-contain object-bottom"
        />
      ) : (
        <span
          aria-hidden
          className="t-meta self-center"
        >
          {initials(
            person.name,
          )}
        </span>
      )}
    </span>
  );
}

function Principle({
  people,
  title,
  children,
  where,
}: {
  people: string[];
  title: string;
  children: ReactNode;
  where: ReactNode;
}) {
  const list =
    people
      .map(
        (
          id,
        ) =>
          PEOPLE[
            id
          ],
      )
      .filter(
        (
          p,
        ): p is Person =>
          !!p,
      );
  return (
    <li className="border-b border-site-border py-5 last:border-b-0">
      <div className="flex gap-4">
        <div className="flex shrink-0 flex-col gap-2">
          {list.map(
            (
              p,
            ) => (
              <Portrait
                key={
                  p.id
                }
                person={
                  p
                }
              />
            ),
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="t-heading">
            {
              title
            }
          </h3>
          <p className="t-meta">
            {list
              .map(
                (
                  p,
                ) =>
                  `${p.name}, ${p.years}`,
              )
              .join(
                ' · ',
              )}
          </p>
          <div className="t-body space-y-2 text-site-text">
            {
              children
            }
          </div>
          <p className="t-body text-site-text-muted">
            {
              where
            }
          </p>
        </div>
      </div>
    </li>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={
        id
      }
      className="pt-8"
    >
      <h2
        id={
          id
        }
        className="t-heading pb-1"
      >
        {
          title
        }
      </h2>
      <p className="t-body pb-2 text-site-text-muted">
        {
          intro
        }
      </p>
      <ul>
        {
          children
        }
      </ul>
    </section>
  );
}

const inline =
  'underline underline-offset-2';

function PsychologyPage() {
  const {
    t,
  } =
    useTranslation(
      'psychology',
    );

  return (
    <PageLayout
      title={t(
        'title',
        {
          defaultValue:
            'Psychology',
        },
      )}
      description={t(
        'subtitle',
        {
          defaultValue:
            'The research behind how this site behaves, and the people who did it.',
        },
      )}
    >
      <div className="px-4 pb-16">
        <p className="t-prose pt-4">
          {t(
            'intro',
            {
              defaultValue:
                'A lot of how RMH Studios works comes from a century of psychology research. This page names each idea, the people behind it, what it says, and exactly where you meet it here. It also lists the techniques we have chosen not to use, because the same research can be turned against the people it describes.',
            },
          )}
        </p>

        <Section
          id="psy-play"
          title={t(
            'section-play',
            {
              defaultValue:
                'Playing, learning and coming back',
            },
          )}
          intro={t(
            'section-play-intro',
            {
              defaultValue:
                'How the site helps you finish things and keeps practice worth doing.',
            },
          )}
        >
          <Principle
            people={[
              'zeigarnik',
            ]}
            title={t(
              'zeigarnik-title',
              {
                defaultValue:
                  'The Zeigarnik effect',
              },
            )}
            where={
              <>
                {t(
                  'zeigarnik-where',
                  {
                    defaultValue:
                      'Where you see it: "Pick up where you left off" at the top of the home feed lists up to three unfinished things: a game save, a book, a draft, a deck with cards due.',
                  },
                )}{' '}
                <Link
                  to="/"
                  className={
                    inline
                  }
                >
                  {t(
                    'open-home',
                    {
                      defaultValue:
                        'Open the feed',
                    },
                  )}
                </Link>
              </>
            }
          >
            <p>
              {t(
                'zeigarnik-body',
                {
                  defaultValue:
                    'In 1927 Bluma Zeigarnik noticed that waiters remembered unpaid orders far better than paid ones, and showed in the lab that people recall interrupted tasks about twice as well as finished ones. An unfinished task keeps a small claim on attention until it is done.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'kahneman',
            ]}
            title={t(
              'peakend-title',
              {
                defaultValue:
                  'The peak-end rule',
              },
            )}
            where={t(
              'peakend-where',
              {
                defaultValue:
                  'Where you see it: the game-over screens of Void Breaker, Neon Driftway and Nightrail lead with your best moment of the run, such as your longest combo or closest calls, before the full table of numbers.',
              },
            )}
          >
            <p>
              {t(
                'peakend-body',
                {
                  defaultValue:
                    'Daniel Kahneman and colleagues found that people judge an experience mostly by its most intense moment and by how it ended, not by its average or its length. The end of a game is the part you carry away, so it should show the best of the run.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'deci',
              'ryan',
            ]}
            title={t(
              'sdt-title',
              {
                defaultValue:
                  'Self-determination theory',
              },
            )}
            where={t(
              'sdt-where',
              {
                defaultValue:
                  'Where you see it: when a run beats your record, the game-over screen tells you by how much. That line reports your skill; it is not a payout.',
              },
            )}
          >
            <p>
              {t(
                'sdt-body',
                {
                  defaultValue:
                    "Edward Deci and Richard Ryan showed that lasting motivation rests on three needs: autonomy, competence and relatedness. Mark Lepper's overjustification studies added a warning: paying people for something they already enjoy can make them enjoy it less. Feedback that tells you that you got better keeps play its own reward.",
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'hull',
            ]}
            title={t(
              'goal-title',
              {
                defaultValue:
                  'The goal-gradient effect',
              },
            )}
            where={
              <>
                {t(
                  'goal-where',
                  {
                    defaultValue:
                      'Where you see it: once a daily or weekly quest is two-thirds done, it says how many are left, such as "2 to go", instead of only "8 / 10".',
                  },
                )}{' '}
                <Link
                  to="/progress"
                  className={
                    inline
                  }
                >
                  {t(
                    'open-progress',
                    {
                      defaultValue:
                        'Open Progress',
                    },
                  )}
                </Link>
              </>
            }
          >
            <p>
              {t(
                'goal-body',
                {
                  defaultValue:
                    'In 1932 Clark Hull observed that rats in a maze ran faster the closer they got to the food. People do the same: effort rises as a goal comes into view, so the distance left is the most motivating number to show.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'nunes',
            ]}
            title={t(
              'endowed-title',
              {
                defaultValue:
                  'Endowed progress',
              },
            )}
            where={t(
              'endowed-where',
              {
                defaultValue:
                  'Where you see it: the First Week checklist starts with "Create your account" already ticked, because you have done it. The credit is real, never invented.',
              },
            )}
          >
            <p>
              {t(
                'endowed-body',
                {
                  defaultValue:
                    'Joseph Nunes and Xavier Drèze gave car-wash customers loyalty cards. A card needing eight stamps was finished by 19% of people; a card needing ten with two already stamped, the same eight washes, was finished by 34%. A goal that has visibly begun feels worth completing.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'csikszentmihalyi',
              'vygotsky',
            ]}
            title={t(
              'flow-title',
              {
                defaultValue:
                  'Flow and the zone of proximal development',
              },
            )}
            where={
              <>
                {t(
                  'flow-where',
                  {
                    defaultValue:
                      'Where you see it: the tap-the-beat lesson in RMHMusic speeds up by 8 BPM after a clean run (90 or more) and slows down after a hard one (under 60), between 64 and 96 BPM.',
                  },
                )}{' '}
                <Link
                  to="/rmhmusic"
                  className={
                    inline
                  }
                >
                  {t(
                    'open-rmhmusic',
                    {
                      defaultValue:
                        'Open RMHMusic',
                    },
                  )}
                </Link>
              </>
            }
          >
            <p>
              {t(
                'flow-body',
                {
                  defaultValue:
                    'Mihaly Csikszentmihalyi described flow, the absorbed state where challenge sits just above skill: too easy is boredom, too hard is anxiety. Lev Vygotsky said the same about learning decades earlier: the useful exercise is the one you can only just do.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'ebbinghaus',
            ]}
            title={t(
              'spacing-title',
              {
                defaultValue:
                  'The forgetting curve and spaced repetition',
              },
            )}
            where={
              <>
                {t(
                  'spacing-where',
                  {
                    defaultValue:
                      'Where you see it: RMHStudy decks and RMHMusic practice schedule each card for the moment you are about to forget it.',
                  },
                )}{' '}
                <Link
                  to="/study"
                  className={
                    inline
                  }
                >
                  {t(
                    'open-study',
                    {
                      defaultValue:
                        'Open RMHStudy',
                    },
                  )}
                </Link>
              </>
            }
          >
            <p>
              {t(
                'spacing-body',
                {
                  defaultValue:
                    'Hermann Ebbinghaus memorised thousands of nonsense syllables and measured how fast he forgot them. Memory fades on a steep curve, and each well-timed review flattens it, so reviews spaced further and further apart keep material with the least effort.',
                },
              )}
            </p>
          </Principle>
        </Section>

        <Section
          id="psy-social"
          title={t(
            'section-social',
            {
              defaultValue:
                'Other people',
            },
          )}
          intro={t(
            'section-social-intro',
            {
              defaultValue:
                'How the site compares you with others, and the people it creates.',
            },
          )}
        >
          <Principle
            people={[
              'festinger',
              'marsh',
            ]}
            title={t(
              'comparison-title',
              {
                defaultValue:
                  'Social comparison and the big-fish-little-pond effect',
              },
            )}
            where={
              <>
                {t(
                  'comparison-where',
                  {
                    defaultValue:
                      'Where you see it: if you are outside the top 100 on the leaderboard, "Around your rank" shows you with the two players just above and below you.',
                  },
                )}{' '}
                <Link
                  to="/arcade"
                  className={
                    inline
                  }
                >
                  {t(
                    'open-arcade',
                    {
                      defaultValue:
                        'Open the Arcade',
                    },
                  )}
                </Link>
              </>
            }
          >
            <p>
              {t(
                'comparison-body',
                {
                  defaultValue:
                    'Leon Festinger proposed in 1954 that people judge themselves by comparison with others, and most usefully with others close to them. Herbert Marsh found the other side: measured against a field far above them, capable people rate themselves lower and try less. A top 100 you are nowhere near only discourages; the people one place ahead are a goal.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'norton',
            ]}
            title={t(
              'labor-title',
              {
                defaultValue:
                  'The labor illusion and the IKEA effect',
              },
            )}
            where={t(
              'labor-where',
              {
                defaultValue:
                  'Where you see it: while "Ask the feed" works, it says what it is doing (searching public posts and reading up to 60 of them), and afterwards how many posts it read. Profile customisation and User Builds rest on the IKEA effect.',
              },
            )}
          >
            <p>
              {t(
                'labor-body',
                {
                  defaultValue:
                    'Michael Norton and colleagues found that people value a result more when they can see the work behind it, even when it takes longer, and that people value what they helped build, from flat-pack furniture to origami, more than the same thing made for them. The work shown must be the real work.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'jung',
            ]}
            title={t(
              'jung-title',
              {
                defaultValue:
                  'Archetypes',
              },
            )}
            where={t(
              'jung-where',
              {
                defaultValue:
                  'Where you see it: every AI account in the feed is built around one archetype (the Sage, the Trickster, the Hero, the Caregiver, the Child or the Wanderer), which keeps its voice consistent from post to post. AI accounts always carry an Automated badge.',
              },
            )}
          >
            <p>
              {t(
                'jung-body',
                {
                  defaultValue:
                    'Carl Jung described archetypes: recurring figures such as the wise old man, the trickster and the hero that appear in stories everywhere and that people recognise at once. A character built on one reads as a person rather than a list of traits.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'winnicott',
              'seligman',
            ]}
            title={t(
              'holding-title',
              {
                defaultValue:
                  'The holding environment and learned helplessness',
              },
            )}
            where={t(
              'holding-where',
              {
                defaultValue:
                  'Where you see it: error pages never blame you and always offer a next step, such as trying again, going home or exploring. Empty states point somewhere, such as "Find people" on an empty friends leaderboard.',
              },
            )}
          >
            <p>
              {t(
                'holding-body',
                {
                  defaultValue:
                    'The psychoanalyst Donald Winnicott wrote about the holding environment: a calm, reliable setting in which a person feels safe enough to try things. Martin Seligman showed the opposite: when nothing a person does seems to matter, they stop trying. A dead end teaches helplessness; a way forward keeps people going.',
                },
              )}
            </p>
          </Principle>
        </Section>

        <Section
          id="psy-design"
          title={t(
            'section-design',
            {
              defaultValue:
                'Design and speed',
            },
          )}
          intro={t(
            'section-design-intro',
            {
              defaultValue:
                "The perception research behind the Steel design and the site's performance work.",
            },
          )}
        >
          <Principle
            people={[
              'wertheimer',
              'koffka',
            ]}
            title={t(
              'gestalt-title',
              {
                defaultValue:
                  'Gestalt grouping',
              },
            )}
            where={t(
              'gestalt-where',
              {
                defaultValue:
                  'Where you see it: Steel separates things with a thin rule or with space instead of boxes, so groups form by nearness and alignment.',
              },
            )}
          >
            <p>
              {t(
                'gestalt-body',
                {
                  defaultValue:
                    'Max Wertheimer and Kurt Koffka showed that the eye groups what is close together, aligned or enclosed before it reads any detail. Spacing alone says what belongs together; a box around every group is noise.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'restorff',
            ]}
            title={t(
              'restorff-title',
              {
                defaultValue:
                  'The isolation effect',
              },
            )}
            where={t(
              'restorff-where',
              {
                defaultValue:
                  'Where you see it: each view has one solid ink button for its main action; everything else is outlined or plain.',
              },
            )}
          >
            <p>
              {t(
                'restorff-body',
                {
                  defaultValue:
                    'Hedwig von Restorff found in 1933 that an item that differs from everything around it is the one people remember. One distinct button marks the main action; two distinct buttons cancel each other out.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'hick',
              'miller',
            ]}
            title={t(
              'hick-title',
              {
                defaultValue:
                  "Hick's law and working memory",
              },
            )}
            where={t(
              'hick-where',
              {
                defaultValue:
                  'Where you see it: short lists where a choice is made, such as at most three rows in "Pick up where you left off" and five rows in "Around your rank".',
              },
            )}
          >
            <p>
              {t(
                'hick-body',
                {
                  defaultValue:
                    'W. E. Hick measured that the time to choose grows with the number of choices. George Miller showed that working memory holds only a handful of items at once; later work puts it nearer four. Fewer, better options are faster to choose from.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'fitts',
            ]}
            title={t(
              'fitts-title',
              {
                defaultValue:
                  "Fitts's law",
              },
            )}
            where={t(
              'fitts-where',
              {
                defaultValue:
                  'Where you see it: controls are at least 36px high, and 44px on touch screens. The link prefetcher treats every link as 8px wider on each side when predicting where your pointer is heading.',
              },
            )}
          >
            <p>
              {t(
                'fitts-body',
                {
                  defaultValue:
                    'Paul Fitts showed in 1954 that the time to reach a target grows with its distance and shrinks with its size. Small, far targets are slow to hit.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'doherty',
            ]}
            title={t(
              'doherty-title',
              {
                defaultValue:
                  'The Doherty threshold',
              },
            )}
            where={t(
              'doherty-where',
              {
                defaultValue:
                  'Where you see it: the site starts loading a page while your pointer is still on its way to the link, or when your finger touches it, and only shows a loading skeleton if a page takes longer than 400 ms.',
              },
            )}
          >
            <p>
              {t(
                'doherty-body',
                {
                  defaultValue:
                    'Walter Doherty and Ahrvind Thadani at IBM found in 1982 that people stay engaged and work faster when a computer answers in under about 400 ms. Above it, attention starts to wander.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'weber',
              'fechner',
            ]}
            title={t(
              'weber-title',
              {
                defaultValue:
                  'The Weber–Fechner law',
              },
            )}
            where={t(
              'weber-where',
              {
                defaultValue:
                  "Where you see it: the site's performance budget reports every change as a percentage of the whole page, because the same number of kilobytes matters more on a small page than on a large one.",
              },
            )}
          >
            <p>
              {t(
                'weber-body',
                {
                  defaultValue:
                    'Ernst Weber and Gustav Fechner found that the smallest change people notice is a fixed fraction of what is already there, not a fixed amount. A page that loads 100 ms faster feels very different at 300 ms and not at all at 5 seconds.',
                },
              )}
            </p>
          </Principle>
        </Section>

        <Section
          id="psy-avoid"
          title={t(
            'section-avoid',
            {
              defaultValue:
                'What we choose not to do',
            },
          )}
          intro={t(
            'section-avoid-intro',
            {
              defaultValue:
                'The same research can make a product harder to put down without making it better. These are the techniques we leave out.',
            },
          )}
        >
          <Principle
            people={[
              'skinner',
            ]}
            title={t(
              'skinner-title',
              {
                defaultValue:
                  'Variable-ratio rewards',
              },
            )}
            where={t(
              'skinner-where',
              {
                defaultValue:
                  'What we do: we add no new random rewards. The spinning wheel and the casino games are the only ones, and they stay where you choose to go to them.',
              },
            )}
          >
            <p>
              {t(
                'skinner-body',
                {
                  defaultValue:
                    'B. F. Skinner found that rewards delivered at unpredictable intervals produce the most persistent behaviour of any schedule. It is the mechanism of slot machines and endless feeds, which is exactly why we do not spread it through the site.',
                },
              )}
            </p>
          </Principle>

          <Principle
            people={[
              'kahneman',
              'tversky',
            ]}
            title={t(
              'loss-title',
              {
                defaultValue:
                  'Loss aversion',
              },
            )}
            where={t(
              'loss-where',
              {
                defaultValue:
                  'What we do: the streak reminder states the fact ("Your 7-day streak continues if you check in today") with no fire emoji, no countdown and no threat. Freeze tokens cover days you miss.',
              },
            )}
          >
            <p>
              {t(
                'loss-body',
                {
                  defaultValue:
                    'Daniel Kahneman and Amos Tversky showed that a loss weighs about twice as much as an equal gain. A reminder framed as "you are about to lose your streak" is the strongest lever a site has, and it works by making people anxious.',
                },
              )}
            </p>
          </Principle>
        </Section>

        <section
          aria-labelledby="psy-credits"
          className="pt-10"
        >
          <h2
            id="psy-credits"
            className="t-heading pb-1"
          >
            {t(
              'credits-title',
              {
                defaultValue:
                  'Image credits',
              },
            )}
          </h2>
          <p className="t-body pb-3 text-site-text-muted">
            {t(
              'credits-intro',
              {
                defaultValue:
                  'Portraits are from Wikimedia Commons. Where no freely licensed photograph exists, the page shows initials instead.',
              },
            )}{' '}
            {
              CREDIT_CHANGES
            }
          </p>
          <ul className="t-meta space-y-1">
            {Object.values(
              PEOPLE,
            ).flatMap(
              (
                p,
              ) =>
                p.portrait
                  ? [
                      <li
                        key={
                          p.id
                        }
                      >
                        {
                          p.name
                        }
                        :{' '}
                        {
                          p
                            .portrait
                            .author
                        }
                        ,{' '}
                        <a
                          href={
                            p
                              .portrait
                              .source
                          }
                          className={
                            inline
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {
                            p
                              .portrait
                              .license
                          }
                        </a>
                      </li>,
                    ]
                  : [],
            )}
          </ul>
        </section>
      </div>
    </PageLayout>
  );
}
