'use client';

/**
 * /sohumbum — a standing review of one user's stated 2030 pledge.
 *
 * Structurally a pastiche of the single-purpose countdown-and-criticism page:
 * sticky nav, one enormous question, a four-box countdown, a numbered ledger,
 * a short third-person write-up, a slab footer. The register is deliberately
 * flat — the joke only lands if the page never winks.
 *
 * The look lives in `sohumbum.css` and the storm in `StormCanvas.tsx`.
 *
 * Every `t()` below is called with a LITERAL key, even where a data table would
 * have read better. `i18next-parser` is a static scanner: `t(item.key, …)` over
 * an array of `{ key, label }` extracts nothing, the keys never reach
 * `locales/`, and every non-English locale silently serves the English
 * `defaultValue` forever. The tables hold structure; the copy stays inline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCountdown } from '@/hooks/useCountdown';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { StormCanvas } from './StormCanvas';
import { playThunder, unlockThunder } from './thunder';

/** The pledge deadline: midnight, January 1st 2030, US Eastern. */
const DEADLINE = new Date('2030-01-01T00:00:00-05:00');

/** The date the pledge went on the record, for the elapsed-days figure. */
const PLEDGE_MADE = new Date('2026-01-04T00:00:00-05:00');

const SUBJECT_HANDLE = 'superflameaura';

interface PledgeTerm {
  id: string;
  claim: string;
  status: string;
  note: string;
}

interface Figure {
  id: string;
  label: string;
  value: string;
  subject?: boolean;
}

export function SohumBumPage() {
  const { t } = useTranslation('r-sohumbum');
  const reducedMotion = useReducedMotion();
  const [soundOn, setSoundOn] = useState(false);

  const { days, hours, minutes, seconds, expired, ready } = useCountdown(DEADLINE);

  // Same `ready` gate as the countdown: this is derived from `Date.now()`, so
  // rendering it before mount is a hydration mismatch waiting for a day
  // boundary to land between the server response and the client's first paint.
  const elapsedDays = ready
    ? Math.max(0, Math.floor((Date.now() - PLEDGE_MADE.getTime()) / 86_400_000))
    : null;

  // Reduced motion kills the storm, and the storm is the only sound source.
  useEffect(() => {
    if (reducedMotion) setSoundOn(false);
  }, [reducedMotion]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      if (on) return false;
      return unlockThunder();
    });
  }, []);

  const handleStrike = useCallback(() => {
    if (soundOn) playThunder();
  }, [soundOn]);

  const nav = [
    { href: '#employment', label: t('nav-employment', { defaultValue: 'Employment' }) },
    { href: '#rizz', label: t('nav-rizz', { defaultValue: 'Rizz' }) },
    { href: '#dependents', label: t('nav-dependents', { defaultValue: 'Dependents' }) },
    { href: '#assets', label: t('nav-assets', { defaultValue: 'Assets' }) },
  ];

  const units = [
    { id: 'days', label: t('unit-days', { defaultValue: 'Days' }), value: days },
    { id: 'hours', label: t('unit-hours', { defaultValue: 'Hours' }), value: hours },
    { id: 'minutes', label: t('unit-minutes', { defaultValue: 'Minutes' }), value: minutes },
    { id: 'seconds', label: t('unit-seconds', { defaultValue: 'Seconds' }), value: seconds },
  ];

  const terms: PledgeTerm[] = useMemo(
    () => [
      {
        id: 'employment',
        claim: t('term-1-claim', { defaultValue: 'He will get a job.' }),
        status: t('term-1-status', { defaultValue: 'No progress' }),
        note: t('term-1-note', {
          defaultValue:
            'His résumé was last revised in 2021. It lists Microsoft Word twice — once under Skills and once under Software — and closes on the line "detail-orientated". Four applications have been submitted since the pledge, three of them to the same posting, which has since been filled by somebody else. He describes his present situation as "between opportunities", a construction that requires a prior opportunity.',
        }),
      },
      {
        id: 'rizz',
        claim: t('term-2-claim', { defaultValue: 'He will get a girl.' }),
        status: t('term-2-status', { defaultValue: 'Unverified' }),
        note: t('term-2-note', {
          defaultValue:
            'The subject reports an ongoing situation. The situation has been ongoing for nineteen months and has not, at time of review, involved a second party. His longest recorded conversation with a woman he is not related to ran four minutes, took place at a Chipotle, and concerned the chicken. He maintains that she started it. She did. She was taking his order.',
        }),
      },
      {
        id: 'dependents',
        claim: t('term-3-claim', {
          defaultValue: 'He will not have three baby mamas and be failing to pay child support.',
        }),
        status: t('term-3-status', { defaultValue: 'Disputed' }),
        note: t('term-3-note', {
          defaultValue:
            'The subject puts this figure at zero and has volunteered it, unprompted, on two separate occasions as evidence of good character. This page notes that it is the least impressive way anybody has ever cleared a bar. It further notes that a man cannot fail to pay child support on an annual income of zero dollars — the money has to exist before it can go unpaid. Meeting a requirement by having no means to breach it is not compliance. It is a rounding error.',
        }),
      },
      {
        id: 'assets',
        claim: t('term-4-claim', {
          defaultValue: 'He will not live at home. He will own a house.',
        }),
        status: t('term-4-status', { defaultValue: 'No progress' }),
        note: t('term-4-note', {
          defaultValue:
            'He continues to reside in the finished basement of a house he does not own, under a lease he has described in writing as "implied". His down-payment fund stands at $312.00, down from $340.00 after a Steam sale he has declined to discuss. He has, however, viewed forty-one listings in neighbourhoods he could not afford in either of two lifetimes, and has twice used the phrase "when I close".',
        }),
      },
    ],
    [t],
  );

  const figures: Figure[] = useMemo(
    () => [
      {
        id: 'applications',
        label: t('fig-applications', { defaultValue: 'Applications submitted since the pledge' }),
        value: '4',
        subject: true,
      },
      {
        id: 'duplicates',
        label: t('fig-duplicates', { defaultValue: 'Of those, sent to the same posting' }),
        value: '3',
      },
      {
        id: 'interviews',
        label: t('fig-interviews', { defaultValue: 'Interviews granted' }),
        value: '0',
      },
      {
        id: 'unread',
        label: t('fig-unread', { defaultValue: 'Unread recruiter emails' }),
        value: '1,284',
      },
      {
        id: 'commute',
        label: t('fig-commute', { defaultValue: 'Commute, bed to desk' }),
        value: '1.4 m',
      },
      { id: 'rent', label: t('fig-rent', { defaultValue: 'Rent paid, lifetime' }), value: '$0.00' },
      { id: 'fund', label: t('fig-fund', { defaultValue: 'Down-payment fund' }), value: '$312.00' },
      {
        id: 'claimed',
        label: t('fig-claimed', { defaultValue: 'Dependents claimed' }),
        value: '0',
      },
      {
        id: 'supported',
        label: t('fig-supported', { defaultValue: 'Dependents supported' }),
        value: '0',
      },
      {
        id: 'hours',
        label: t('fig-hours', {
          defaultValue: 'Hours logged in games on this website, same period',
        }),
        value: '2,190',
      },
    ],
    [t],
  );

  return (
    <div className="sohumbum">
      <StormCanvas disabled={reducedMotion} onStrike={handleStrike} />

      <nav className="sohumbum-nav" aria-label={t('nav-label', { defaultValue: 'Sections' })}>
        <div className="sohumbum-nav__inner">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="sohumbum-nav__link">
              {item.label}
            </a>
          ))}
          <button
            type="button"
            className="sohumbum-nav__sound"
            data-on={soundOn ? 'true' : 'false'}
            aria-pressed={soundOn}
            onClick={toggleSound}
            disabled={reducedMotion}
            aria-label={
              soundOn
                ? t('sound-off', { defaultValue: 'Mute thunder' })
                : t('sound-on', { defaultValue: 'Unmute thunder' })
            }
          >
            {soundOn ? <Volume2 aria-hidden size={18} /> : <VolumeX aria-hidden size={18} />}
          </button>
        </div>
      </nav>

      <main className="sohumbum-main">
        <h1 className="sohumbum-title">
          {t('title', { defaultValue: 'Is Sohum Joshi A Bum Yet?' })}
        </h1>

        <div
          className="sohumbum-countdown"
          role="timer"
          aria-label={t('countdown-label', {
            defaultValue: 'Time remaining until January 1st, 2030',
          })}
        >
          {units.map((unit) => (
            <div key={unit.id} className="sohumbum-box">
              <span className="sohumbum-box__value">
                {ready ? String(unit.value).padStart(2, '0') : '--'}
              </span>
              <p className="sohumbum-box__label">{unit.label}</p>
            </div>
          ))}
        </div>

        <div className="sohumbum-body">
          <p>
            {expired
              ? t('deadline-passed', {
                  defaultValue:
                    'The countdown has reached zero. The pledge was made in front of witnesses and the terms were his own. The results are below.',
                })
              : t('deadline', {
                  defaultValue:
                    'When this countdown reaches zero on January 1st, 2030, Sohum Joshi will have met all four terms of his pledge or he will not have. He set the terms. He set the date. Nobody asked him to.',
                })}
          </p>

          <p>
            {t('pledge-quote', {
              defaultValue:
                "\"By January 1st 2030 I'll have a job, I'll have a girl, I won't have three baby mamas out here failing to pay child support, and I won't be living at home — I'll own a house. Write it down.\"",
            })}
          </p>

          <h2>{t('terms-heading', { defaultValue: 'The Four Terms' })}</h2>

          <ol className="sohumbum-pledge">
            {terms.map((term) => (
              <li key={term.id} id={term.id} className="sohumbum-pledge__item">
                <span className="sohumbum-pledge__claim">{term.claim}</span>
                <span className="sohumbum-pledge__status">{term.status}</span>
                <span className="sohumbum-pledge__note">{term.note}</span>
              </li>
            ))}
          </ol>

          <h2>{t('figures-heading', { defaultValue: 'The Numbers' })}</h2>

          <ol className="sohumbum-standings">
            {figures.map((figure) => (
              <li
                key={figure.id}
                className={figure.subject ? 'sohumbum-standings__subject' : undefined}
              >
                {figure.label} — <span>{figure.value}</span>
              </li>
            ))}
          </ol>

          <p>
            {elapsedDays === null
              ? t('elapsed-pending', {
                  defaultValue: 'Days elapsed since the pledge: calculating.',
                })
              : t('elapsed', {
                  count: elapsedDays,
                  defaultValue: 'Days elapsed since the pledge: {{count}}. Terms met: none.',
                })}
          </p>

          <h2>{t('bio-heading', { defaultValue: 'Who Is Sohum Joshi?' })}</h2>

          <p>
            {t('bio-1', {
              defaultValue:
                'Sohum Joshi is a man of enormous stated ambition and no observable output. He is twenty-something, unemployed first by circumstance and then by preference, and holds firm opinions on markets he has never participated in, relationships he has never had, and property he has never owned. He speaks about his future in the present tense. He has never once been early.',
            })}
          </p>

          <p>
            {t('bio-2', {
              defaultValue:
                'He is not a bad person. He is a bum. Those are two different findings and this page is only qualified to make the second one. The terms above are his, verbatim, and the deadline is his too — this page simply keeps time.',
            })}
          </p>

          <p>
            {t('bio-3', {
              defaultValue:
                'A full account of his activity here — the posts, the placements, the two thousand one hundred and ninety hours — is public and open to review.',
            })}{' '}
            <Link to="/u/$userid" params={{ userid: SUBJECT_HANDLE }}>
              {t('bio-profile-link', { defaultValue: 'His profile' })}
            </Link>{' '}
            {t('bio-and', { defaultValue: 'and' })}{' '}
            <Link to="/leaderboard">
              {t('bio-leaderboard-link', { defaultValue: 'the standings' })}
            </Link>{' '}
            {t('bio-4', {
              defaultValue: 'update continuously and have never once updated in his favour.',
            })}
          </p>

          <p>
            {t('bio-5', {
              defaultValue:
                'This review runs until January 1st, 2030. It can be ended early. He knows how.',
            })}
          </p>
        </div>
      </main>

      <footer className="sohumbum-footer">
        <div className="sohumbum-footer__inner">
          <p>
            {t('colophon', {
              defaultValue:
                "Reviewed quarterly. Figures are self-reported except where corroborated by the subject's own posting history. The subject has been informed of the address of this page and retains an unconditional right of reply, which he has exercised once, by logging off. This review closes on January 1st, 2030, or on the day all four terms are met, whichever comes first.",
            })}
          </p>
        </div>
      </footer>
    </div>
  );
}
