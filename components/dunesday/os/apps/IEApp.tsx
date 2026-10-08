'use client';

/**
 * Internet Explorer for the Dunesday 7 sandbox.
 *
 * What it can actually open, and why:
 *
 * - **Built-in pages** (`about:home`, `about:blank`, `about:sandbox`): drawn
 *   here, no network at all. The home page is a little portal — search the
 *   watch list, tonight's lineup, links into the rest of RMH Studios.
 * - **Pages on this site** (`/blog`, `/news`, `https://rmhstudios.com/…`): a
 *   same-origin `<iframe>`. The site's CSP already allows framing itself
 *   (`frame-ancestors 'self'`). The frame's sandbox leaves out
 *   `allow-top-navigation`, so nothing inside it can navigate the real tab.
 *   Dunesday itself is refused — you can't open the computer inside itself.
 * - **Anything else** (other http/https sites): never framed. Most sites
 *   refuse to be framed anyway, and a sandbox that silently loaded third-party
 *   pages would not be one. IE shows its "this page is outside the sandbox"
 *   page instead, and only an explicit click opens the address in a real
 *   browser tab (`noopener,noreferrer`). `javascript:`, `data:` and every
 *   other scheme are refused outright.
 */

import { ArrowLeft, ArrowRight, Home, RotateCw, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { allTitles, isIncluded, isWatched } from '@/lib/dunesday/state';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { useEntryLabel } from '../../Schedule';
import { sfx } from '../../sound';
import { openApp } from '../actions';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { useOs } from '../store';

const HOME_URL = 'about:home';

type Target =
  | { kind: 'about'; page: 'home' | 'blank' | 'sandbox'; url: string }
  | { kind: 'site'; path: string; url: string }
  | { kind: 'external'; url: string }
  | { kind: 'self'; url: string }
  | { kind: 'invalid'; url: string };

/** Classify whatever was typed into the address bar. Pure, so it is easy to reason about. */
export function classify(raw: string, origin: string): Target {
  const input = raw.trim();
  if (!input || /^about:(home|start)?$/i.test(input))
    return { kind: 'about', page: 'home', url: HOME_URL };
  if (/^about:blank$/i.test(input)) return { kind: 'about', page: 'blank', url: 'about:blank' };
  if (/^about:sandbox$/i.test(input))
    return { kind: 'about', page: 'sandbox', url: 'about:sandbox' };
  let url: URL;
  try {
    if (input.startsWith('/')) url = new URL(input, origin);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(input)) url = new URL(input);
    else if (/^[^\s/]+\.[a-z]{2,}(\/|$)/i.test(input)) url = new URL(`https://${input}`);
    else return { kind: 'invalid', url: input };
  } catch {
    return { kind: 'invalid', url: input };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'invalid', url: input };
  const sameSite = url.origin === origin || /(^|\.)rmhstudios\.com$/i.test(url.hostname);
  if (!sameSite) return { kind: 'external', url: url.href };
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (/^\/dunesday(\/|$|\?|#)/i.test(url.pathname)) return { kind: 'self', url: url.href };
  // Only relative paths reach the frame — never a different host.
  return { kind: 'site', path, url: new URL(path, origin).href };
}

const FAVORITES = [
  { label: 'RMH Studios', url: '/' },
  { label: 'Blog', url: '/blog' },
  { label: 'News', url: '/news' },
  { label: 'Games', url: '/games' },
  { label: 'Library', url: '/library' },
];

export default function IEApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const setTitle = useOs((s) => s.setTitle);
  const origin = typeof window === 'undefined' ? 'https://rmhstudios.com' : window.location.origin;
  const first = useMemo(
    () => classify(win.params?.url ?? HOME_URL, origin),
    [win.params?.url, origin],
  );
  const [history, setHistory] = useState<Target[]>([first]);
  const [cursor, setCursor] = useState(0);
  const [address, setAddress] = useState(first.url);
  const [loading, setLoading] = useState(first.kind === 'site');
  const [pageTitle, setPageTitle] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const page = history[cursor];

  const go = (raw: string) => {
    const next = classify(raw, origin);
    const h = [...history.slice(0, cursor + 1), next];
    setHistory(h);
    setCursor(h.length - 1);
    setAddress(next.url);
    setPageTitle('');
    setLoading(next.kind === 'site');
    sfx.tick();
  };

  const step = (delta: number) => {
    const i = cursor + delta;
    if (i < 0 || i >= history.length) return;
    setCursor(i);
    setAddress(history[i].url);
    setLoading(history[i].kind === 'site');
  };

  // Window title follows the page, as IE's did: "Page - Windows Internet Explorer".
  const display =
    page.kind === 'about'
      ? page.page === 'home'
        ? t('ie-home-title', { defaultValue: 'Dunesday Home' })
        : page.page === 'sandbox'
          ? t('ie-sandbox-title', { defaultValue: 'About the sandbox' })
          : 'about:blank'
      : page.kind === 'site'
        ? pageTitle || page.url
        : page.kind === 'external'
          ? t('ie-external-title', { defaultValue: 'Leaving the sandbox' })
          : t('ie-cannot-display', {
              defaultValue: 'Internet Explorer cannot display the webpage',
            });
  useEffect(() => {
    setTitle(
      win.id,
      t('ie-window-title', { defaultValue: '{{page}} - Windows Internet Explorer', page: display }),
    );
  }, [display, setTitle, t, win.id]);

  // Same-origin frame: follow its own link clicks into our address bar and history.
  const onFrameLoad = () => {
    setLoading(false);
    const frame = frameRef.current;
    try {
      const loc = frame?.contentWindow?.location;
      if (!loc || loc.href === 'about:blank') return;
      const path = `${loc.pathname}${loc.search}${loc.hash}`;
      setPageTitle(frame?.contentDocument?.title ?? '');
      if (page.kind === 'site' && path !== page.path) {
        const next = classify(path, origin);
        if (next.kind === 'self') {
          // A link inside the frame led back to Dunesday: stop the recursion.
          go(path);
          return;
        }
        const h = [...history.slice(0, cursor + 1), next];
        setHistory(h);
        setCursor(h.length - 1);
        setAddress(next.url);
      }
    } catch {
      // Cross-origin after a redirect: we can no longer read it, so show the
      // address we asked for and leave the frame alone.
    }
  };

  const secure = page.kind === 'site' && page.url.startsWith('https:');

  return (
    <div className="ds-ie">
      <div className="ds-ie-bar">
        <div className="ds-ex-navbtns">
          <button
            type="button"
            className="ds-ex-round ds-ie-back"
            disabled={cursor === 0}
            aria-label={t('back', { defaultValue: 'Back' })}
            onClick={() => step(-1)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-ex-round"
            disabled={cursor >= history.length - 1}
            aria-label={t('forward', { defaultValue: 'Forward' })}
            onClick={() => step(1)}
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <form
          className="ds-ie-address"
          onSubmit={(e) => {
            e.preventDefault();
            go(address);
          }}
        >
          <Icon
            name={page.kind === 'site' ? 'ie' : page.kind === 'about' ? 'ie' : 'warning'}
            size={16}
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            autoComplete="off"
            inputMode="url"
            aria-label={t('address', { defaultValue: 'Address' })}
          />
          {secure && (
            <span
              className="ds-ie-lock"
              title={t('ie-secure', { defaultValue: 'Secure connection' })}
            >
              <Icon name="lock" size={14} />
            </span>
          )}
          <button
            type="button"
            className="ds-ie-refresh"
            aria-label={
              loading
                ? t('ie-stop', { defaultValue: 'Stop' })
                : t('ie-refresh', { defaultValue: 'Refresh' })
            }
            onClick={() => {
              if (loading) {
                frameRef.current?.contentWindow?.stop();
                setLoading(false);
              } else setReloadKey((k) => k + 1);
            }}
          >
            {loading ? (
              <X size={14} aria-hidden="true" />
            ) : (
              <RotateCw size={14} aria-hidden="true" />
            )}
          </button>
        </form>
        <button
          type="button"
          className="ds-ie-tool"
          aria-label={t('ie-home', { defaultValue: 'Home' })}
          onClick={() => go(HOME_URL)}
        >
          <Home size={16} aria-hidden="true" />
        </button>
      </div>

      <nav className="ds-ie-favs" aria-label={t('ie-favorites', { defaultValue: 'Favorites bar' })}>
        <Star size={14} aria-hidden="true" className="ds-ie-favstar" />
        {FAVORITES.map((f) => (
          <button key={f.url} type="button" onClick={() => go(f.url)}>
            <Icon name="ie" size={14} />
            {f.label}
          </button>
        ))}
        <button type="button" onClick={() => go('about:sandbox')}>
          <Icon name="shield" size={14} />
          {t('ie-sandbox-fav', { defaultValue: 'About this sandbox' })}
        </button>
      </nav>

      <div className={cn('ds-ie-page', page.kind === 'site' && 'ds-ie-page--frame')}>
        {page.kind === 'site' && (
          <>
            <iframe
              key={`${cursor}-${reloadKey}`}
              ref={frameRef}
              src={page.path}
              title={display}
              onLoad={onFrameLoad}
              referrerPolicy="same-origin"
              // No allow-top-navigation: nothing in here can take over the real tab.
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
            {loading && <span className="ds-ie-loading" aria-hidden="true" />}
          </>
        )}
        {page.kind === 'about' && page.page === 'home' && <HomePage onGo={go} />}
        {page.kind === 'about' && page.page === 'sandbox' && <SandboxPage />}
        {page.kind === 'external' && (
          <ExternalPage url={page.url} onBack={() => step(-1)} canBack={cursor > 0} />
        )}
        {page.kind === 'self' && (
          <ErrorPage
            heading={t('ie-self-heading', { defaultValue: 'You’re already here' })}
            text={t('ie-self-text', {
              defaultValue:
                'Dunesday 7 can’t be opened inside Dunesday 7 — it would be computers all the way down. Try another page on RMH Studios.',
            })}
          />
        )}
        {page.kind === 'invalid' && (
          <ErrorPage
            heading={t('ie-cannot-display', {
              defaultValue: 'Internet Explorer cannot display the webpage',
            })}
            text={t('ie-invalid-text', {
              defaultValue:
                'This sandboxed browser only opens web addresses (http:// and https://) and its own about: pages. Check the address and try again.',
            })}
          />
        )}
      </div>

      <div className="ds-ie-status" aria-live="polite">
        <span>
          {loading
            ? t('ie-loading', { defaultValue: 'Waiting for {{url}}…', url: page.url })
            : t('ie-done', { defaultValue: 'Done' })}
        </span>
        <span className="ds-ie-zone">
          <Icon name="shield" size={14} />
          {page.kind === 'site'
            ? t('ie-zone-site', { defaultValue: 'Internet | Protected Mode: On' })
            : t('ie-zone-local', { defaultValue: 'Computer | Protected Mode: On' })}
        </span>
      </div>
    </div>
  );
}

function HomePage({ onGo }: { onGo: (url: string) => void }) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, plan, today, pct, remainingMinutes } = useDunesday();
  const label = useEntryLabel(state);
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return allTitles(state)
      .filter((x) => x.title.toLowerCase().includes(query) || x.hook.toLowerCase().includes(query))
      .slice(0, 8);
  }, [q, state]);
  const next = plan.days.find((d) => d.date >= today && d.entries.length);

  return (
    <div className="ds-ie-home">
      <header className="ds-ie-home-hero">
        <h1>{t('ie-home-heading', { defaultValue: 'Dunesday Home' })}</h1>
        <p>
          {new Date().toLocaleDateString(i18n.language, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <form
          className="ds-ie-home-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (results[0]) openApp('properties', { params: { title: results[0].id } });
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ie-search-ph', { defaultValue: 'Search the watch list' })}
            aria-label={t('ie-search-ph', { defaultValue: 'Search the watch list' })}
          />
          <button
            type="submit"
            className="ds-btn7"
            aria-label={t('ie-search', { defaultValue: 'Search' })}
          >
            <Search size={16} aria-hidden="true" />
          </button>
        </form>
        {results.length > 0 && (
          <ul className="ds-ie-results">
            {results.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => openApp('properties', { params: { title: x.id } })}
                >
                  <Icon
                    name={
                      isWatched(state, x) ? 'film-watched' : x.kind === 'series' ? 'series' : 'film'
                    }
                    size={20}
                  />
                  <span>
                    <strong>{x.title}</strong>
                    <small>
                      {x.released.slice(0, 4)} · {formatMinutes(x.minutes)}
                      {!isIncluded(state, x)
                        ? ` · ${t('status-excluded', { defaultValue: 'Not in plan' })}`
                        : ''}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="ds-ie-home-grid">
        <section className="ds-ie-card">
          <h2>{t('ie-tonight', { defaultValue: 'Up next' })}</h2>
          {next ? (
            <>
              <p className="ds-ie-muted">
                {new Date(`${next.date}T12:00:00`).toLocaleDateString(i18n.language, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
              <ul>
                {next.entries.map((e, i) => (
                  <li key={i}>{label(e)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              {t('ie-nothing-next', { defaultValue: 'Nothing scheduled — you’re all caught up.' })}
            </p>
          )}
          <button type="button" className="ds-btn7" onClick={() => openApp('player')}>
            {t('ie-open-player', { defaultValue: 'Open tonight in Media Player' })}
          </button>
        </section>
        <section className="ds-ie-card">
          <h2>{t('ie-progress', { defaultValue: 'Your marathon' })}</h2>
          <p className="ds-ie-big">{pct}%</p>
          <p className="ds-ie-muted">
            {t('ie-left', {
              defaultValue: '{{time}} left to watch',
              time: formatMinutes(remainingMinutes),
            })}
          </p>
          <button type="button" className="ds-btn7" onClick={() => openApp('planner')}>
            {t('ie-open-planner', { defaultValue: 'Open the planner' })}
          </button>
        </section>
        <section className="ds-ie-card">
          <h2>{t('ie-around', { defaultValue: 'Around RMH Studios' })}</h2>
          <ul className="ds-ie-links">
            {FAVORITES.map((f) => (
              <li key={f.url}>
                <button type="button" onClick={() => onGo(f.url)}>
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SandboxPage() {
  const { t } = useTranslation('c-dunesday');
  return (
    <article className="ds-ie-doc">
      <h1>
        <Icon name="shield" size={28} />
        {t('ie-sandbox-title', { defaultValue: 'About the sandbox' })}
      </h1>
      <p>
        {t('ie-sb-1', {
          defaultValue:
            'Dunesday 7 is a pretend computer that lives entirely in this browser tab. Its files, settings and window positions are saved in this browser only (local storage, about 3 MB) and never leave it.',
        })}
      </p>
      <p>
        {t('ie-sb-2', {
          defaultValue:
            'The logon screen accepts any password because there is nothing to protect: the password is thrown away the moment you press Enter. Your RMH Studios account picture and name are shown if you’re signed in to the site.',
        })}
      </p>
      <p>
        {t('ie-sb-3', {
          defaultValue:
            'This browser can show built-in pages and pages on RMH Studios. Other websites are never loaded inside it — you can choose to open them in a real browser tab instead.',
        })}
      </p>
      <p>
        {t('ie-sb-4', {
          defaultValue:
            'The only thing that talks to a server is the marathon itself: the Messenger assistant, and the optional cloud sync, calendar feed and Discord updates in Sync Center.',
        })}
      </p>
    </article>
  );
}

function ExternalPage({
  url,
  onBack,
  canBack,
}: {
  url: string;
  onBack: () => void;
  canBack: boolean;
}) {
  const { t } = useTranslation('c-dunesday');
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // Keep the raw text.
  }
  return (
    <article className="ds-ie-doc ds-ie-doc--warn">
      <h1>
        <Icon name="shield" size={28} />
        {t('ie-ext-heading', { defaultValue: 'This website is outside the sandbox' })}
      </h1>
      <p>
        {t('ie-ext-text', {
          defaultValue:
            'Dunesday 7 doesn’t load other websites inside itself. You can open {{host}} in a real browser tab instead — it won’t be able to see anything on this desktop.',
          host,
        })}
      </p>
      <p className="ds-ie-url">{url}</p>
      <div className="ds-row">
        <button
          type="button"
          className="ds-btn7"
          onClick={() => {
            sfx.swoosh();
            window.open(url, '_blank', 'noopener,noreferrer');
          }}
        >
          {t('ie-ext-open', { defaultValue: 'Open in a new browser tab' })}
        </button>
        {canBack && (
          <button type="button" className="ds-btn7" onClick={onBack}>
            {t('ie-ext-back', { defaultValue: 'Go back' })}
          </button>
        )}
      </div>
    </article>
  );
}

function ErrorPage({ heading, text }: { heading: string; text: string }) {
  const { t } = useTranslation('c-dunesday');
  return (
    <article className="ds-ie-doc">
      <h1>
        <Icon name="info" size={28} />
        {heading}
      </h1>
      <p>{text}</p>
      <h2>{t('ie-try', { defaultValue: 'What you can try:' })}</h2>
      <ul>
        <li>
          {t('ie-try-1', {
            defaultValue: 'Retype the address, for example /blog or rmhstudios.com/news.',
          })}
        </li>
        <li>{t('ie-try-2', { defaultValue: 'Use the Favorites bar above.' })}</li>
      </ul>
    </article>
  );
}
