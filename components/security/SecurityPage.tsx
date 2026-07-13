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
  Database,
  Download,
  Trash2,
  Cookie,
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
    body: 'An enforced Content-Security-Policy, strict security headers, server-side SSRF guards, distributed abuse limits, and schema-validated writes contain mistakes before they become breaches.',
    tag: 'Enforced CSP · Distributed limits',
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
    body: 'Abuse detection, model-spend circuit breakers, brute-force throttling, dependency scanning, and security audit logs continuously surface unusual activity.',
    tag: 'Monitoring · Supply chain',
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

const SECURITY_ENGINEERING: Feature[] = [
  {
    icon: ShieldCheck,
    title: 'Enforced browser isolation',
    body: 'Our production Content Security Policy blocks eval, plug-in objects, untrusted form targets, and unauthorized framing while constraining scripts, connections, media, and workers.',
  },
  {
    icon: RadioTower,
    title: 'Distributed abuse controls',
    body: 'Shared limits follow a user across application instances. Paid AI has per-client and global ceilings, a daily budget, request-size limits, and a production fail-closed circuit breaker.',
  },
  {
    icon: Server,
    title: 'Isolated workloads',
    body: 'Production workloads run as non-root with read-only filesystems, dropped Linux capabilities, PID limits, no privilege escalation, seccomp, and narrowly scoped writable volumes.',
  },
  {
    icon: Bug,
    title: 'Continuously scanned supply chain',
    body: 'CodeQL scans JavaScript, TypeScript, and Go. Every web change runs type, lint, test, build, and production dependency gates; release dependencies are held above known patched versions.',
  },
  {
    icon: KeyRound,
    title: 'Short-lived action links',
    body: 'Sensitive editorial links are action-bound, expire after 24 hours, never mutate on GET, require a deliberate POST confirmation, and are delivered with no-store and no-referrer protections.',
  },
  {
    icon: Scale,
    title: 'Reward integrity controls',
    body: 'Hardened game-result paths use strict schemas and distributed per-user limits, while quest and XP progression is independently throttled so replaying result submissions cannot rapidly farm rewards.',
  },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/copyright', label: 'Copyright' },
];

const SECURITY_EMAIL = 'security@rmhstudios.com';

interface Spec {
  term: string;
  desc: string;
}

const SIGN_IN_SPECS: Spec[] = [
  {
    term: 'Passkeys (WebAuthn)',
    desc: 'The strongest option, and the one we recommend. Your device creates a key pair; the private key never leaves its secure enclave, and you unlock it with Face ID, Touch ID, or a hardware key. There is no shared secret to phish, guess, or leak — and nothing on our side that a breach could expose.',
  },
  {
    term: 'Social sign-in',
    desc: 'Sign in with Google, Discord, or GitHub over OAuth 2.0. You lean on an account you already protect (and its own two-factor), and we only ever receive the profile fields we need — never your password with that provider.',
  },
  {
    term: 'Email & password',
    desc: 'If you use a password, it is hashed with a modern, salted algorithm and stored only in that form — we can never read it back. Sign-in, sign-up, and reset are each rate-limited to stop credential stuffing.',
  },
  {
    term: 'Session cookies',
    desc: 'Your session lives in a cookie that is HTTP-only (JavaScript can’t read it), SameSite (other sites can’t ride it), and marked Secure over HTTPS. Requests are checked against an allow-list of trusted origins.',
  },
  {
    term: 'Brute-force limits',
    desc: 'Auth endpoints are throttled per window: sign-in and sign-up at 10 attempts a minute, password reset at 6 — loose enough for a real typo, tight enough to shut down guessing.',
  },
];

const DEFENSE_SPECS: Spec[] = [
  {
    term: 'In transit',
    desc: 'Everything runs over TLS. HTTP Strict Transport Security is sent with a one-year max-age and includeSubDomains, so browsers refuse to talk to us insecurely — no downgrade, no first-request window.',
  },
  {
    term: 'Security headers',
    desc: 'X-Content-Type-Options: nosniff, a strict Referrer-Policy, X-Permitted-Cross-Domain-Policies: none, and a Content-Security-Policy that pins who may frame us. They’re applied at the edge and re-applied at the app layer, so no serving path is left uncovered.',
  },
  {
    term: 'SSRF protection',
    desc: 'Any time the server fetches a URL you gave us (link previews, image proxy, webhooks) it goes through a guard that resolves DNS, rejects private and reserved IP ranges, allows only HTTPS, and re-validates every redirect hop — closing DNS-rebinding and redirect bypasses.',
  },
  {
    term: 'Input validation',
    desc: 'Every write is validated against a strict schema before it touches the database. Malformed or oversized input is rejected at the door, not somewhere deep in the stack.',
  },
  {
    term: 'Constant-time secrets',
    desc: 'Internal and webhook secrets are compared in constant time, so an attacker can’t recover them a byte at a time by measuring how long a check takes.',
  },
  {
    term: 'Safe file handling',
    desc: 'Uploads are validated by their actual bytes (not a claimed extension), re-encoded, and stored under server-generated keys. File paths are resolved and confirmed to stay inside their directory, so “../” tricks go nowhere.',
  },
];

interface DataPractice {
  icon: LucideIcon;
  text: string;
}

const DATA_PRACTICES: DataPractice[] = [
  { icon: EyeOff, text: 'We collect the minimum we need to run the product — and we never sell your personal data.' },
  { icon: Lock, text: 'Your data is encrypted in transit with TLS and at rest in our managed databases and object storage.' },
  { icon: Database, text: 'Access to production data is restricted by the principle of least privilege, and admin actions are recorded in a tamper-evident audit log.' },
  { icon: Download, text: 'You can export your data whenever you want — it’s yours.' },
  { icon: Trash2, text: 'You can delete your account and its data on your terms, not ours.' },
  { icon: Cookie, text: 'We keep cookies to what the product needs; the details live in our Cookie Policy.' },
];

interface Step {
  title: string;
  body: string;
}

const REPORT_STEPS: Step[] = [
  {
    title: 'Acknowledge',
    body: 'We confirm we’ve received your report within two business days — a real human, not an auto-responder that closes the loop.',
  },
  {
    title: 'Triage & validate',
    body: 'We reproduce the issue, confirm its impact, and set a severity. If we need more detail, we’ll ask; if it’s a duplicate or out of scope, we’ll tell you honestly and why.',
  },
  {
    title: 'Fix & verify',
    body: 'We patch it, verify the fix actually closes the hole (and doesn’t open another), and ship it. Critical issues jump the queue.',
  },
  {
    title: 'Reward & credit',
    body: 'Once it’s confirmed, we pay based on severity and demonstrated impact — from $100 for eligible hardening reports to $5,000,000 for exceptional critical findings — and, with your permission, add you to our thanks.',
  },
  {
    title: 'Disclose together',
    body: 'When you’re ready and the fix is live, we’re happy to coordinate public disclosure so your work gets the recognition it deserves.',
  },
];

interface Faq {
  q: string;
  a: string;
}

const SECURITY_FAQ: Faq[] = [
  {
    q: 'Do you support two-factor authentication?',
    a: 'A passkey is inherently multi-factor — it binds something you have (your device) to something you are (your biometric) — so it’s stronger than a password plus a texted code. If you sign in with Google, Discord, or GitHub, any two-factor you’ve enabled there protects your RMH Studios account too.',
  },
  {
    q: 'Do you store my password?',
    a: 'If you use a passkey, there is no password anywhere — nothing to store or steal. If you use email and password, it’s salted and hashed with a modern algorithm and stored only in that irreversible form; we can never read it back.',
  },
  {
    q: 'Is my payment information safe?',
    a: 'Your card details go straight to Stripe, which is certified to PCI DSS Level 1 — the highest tier. They never touch, and never rest on, our servers, so there is nothing here for an attacker to take.',
  },
  {
    q: 'Do you sell my data?',
    a: 'No. We never sell your personal data. We collect the minimum we need to run the product, and you can export or delete it at any time.',
  },
  {
    q: 'I found a bug that isn’t security-related. Where do I report it?',
    a: 'Use the in-app feedback tools for product bugs and ideas. This page and security@rmhstudios.com are specifically for vulnerabilities — please keep those channels for issues that could put accounts or data at risk.',
  },
];

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

        <section className="sec-section sec-section--hair" aria-labelledby="sec-engineering-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Security engineering · 2026</p>
              <h2 id="sec-engineering-title" className="sec-section__title sec-reveal">
                New protections, live by default.
              </h2>
              <p className="sec-section__sub sec-reveal">
                These controls are built into the website, service tier, delivery pipeline,
                and production workload boundary—not left as optional operational steps.
              </p>
            </div>
            <div className="sec-grid">
              {SECURITY_ENGINEERING.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="sec-card sec-reveal" style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}>
                    <span className="sec-card__icon"><Icon aria-hidden="true" /></span>
                    <h3 className="sec-card__title">{feature.title}</h3>
                    <p className="sec-card__body">{feature.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
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

        {/* ─── How sign-in works ────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="sec-signin-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">How signing in works</p>
              <h2 id="sec-signin-title" className="sec-section__title sec-reveal">
                Three ways in — all of them hardened.
              </h2>
              <p className="sec-section__sub sec-reveal">
                However you choose to sign in, the goal is the same: prove it’s
                you without ever creating something an attacker can steal.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {SIGN_IN_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Defense in depth ─────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="sec-defense-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Defense in depth</p>
              <h2 id="sec-defense-title" className="sec-section__title sec-reveal">
                Layer by layer.
              </h2>
              <p className="sec-section__sub sec-reveal">
                No single control is a silver bullet, so we stack them. This is
                what actually runs between a threat and your data on every request.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {DEFENSE_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Your data ────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="sec-data-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Your data, your call</p>
              <h2 id="sec-data-title" className="sec-section__title sec-reveal">
                Privacy is a security feature.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The safest data is the data we never collected. What we do hold,
                we protect — and you stay in control of it.
              </p>
            </div>
            <ul className="sec-list sec-reveal">
              {DATA_PRACTICES.map((d) => {
                const Icon = d.icon;
                return (
                  <li key={d.text}>
                    <span className="sec-list__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{d.text}</span>
                  </li>
                );
              })}
            </ul>
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
                <strong>$5,000,000</strong> for the most serious findings, with
                eligible security-hardening reports starting at <strong>$100</strong>.
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

        {/* ─── How we handle a report ───────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="sec-process-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">What happens next</p>
              <h2 id="sec-process-title" className="sec-section__title sec-reveal">
                From report to reward.
              </h2>
              <p className="sec-section__sub sec-reveal">
                No black hole, no radio silence. Here’s exactly what happens after
                you hit submit.
              </p>
            </div>
            <ol className="sec-steps">
              {REPORT_STEPS.map((s, i) => (
                <li
                  className="sec-step sec-reveal"
                  key={s.title}
                  style={{ '--sec-delay': `${(i % 2) * 80}ms` } as CSSProperties}
                >
                  <span className="sec-step__num">{i + 1}</span>
                  <div>
                    <h3 className="sec-step__title">{s.title}</h3>
                    <p className="sec-step__body">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
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
        {/* ─── FAQ ──────────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="sec-faq-title">
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Questions, answered</p>
              <h2 id="sec-faq-title" className="sec-section__title sec-reveal">
                The things people ask.
              </h2>
            </div>
            <div className="sec-faq sec-reveal">
              {SECURITY_FAQ.map((f) => (
                <details className="sec-faq__item" key={f.q}>
                  <summary className="sec-faq__q">{f.q}</summary>
                  <p className="sec-faq__a">{f.a}</p>
                </details>
              ))}
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
