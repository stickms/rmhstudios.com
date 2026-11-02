import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { cycleForYear, cycleOptions, phaseOf, type Cycle } from '@/lib/elections/calendar';
import { buildFacts, deterministicSummary, headline } from '@/lib/elections/summary';
import type { ElectionSnapshot, Office } from '@/lib/elections/types';
import { Hero } from './Hero';
import { Ticker } from './Ticker';
import { BalanceOfPower } from './BalanceOfPower';
import { StateMap } from './StateMap';
import { RaceExplorer } from './RaceExplorer';
import { PollClosings } from './PollClosings';
import { PredictionPainter } from './PredictionPainter';
import { timeAgo, useElectionData, useNow, useReveal } from './hooks';

export interface ElectionsPageProps {
  /** Cycle year the route resolved (from `?cycle=` or "the current one"). */
  year: number;
  focusRaceId?: string;
  /** The cycles the switcher offers, computed server-side so SSR and hydration agree. */
  options: Cycle[];
}

function Section({
  id,
  tone,
  title,
  eyebrow,
  lede,
  children,
}: {
  id: string;
  tone?: 'ink' | 'yellow' | 'pink';
  title: React.ReactNode;
  eyebrow: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id={id} className={`el-section${tone ? ` el-section--${tone}` : ''}`} aria-labelledby={`${id}-h`}>
      <div className="el-wrap">
        <div ref={ref} className="el-reveal" style={{ ['--el-r' as string]: '-0.4deg' }}>
          <div className="el-section__head">
            <div>
              <p className="el-eyebrow" style={{ margin: '0 0 10px' }}>
                <span className="el-chip el-chip--ink">{eyebrow}</span>
              </p>
              <h2 id={`${id}-h`} className="el-h2">
                {title}
              </h2>
              {lede ? <p className="el-section__lede">{lede}</p> : null}
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export function ElectionsPage({ year, focusRaceId, options }: ElectionsPageProps) {
  const { t } = useTranslation('c-elections');
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const cycle = useMemo(() => options.find((c) => c.year === year) ?? cycleForYear(year), [options, year]);
  const { data, isError, isFetching, refetch, dataUpdatedAt } = useElectionData(year);
  const now = useNow(15_000, data?.serverTime);

  // Reveal + parallax are progressive enhancement: the markup is fully visible until this flips.
  useEffect(() => {
    rootRef.current?.setAttribute('data-animate', '');
  }, []);

  const snapshot: ElectionSnapshot | undefined = data?.snapshot;
  const phase = data?.phase ?? phaseOf(cycle.date);
  const offices: Office[] = useMemo(() => {
    if (!snapshot) return cycle.offices;
    const present = cycle.offices.filter((o) => snapshot.races.some((r) => r.office === o));
    return present.length ? present : cycle.offices;
  }, [snapshot, cycle.offices]);

  const facts = useMemo(() => (snapshot ? buildFacts(snapshot) : null), [snapshot]);
  const bullets = useMemo(() => (snapshot ? deterministicSummary(snapshot) : []), [snapshot]);
  const tickerItems = useMemo(() => {
    if (!snapshot || !facts) return [];
    const items = [headline(snapshot)];
    for (const r of facts.flips.slice(0, 4)) items.push(`Flip · ${r.label} → ${r.leader ?? 'called'}`);
    for (const r of facts.closest.slice(0, 3)) items.push(`Too close · ${r.label}`);
    if (!snapshot.live) items.push(t('ticker.soon', { defaultValue: 'Polls open soon' }));
    return items;
  }, [snapshot, facts, t]);

  const setYear = (y: number) =>
    navigate({ to: '/elections', search: (s: Record<string, unknown>) => ({ ...s, cycle: String(y), race: undefined }), replace: true });

  const share = async () => {
    const url = `${location.origin}/elections?cycle=${year}`;
    const text = snapshot ? headline(snapshot) : cycle.title;
    try {
      if (navigator.share) await navigator.share({ title: cycle.title, text, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* dismissed */
    }
  };

  const selectFromElsewhere = (postal: string) => {
    setSelectedState(postal);
    document.getElementById('map')?.scrollIntoView({ block: 'start' });
  };

  const live = snapshot?.live ?? false;
  const hasData = !!snapshot && snapshot.races.length > 0;

  return (
    <div className="el-root" ref={rootRef}>
      <a className="el-btn el-sr" href="#results" style={{ position: 'absolute' }}>
        {t('a11y.skip', { defaultValue: 'Skip to results' })}
      </a>

      <header className="el-bar">
        <div className="el-wrap el-bar__in">
          <Link to="/" className="el-bar__brand" aria-label={t('bar.home', { defaultValue: 'RMH Studios home' })}>
            <b>RMH</b>
            {t('bar.vote', { defaultValue: 'Vote' })}
          </Link>
          <nav className="el-bar__nav" aria-label={t('bar.nav', { defaultValue: 'Sections' })}>
            <a href="#results">{t('nav.results', { defaultValue: 'Results' })}</a>
            <a href="#map">{t('nav.map', { defaultValue: 'Map' })}</a>
            <a href="#races">{t('nav.races', { defaultValue: 'Races' })}</a>
            <a href="#polls">{t('nav.polls', { defaultValue: 'Polls' })}</a>
            <a href="#predict">{t('nav.predict', { defaultValue: 'Predict' })}</a>
          </nav>
          <div className="el-bar__tools">
            {live ? <span className="el-live">{t('hero.live', { defaultValue: 'LIVE' })}</span> : null}
            <label className="el-sr" htmlFor="el-cycle">
              {t('bar.cycle', { defaultValue: 'Election' })}
            </label>
            <select id="el-cycle" className="el-input" style={{ minHeight: 40, padding: '4px 8px' }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {options.map((c) => (
                <option key={c.year} value={c.year}>
                  {c.shortTitle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main>
        <Hero
          cycle={cycle}
          phase={phase}
          serverTime={data?.serverTime}
          racesCalled={facts?.racesCalled ?? 0}
          racesTotal={facts?.racesTotal ?? 0}
          onShare={share}
        />
        <Ticker
          label={t('ticker.label', { defaultValue: 'Election headlines' })}
          items={tickerItems.length ? tickerItems : [cycle.title, cycle.date]}
        />

        {isError && !snapshot ? (
          <div className="el-wrap" style={{ paddingBlock: 32 }}>
            <div className="el-box" style={{ padding: 20 }} role="alert">
              <p className="el-h2" style={{ fontSize: 36 }}>{t('error.title', { defaultValue: 'Can’t reach the results feed.' })}</p>
              <button type="button" className="el-btn" style={{ marginTop: 16 }} onClick={() => refetch()}>
                <RefreshCw size={16} aria-hidden />
                {t('error.retry', { defaultValue: 'Try again' })}
              </button>
            </div>
          </div>
        ) : null}

        <Section
          id="results"
          tone="ink"
          eyebrow={t('results.eyebrow', { defaultValue: 'Balance of power' })}
          title={
            <>
              {t('results.title1', { defaultValue: 'Who’s' })} <em>{t('results.title2', { defaultValue: 'winning' })}</em>
            </>
          }
          lede={
            hasData
              ? bullets[0]
              : t('results.empty', { defaultValue: 'The board fills in as each state’s polls report.' })
          }
        >
          {!snapshot ? <div className="el-box el-skel" aria-busy /> : null}
          {snapshot ? <BalanceOfPower chambers={snapshot.chambers} live={live} races={snapshot.races} /> : null}
          {bullets.length > 1 ? (
            <div className="el-box" style={{ padding: 16, marginTop: 24, background: 'var(--el-paper)', color: 'var(--el-ink)' }}>
              <p className="el-eyebrow" style={{ margin: '0 0 6px' }}>{t('desk.eyebrow', { defaultValue: 'The desk' })}</p>
              <ul className="el-desk__list">
                {bullets.slice(1).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="el-eyebrow" style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            {snapshot ? (
              <>
                <span>
                  {t('results.updated', { defaultValue: 'Updated {{ago}}', ago: timeAgo(new Date(dataUpdatedAt).toISOString(), now) })}
                </span>
                {isFetching ? <RefreshCw size={12} aria-hidden /> : null}
              </>
            ) : null}
          </p>
        </Section>

        <Ticker tone="ink" label={t('ticker.label', { defaultValue: 'Election headlines' })} items={[t('ticker.every', { defaultValue: 'Every race' }), t('ticker.every2', { defaultValue: 'Every margin' }), t('ticker.every3', { defaultValue: 'Every 20 seconds' })]} />

        <Section
          id="map"
          tone="yellow"
          eyebrow={t('map.eyebrow', { defaultValue: 'State by state' })}
          title={
            <>
              {t('map.title1', { defaultValue: 'The' })} <em>{t('map.title2', { defaultValue: 'map' })}</em>
            </>
          }
          lede={t('map.lede', { defaultValue: 'Equal tiles, equal weight. Tap a state for every race on its ballot.' })}
        >
          {snapshot ? (
            <StateMap races={snapshot.races} offices={offices} selected={selectedState} onSelect={setSelectedState} />
          ) : (
            <div className="el-box el-skel" aria-busy />
          )}
        </Section>

        <Section
          id="races"
          eyebrow={t('races.eyebrow', { defaultValue: 'Every contest' })}
          title={
            <>
              {t('races.title1', { defaultValue: 'All the' })} <em>{t('races.title2', { defaultValue: 'races' })}</em>
            </>
          }
          lede={t('races.lede', { defaultValue: 'Filter, search, sort by closest. Calls land as they happen.' })}
        >
          {snapshot && hasData ? (
            <RaceExplorer races={snapshot.races} offices={offices} focusRaceId={focusRaceId} />
          ) : snapshot ? (
            <p className="el-h2" style={{ fontSize: 36 }}>
              {t('races.notYet', { defaultValue: 'Ballots for this election aren’t published yet.' })}
            </p>
          ) : (
            <div className="el-box el-skel" aria-busy />
          )}
        </Section>

        <Section
          id="polls"
          tone="pink"
          eyebrow={t('polls.eyebrow', { defaultValue: 'Election night' })}
          title={
            <>
              {t('polls.title1', { defaultValue: 'When polls' })} <em>{t('polls.title2', { defaultValue: 'close' })}</em>
            </>
          }
          lede={t('polls.lede', { defaultValue: 'Last polls in each state, Eastern time. Results follow within minutes.' })}
        >
          <PollClosings closings={snapshot?.pollClosings ?? {}} now={now} onSelectState={selectFromElsewhere} />
        </Section>

        <Section
          id="predict"
          eyebrow={t('predict.eyebrow', { defaultValue: 'Call it' })}
          title={
            <>
              {t('predict.title1', { defaultValue: 'Paint your' })} <em>{t('predict.title2', { defaultValue: 'map' })}</em>
            </>
          }
          lede={t('predict.lede', { defaultValue: 'Make your calls, share the link, get graded as races are called.' })}
        >
          {snapshot && hasData ? (
            <PredictionPainter year={year} races={snapshot.races} chambers={snapshot.chambers} offices={offices} />
          ) : (
            <div className="el-box el-skel" aria-busy />
          )}
        </Section>
      </main>

      <footer className="el-foot">
        <div className="el-wrap">
          <p className="el-eyebrow">{t('foot.eyebrow', { defaultValue: 'About this page' })}</p>
          <p>
            {t('foot.data', {
              defaultValue:
                'Results, ratings and race calls come from a free public results feed and can lag or differ from official state tallies. Calls are projections, not certifications. Always check your state’s election office for official results.',
            })}
          </p>
          <p>
            {t('foot.vote', { defaultValue: 'Need to vote or check your registration?' })}{' '}
            <a href="https://vote.gov" target="_blank" rel="noopener noreferrer">
              vote.gov
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
