import { useEffect, useRef, type CSSProperties } from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Lock,
  CreditCard,
  EyeOff,
  RadioTower,
  KeyRound,
  UserCheck,
  LogOut,
  Server,
  ChevronLeft,
  ChevronDown,
  ArrowRight,
  Bug,
  CheckCircle2,
  XCircle,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import './security.css';
import { BugBountyForm } from './BugBountyForm';
import { REWARD_TIERS, CATEGORY_BOUNTIES } from '@/lib/security-report-schema';

/**
 * /security — a standalone, black & white, Apple-styled page describing how
 * seriously RMH Studios takes security. Every claim below maps to a real
 * control in this codebase (better-auth passkeys/OAuth + rate limiting, Stripe
 * for payments, lib/ssrf-guard, infra security headers/CSP, audit logging),
 * so the page stays honest as well as reassuring.
 *
 * Motion is progressive enhancement only: the server renders everything
 * visible, and the scroll-reveal is enabled on mount solely for visitors who
 * have not asked for reduced motion (see the effect below + security.css).
 */

interface Pillar {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const PILLARS: Pillar[] = [
  {
    icon: Lock,
    title: 'Encrypted in transit',
    body: 'Every byte you exchange with RMH Studios travels over TLS. HTTP Strict Transport Security tells your browser to connect securely and never fall back, so downgrade attacks get nowhere.',
    tag: 'TLS · HSTS',
  },
  {
    icon: Fingerprint,
    title: 'Passwordless, phishing-resistant sign-in',
    body: 'Sign in with a passkey and there is no password to steal, phish, or leak. Prefer a provider? Use Google, Discord, or GitHub. Sessions live in hardened, HTTP-only cookies.',
    tag: 'Passkeys · OAuth 2.0',
  },
  {
    icon: CreditCard,
    title: 'We never see your card',
    body: 'Payments run through Stripe, certified to PCI DSS Level 1. Your card details go straight to Stripe over an encrypted channel — they never touch, and never rest on, our servers.',
    tag: 'Stripe · PCI DSS L1',
  },
  {
    icon: ShieldCheck,
    title: 'Defense in depth',
    body: 'A Content-Security-Policy, strict security headers, server-side SSRF guards on outbound fetches, and per-route rate limits mean a single mistake can never become a breach.',
    tag: 'CSP · Rate limits',
  },
  {
    icon: EyeOff,
    title: 'Privacy is the default',
    body: 'We collect the minimum we need to run the product, we never sell your data, and you can export or delete it whenever you want. Fewer things to protect is safer for everyone.',
    tag: 'Data minimization',
  },
  {
    icon: RadioTower,
    title: 'Watched around the clock',
    body: 'Abuse detection, brute-force throttling, and tamper-evident audit logs run continuously, so unusual activity is caught early — not read about after the fact.',
    tag: 'Monitoring · Audit logs',
  },
];

interface Stat {
  num: string;
  label: string;
}

const STATS: Stat[] = [
  { num: 'TLS 1.2+', label: 'Encryption on every request' },
  { num: 'Zero', label: 'Passwords stored when you use a passkey' },
  { num: '24/7', label: 'Automated abuse monitoring' },
  { num: 'PCI L1', label: 'Payments handled by Stripe' },
];

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: Fingerprint,
    title: 'Passkeys & WebAuthn',
    body: "Your device's secure enclave proves it's you with Face ID, Touch ID, or a hardware key. The secret never leaves your device — there is nothing on our side to breach.",
  },
  {
    icon: UserCheck,
    title: 'Trusted single sign-on',
    body: 'Sign in with Google, Discord, or GitHub and lean on the accounts — and two-factor protection — you already use every day.',
  },
  {
    icon: KeyRound,
    title: 'Hardened sessions',
    body: "Session tokens sit in Secure, HTTP-only, SameSite cookies that scripts can't read and other sites can't ride. On HTTPS they are marked Secure automatically.",
  },
  {
    icon: Lock,
    title: 'Brute-force resistant',
    body: 'Sign-in, sign-up, and password-reset endpoints are individually rate-limited to shut down credential stuffing and password guessing.',
  },
  {
    icon: Server,
    title: 'Encrypted at rest',
    body: 'Your data lives in managed databases and object storage that are encrypted at rest, with access restricted by the principle of least privilege.',
  },
  {
    icon: LogOut,
    title: "You're always in control",
    body: 'Change your handle, export your data, or delete your account on your terms — and sign out of your sessions whenever you want.',
  },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/copyright', label: 'Copyright' },
];

const SECURITY_EMAIL = 'security@rmhstudios.com';

export function SecurityPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const pillarsRef = useRef<HTMLElement>(null);

  // Enable scroll-reveal only as an enhancement, and only when the visitor has
  // not requested reduced motion. Without this, `.sec-reveal` stays fully
  // visible (the `[data-animate]` attribute is what hides-then-reveals it), so
  // the page is complete with JS disabled or motion reduced.
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;

    const prefersReduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (prefersReduced) return;

    page.setAttribute('data-animate', '');
    const revealables = Array.from(
      page.querySelectorAll<HTMLElement>('.sec-reveal'),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    revealables.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToPillars = () => {
    pillarsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sec-page" ref={pageRef}>
      <a className="sec-skip" href="#sec-main">
        Skip to content
      </a>

      <header>
        <nav className="sec-nav" aria-label="Security">
          <div className="sec-nav__inner">
            <a className="sec-nav__back" href="/">
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
              RMH Studios
            </a>
            <span className="sec-nav__sep" aria-hidden="true">
              /
            </span>
            <span className="sec-nav__title">Security</span>
            <a className="sec-nav__cta" href="#sec-disclosure">
              Report an issue
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="sec-main">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="sec-hero" aria-labelledby="sec-hero-title">
          <div className="sec-hero__grid" aria-hidden="true" />
          <div className="sec-hero__aura" aria-hidden="true" />
          <div className="sec-hero__ring sec-hero__ring--1" aria-hidden="true" />
          <div className="sec-hero__ring sec-hero__ring--2" aria-hidden="true" />
          <div className="sec-hero__ring sec-hero__ring--3" aria-hidden="true" />

          <div className="sec-shell sec-hero__content">
            <h1 id="sec-hero-title" className="sec-hero__title">
              Security you can <em>feel.</em>
            </h1>
            <p className="sec-hero__lede">
              You trust us with your account, your work, and sometimes your
              payment details. We treat that trust as the product itself — and
              engineer for it on every request, in every layer.
            </p>
            <div className="sec-hero__actions">
              <a className="sec-btn sec-btn--primary" href="#sec-pillars">
                See how we protect you
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="sec-btn sec-btn--ghost" href="#sec-disclosure">
                <Bug aria-hidden="true" />
                Report a vulnerability
              </a>
            </div>
          </div>

          <button
            className="sec-hero__cue"
            type="button"
            onClick={scrollToPillars}
            aria-label="Scroll to security overview"
          >
            Scroll
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </section>

        {/* ─── Trust bar ────────────────────────────────────────────────── */}
        <section className="sec-stats" aria-label="Security at a glance">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="sec-stat sec-reveal"
              style={{ '--sec-delay': `${i * 70}ms` } as CSSProperties}
            >
              <p className="sec-stat__num">{s.num}</p>
              <p className="sec-stat__label">{s.label}</p>
            </div>
          ))}
        </section>

        {/* ─── Statement ────────────────────────────────────────────────── */}
        <section className="sec-section sec-statement" aria-labelledby="sec-statement-title">
          <div className="sec-shell">
            <p className="sec-eyebrow sec-reveal">Our commitment</p>
            <h2 id="sec-statement-title" className="sec-statement__text sec-reveal">
              Security isn&apos;t a feature. <b>It&apos;s the foundation.</b>
            </h2>
          </div>
        </section>

        {/* ─── Pillars ──────────────────────────────────────────────────── */}
        <section
          id="sec-pillars"
          ref={pillarsRef}
          className="sec-section sec-section--hair"
          aria-labelledby="sec-pillars-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">How we keep you safe</p>
              <h2 id="sec-pillars-title" className="sec-section__title sec-reveal">
                Protection at every layer.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Real controls, not slogans. Here is what actually stands between
                a threat and your data.
              </p>
            </div>

            <div className="sec-grid">
              {PILLARS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <article
                    key={p.title}
                    className="sec-card sec-reveal"
                    style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                  >
                    <span className="sec-card__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3 className="sec-card__title">{p.title}</h3>
                    <p className="sec-card__body">{p.body}</p>
                    <span className="sec-card__tag">{p.tag}</span>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Account protection ───────────────────────────────────────── */}
        <section
          className="sec-section sec-section--hair"
          aria-labelledby="sec-account-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Built around your account</p>
              <h2 id="sec-account-title" className="sec-section__title sec-reveal">
                Your account, locked down.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The strongest security is the kind you never have to think
                about. These protections are on by default.
              </p>
            </div>

            <div className="sec-features">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <article
                    key={f.title}
                    className="sec-feature sec-reveal"
                    style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                  >
                    <span className="sec-feature__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="sec-feature__title">{f.title}</h3>
                      <p className="sec-feature__body">{f.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Bug bounty program ───────────────────────────────────────── */}
        <section
          id="sec-bounty"
          className="sec-section sec-section--hair"
          aria-labelledby="sec-bounty-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Bug bounty program</p>
              <h2 id="sec-bounty-title" className="sec-section__title sec-reveal">
                Break it. Get paid.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Security is a team sport, and researchers are on our team. Report
                a real, original vulnerability and we&apos;ll reward it — up to{' '}
                <strong>$2,500,000</strong> for the most serious findings.
              </p>
            </div>

            {/* Reward tiers */}
            <div className="sec-tiers">
              {REWARD_TIERS.map((tier, i) => (
                <article
                  key={tier.severity}
                  className="sec-tier sec-reveal"
                  data-sev={tier.severity}
                  style={{ '--sec-delay': `${(i % 2) * 90}ms` } as CSSProperties}
                >
                  <div className="sec-tier__head">
                    <span className="sec-tier__sev">{tier.label}</span>
                    <span className="sec-tier__reward">{tier.reward}</span>
                  </div>
                  <p className="sec-tier__blurb">{tier.blurb}</p>
                  <p className="sec-tier__examples">{tier.examples}</p>
                </article>
              ))}
            </div>

            {/* Category requirements */}
            <div className="sec-bounty-table-wrap sec-reveal" role="region" aria-labelledby="sec-bounty-cats" tabIndex={0}>
              <h3 id="sec-bounty-cats" className="sec-bounty-table-title">
                What each vulnerability is worth
              </h3>
              <table className="sec-bounty-table">
                <caption className="sr-only">
                  Bug bounty categories, their maximum reward, and what qualifies.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Up to</th>
                    <th scope="col">What qualifies</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_BOUNTIES.map((b) => (
                    <tr key={b.category}>
                      <th scope="row">{b.category}</th>
                      <td className="sec-bounty-table__reward">{b.max}</td>
                      <td>{b.requirement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Program rules */}
            <div className="sec-rules">
              <div className="sec-rule sec-reveal">
                <h3 className="sec-rule__title">
                  <span className="sec-rule__icon"><CheckCircle2 aria-hidden="true" /></span>
                  In scope
                </h3>
                <ul className="sec-rule__list">
                  <li>rmhstudios.com and its subdomains</li>
                  <li>Our public API, developer platform, and web apps</li>
                  <li>Authentication, payments, and how we handle your data</li>
                </ul>
              </div>
              <div className="sec-rule sec-reveal" style={{ '--sec-delay': '80ms' } as CSSProperties}>
                <h3 className="sec-rule__title">
                  <span className="sec-rule__icon"><XCircle aria-hidden="true" /></span>
                  Out of scope
                </h3>
                <ul className="sec-rule__list">
                  <li>Denial-of-service and volumetric attacks</li>
                  <li>Social engineering, phishing our staff, or physical access</li>
                  <li>Scanner output or missing headers with no proof-of-concept</li>
                  <li>Issues in third parties (Stripe, Discord, cloud providers)</li>
                </ul>
              </div>
              <div className="sec-rule sec-reveal" style={{ '--sec-delay': '160ms' } as CSSProperties}>
                <h3 className="sec-rule__title">
                  <span className="sec-rule__icon"><Scale aria-hidden="true" /></span>
                  Rules of engagement
                </h3>
                <ul className="sec-rule__list">
                  <li>Only ever test against your own account and data</li>
                  <li>Never access, change, or destroy data that isn&apos;t yours</li>
                  <li>Give us a reasonable window to fix before going public</li>
                  <li>One clear, reproducible vulnerability per report</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Submit a report ──────────────────────────────────────────── */}
        <section
          id="sec-disclosure"
          className="sec-section sec-section--hair"
          aria-labelledby="sec-disclosure-title"
        >
          <div className="sec-shell">
            <div className="sec-disclosure sec-reveal">
              <div className="sec-disclosure__glow" aria-hidden="true" />
              <div className="sec-disclosure__inner">
                <p className="sec-eyebrow">Submit a report</p>
                <h2 id="sec-disclosure-title" className="sec-disclosure__title">
                  Found a weakness? Tell us.
                </h2>
                <p className="sec-disclosure__body">
                  Send it straight to our security team below. We acknowledge every
                  report within two business days, keep you posted through triage,
                  and pay out once it&apos;s confirmed.
                </p>

                <BugBountyForm />

                <p className="sec-disclosure__meta">
                  <strong>Safe harbor.</strong> Report in good faith — don&apos;t
                  access data that isn&apos;t yours, and give us a reasonable window
                  to ship a fix before disclosing publicly. Do that, and we
                  won&apos;t pursue legal action. Prefer email? Reach us at{' '}
                  <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="sec-footer" role="contentinfo">
        <div className="sec-footer__inner">
          <div className="sec-footer__top">
            <div className="sec-footer__brand">
              <span className="sec-footer__brand-row">
                <ShieldCheck size={18} aria-hidden="true" />
                RMH Studios
              </span>
              <span className="sec-footer__tagline">
                Security and privacy, engineered in from the first line of code.
              </span>
            </div>
            <nav className="sec-footer__links" aria-label="Legal">
              {LEGAL_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="sec-footer__link">
                  {l.label}
                </a>
              ))}
              <a href={`mailto:${SECURITY_EMAIL}`} className="sec-footer__link">
                Contact security
              </a>
            </nav>
          </div>
          <div className="sec-footer__copy">
            &copy; {new Date().getFullYear()} RMH Studios. No method of
            transmission over the internet is ever 100% secure — but we hold
            ourselves to the highest bar we can, and keep raising it.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default SecurityPage;
