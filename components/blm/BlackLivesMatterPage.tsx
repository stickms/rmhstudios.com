import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Heart,
  Users,
  Scale,
  HandHeart,
  Handshake,
  Accessibility,
  Megaphone,
  BookOpen,
  Globe,
  Eye,
  ShieldCheck,
  MessageCircle,
  GraduationCap,
  Palette,
  UserCheck,
  Landmark,
  Building2,
  TrendingUp,
  Ear,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
// Reuse the security page's liquid-glass "store style" design system verbatim
// so the standalone pages are visually consistent (same `sec-*` classes).
import '@/components/security/security.css';
import { PinnedHero } from '@/components/feed/PinnedHero';

/**
 * /black-lives-matter — a standalone page stating RMH Studios' stance in
 * support of the Black community and laying out our commitment to diversity,
 * equity, and inclusion, in the product and in how we work.
 *
 * Shares SecurityPage's design system and its progressive-enhancement motion
 * model: content renders fully visible on the server, and the scroll-reveal is
 * enabled on mount solely for visitors who have not asked for reduced motion.
 */

interface Value {
  word: string;
  label: string;
}

// Repurposes the security "trust bar" (big accent word + supporting line) to
// name the four values this page is built on.
const VALUES: Value[] = [
  { word: 'Dignity', label: 'Every person is treated with respect, on and off the platform.' },
  { word: 'Equity', label: 'We work to remove barriers, not just to declare them gone.' },
  { word: 'Access', label: 'What we build has to work for everyone who reaches for it.' },
  { word: 'Belonging', label: 'People should feel seen here — not tolerated, but wanted.' },
];

interface Pillar {
  icon: LucideIcon;
  title: string;
  body: string;
  tag: string;
}

const COMMITMENTS: Pillar[] = [
  {
    icon: Heart,
    title: 'We say it plainly',
    body: 'Black lives matter. We stand with the Black community against racism, injustice, and the violence that too many still face. We refuse to treat that stance as controversial or optional.',
    tag: 'Our stance',
  },
  {
    icon: Scale,
    title: 'Equity over sameness',
    body: 'Treating everyone identically is not the same as treating everyone fairly. We look for the barriers that quietly stack against some people and design deliberately to remove them.',
    tag: 'Equity',
  },
  {
    icon: Users,
    title: 'Representation that is real',
    body: 'The people who build a platform shape who it serves. We work to broaden who is in the room, whose ideas ship, and who gets credit — not for a photo, but for the product.',
    tag: 'Representation',
  },
  {
    icon: ShieldCheck,
    title: 'Safety from hate',
    body: 'Racist harassment is not a difference of opinion. Our moderation, reporting, and policy enforcement treat targeted hate as a hard line, and we resource the people who hold it.',
    tag: 'Zero tolerance',
  },
  {
    icon: Accessibility,
    title: 'Built to include',
    body: 'Inclusion is an engineering requirement here, not a nice-to-have. Accessibility, readable contrast, 32 languages, and respect for reduced motion are baked into the design system itself.',
    tag: 'Inclusive by default',
  },
  {
    icon: TrendingUp,
    title: 'Measured, not just meant',
    body: 'Good intentions drift. We hold ourselves to goals we can check, revisit them honestly, and keep going when the numbers say we are not there yet.',
    tag: 'Accountability',
  },
];

interface Spec {
  term: string;
  desc: string;
}

const PRINCIPLES: Spec[] = [
  {
    term: 'Anti-racism is active',
    desc: 'Not being racist is a floor, not a finish line. We take deliberate steps to identify and dismantle bias in our hiring, our product decisions, and the systems that carry them — because inaction preserves the status quo.',
  },
  {
    term: 'Listen first',
    desc: 'The people closest to a problem understand it best. We center the voices of those most affected by injustice, and we treat their feedback as expertise, not anecdote — especially when it is hard to hear.',
  },
  {
    term: 'Equity, not just diversity',
    desc: 'Diversity counts who is in the room; equity asks whether they have a real shot once they are. We care about both, and we hold ourselves to the harder second question.',
  },
  {
    term: 'Inclusion is the point',
    desc: 'People do their best work — and feel most at home — when they can be themselves without cost. Belonging is not the byproduct of the other two; it is the goal they serve.',
  },
  {
    term: 'Progress is public',
    desc: 'A commitment you can’t be held to is a slogan. We would rather share an honest, unfinished picture than a polished one, and be judged on the difference between the two over time.',
  },
];

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const IN_PRODUCT: Feature[] = [
  {
    icon: Eye,
    title: 'Accessible by construction',
    body: 'Focus-visible rings, keyboard paths, semantic landmarks, and screen-reader support are part of our shared primitives, so every new page inherits them instead of relying on someone remembering.',
  },
  {
    icon: Palette,
    title: 'Legible for everyone',
    body: 'A high-contrast theme, tokenized colors tuned for contrast, and full respect for reduced-motion mean the interface bends to the person using it — not the other way around.',
  },
  {
    icon: Globe,
    title: 'Thirty-two languages',
    body: 'The platform speaks 32 languages, with full right-to-left support for Arabic, Urdu, and Persian, so the door is open in more than one tongue and reading direction.',
  },
  {
    icon: MessageCircle,
    title: 'Moderation with teeth',
    body: 'Reporting tools, human review, and clear policy enforcement treat racist and targeted harassment as a violation to act on — quickly — not a debate to host.',
  },
  {
    icon: UserCheck,
    title: 'Dignity in the details',
    body: 'Chosen names and handles, gender-neutral defaults where identity isn’t stated, and respectful copy are small choices that add up to whether someone feels welcome.',
  },
  {
    icon: Sparkles,
    title: 'Represented in what we make',
    body: 'From the stories in our library to the faces and voices across our apps, we work to reflect the full range of the people who use RMH Studios — not a narrow slice of them.',
  },
];

const IN_COMPANY: Feature[] = [
  {
    icon: Users,
    title: 'Wider hiring',
    body: 'We broaden where we look and how we evaluate — structured, skills-first review over gut feel — to open doors that traditional pipelines quietly keep shut.',
  },
  {
    icon: Scale,
    title: 'Pay equity',
    body: 'We review compensation for gaps across race and gender and correct what we find, because fairness that stops at the offer letter isn’t fairness.',
  },
  {
    icon: HandHeart,
    title: 'Support that continues',
    body: 'Mentorship, sponsorship, and community groups help people not just get in the door but grow, lead, and stay — because retention is where inclusion is tested.',
  },
  {
    icon: GraduationCap,
    title: 'Ongoing education',
    body: 'Anti-bias and inclusive-design learning is continuous, not a one-time seminar, and it reaches the people making product and hiring decisions.',
  },
  {
    icon: Handshake,
    title: 'Who we work with',
    body: 'We look to partner with and buy from Black-owned and underrepresented-led businesses, extending the commitment beyond our own walls.',
  },
  {
    icon: Building2,
    title: 'Accountable leadership',
    body: 'Inclusion goals sit with leadership, not just a committee, and progress against them is part of how we measure whether we’re doing our jobs.',
  },
];

const PRODUCT_SPECS: Spec[] = [
  {
    term: 'Design tokens',
    desc: 'Every color, contrast, and radius flows through a shared token system with a dedicated high-contrast theme, so accessibility isn’t a per-page afterthought — it’s a property of the whole design language.',
  },
  {
    term: 'Reduced motion',
    desc: 'Animation is progressive enhancement. Anyone who prefers reduced motion — including this very page — gets a complete, still experience with nothing hidden behind an effect.',
  },
  {
    term: 'Localization',
    desc: 'Interface strings run through a 32-locale pipeline with right-to-left layouts for Arabic, Urdu, and Persian, so the product meets people in their own language and reading direction.',
  },
  {
    term: 'Safety tooling',
    desc: 'Reporting, blocking, and human moderation are built in, with racist and targeted harassment treated as clear policy violations rather than gray areas.',
  },
  {
    term: 'Respectful defaults',
    desc: 'When we don’t know something about a person, we default to the choice that respects them — neutral pronouns, chosen names, and copy that assumes good faith.',
  },
];

interface Step {
  title: string;
  body: string;
}

const ACCOUNTABILITY: Step[] = [
  {
    title: 'Listen',
    body: 'We seek out the experiences of the people most affected — employees, users, and communities — and treat what we hear as evidence, especially when it’s critical of us.',
  },
  {
    title: 'Set real goals',
    body: 'We turn intentions into specific, checkable commitments across hiring, pay, product accessibility, and safety, so “doing better” has a definition we can be measured against.',
  },
  {
    title: 'Act',
    body: 'We fund and staff the work — moderation, accessibility, inclusive hiring, community partnerships — because a value with no budget is just a wish.',
  },
  {
    title: 'Measure honestly',
    body: 'We look at the numbers even when they’re uncomfortable, and we resist the urge to grade ourselves generously. Where we fall short, we say so.',
  },
  {
    title: 'Keep going',
    body: 'This isn’t a campaign with an end date. We revisit, adjust, and continue — because equity and inclusion are maintained, not achieved once and shelved.',
  },
];

interface Resource {
  name: string;
  desc: string;
  href: string;
}

// Real organizations. Links open in a new tab with noopener/noreferrer.
const RESOURCES: Resource[] = [
  {
    name: 'Black Lives Matter',
    desc: 'The global network working to eradicate white supremacy and build local power to intervene in violence inflicted on Black communities.',
    href: 'https://blacklivesmatter.com/',
  },
  {
    name: 'NAACP Legal Defense Fund',
    desc: 'America’s premier legal organization fighting for racial justice through litigation, advocacy, and public education.',
    href: 'https://www.naacpldf.org/',
  },
  {
    name: 'Equal Justice Initiative',
    desc: 'Committed to ending mass incarceration and excessive punishment, and to challenging racial and economic injustice.',
    href: 'https://eji.org/',
  },
  {
    name: 'Color of Change',
    desc: 'The nation’s largest online racial justice organization, driving change in the systems that affect Black people’s lives.',
    href: 'https://colorofchange.org/',
  },
  {
    name: 'The Bail Project',
    desc: 'A national nonprofit working to combat mass incarceration by disrupting the money bail system, one person at a time.',
    href: 'https://bailproject.org/',
  },
  {
    name: 'Campaign Zero',
    desc: 'A data-informed platform of research-based policy solutions to end police violence in America.',
    href: 'https://www.joincampaignzero.org/',
  },
];

interface Action {
  icon: LucideIcon;
  text: string;
}

const ACTIONS: Action[] = [
  { icon: Ear, text: 'Learn and listen — seek out Black voices, history, and writing beyond the moments when injustice makes the news.' },
  { icon: HandHeart, text: 'Support the organizations above with your time, your money, or your platform — sustained support outlasts a hashtag.' },
  { icon: Landmark, text: 'Engage locally — vote, show up, and pay attention to the policies and officials that shape justice where you live.' },
  { icon: Megaphone, text: 'Speak up when it costs you something — silence in the face of racism is not neutrality, it’s a side.' },
  { icon: BookOpen, text: 'Keep going after the spotlight moves on — the work that matters is the work you do when no one is watching.' },
];

interface Faq {
  q: string;
  a: string;
}

const BLM_FAQ: Faq[] = [
  {
    q: 'Why does a tech platform have a page like this?',
    a: 'Because the tools we build carry our values, whether we name them or not. Who a product includes, who it protects, and who it overlooks are decisions — and we would rather make them out loud and be accountable for them than pretend they’re neutral.',
  },
  {
    q: 'Isn’t “Black lives matter” political?',
    a: 'The dignity and safety of Black people is a matter of human rights, not partisanship. We understand some will disagree with us saying so. We’re comfortable with that; treating equal humanity as up for debate is not a neutral position, and neither is our silence.',
  },
  {
    q: 'What does diversity, equity, and inclusion actually mean here?',
    a: 'Diversity is who’s present. Equity is whether they have a fair shot once they are. Inclusion is whether they can be themselves and belong. We hold ourselves to all three — in who we hire and how they grow, and in who our product serves and how well.',
  },
  {
    q: 'How do I report racist harassment on the platform?',
    a: 'Use the in-app reporting tools on any post, comment, or profile. Racist and targeted harassment are clear policy violations that our moderation team acts on. If something urgent slips through, escalate it and we’ll treat it seriously.',
  },
  {
    q: 'Is this just a statement, or is there action behind it?',
    a: 'A statement with nothing behind it isn’t worth the page it’s on. This commitment shows up in funded moderation, accessibility built into our design system, inclusive and skills-first hiring, pay-equity reviews, and public accountability. It’s ongoing, and it’s imperfect — but it’s real.',
  },
];

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: '/security', label: 'Security' },
  { href: '/optimization', label: 'Speed' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function BlackLivesMatterPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  // Enable scroll-reveal only as an enhancement, and only when the visitor has
  // not requested reduced motion. Without this, `.sec-reveal` stays fully
  // visible, so the page is complete with JS disabled or motion reduced.
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

  return (
    <div className="sec-page" ref={pageRef}>
      <a className="sec-skip" href="#blm-main">
        Skip to content
      </a>

      <header>
        <nav className="sec-nav" aria-label="Black Lives Matter">
          <div className="sec-nav__inner">
            <a className="sec-nav__back" href="/">
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
              RMH Studios
            </a>
            <span className="sec-nav__sep" aria-hidden="true">
              /
            </span>
            <span className="sec-nav__title">Black Lives Matter</span>
            <a className="sec-nav__cta" href="#blm-action">
              Take action
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </header>

      <main id="blm-main">
        {/* ─── Hero — the signature pinned scroll-narrative ──────────────── */}
        <PinnedHero
          eyebrow="Black Lives Matter"
          title={
            <>
              Black lives <span className="text-site-accent">matter.</span>
            </>
          }
          subtitle="We stand with the Black community against racism and injustice. Diversity, equity, and inclusion aren’t a page we published once — they’re a commitment we build into the product and into how we work, every day."
          scrollCue="Our commitment"
          actions={
            <>
              <a className="sec-btn sec-btn--primary" href="#blm-commitment">
                Read our commitment
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="sec-btn sec-btn--ghost" href="#blm-action">
                <Megaphone aria-hidden="true" />
                Ways to take action
              </a>
            </>
          }
        />

        {/* ─── Values bar ───────────────────────────────────────────────── */}
        <section className="sec-stats" aria-label="Our values">
          {VALUES.map((v, i) => (
            <div
              key={v.word}
              className="sec-stat sec-reveal"
              style={{ '--sec-delay': `${i * 70}ms` } as CSSProperties}
            >
              <p className="sec-stat__num">{v.word}</p>
              <p className="sec-stat__label">{v.label}</p>
            </div>
          ))}
        </section>

        {/* ─── Statement ────────────────────────────────────────────────── */}
        <section className="sec-section sec-statement" aria-labelledby="blm-statement-title">
          <div className="sec-shell">
            <p className="sec-eyebrow sec-reveal">Where we stand</p>
            <h2 id="blm-statement-title" className="sec-statement__text sec-reveal">
              Not a moment. <b>A commitment.</b>
            </h2>
          </div>
        </section>

        {/* ─── Our commitment (pillars) ─────────────────────────────────── */}
        <section
          id="blm-commitment"
          className="sec-section sec-section--hair"
          aria-labelledby="blm-commitment-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">What we commit to</p>
              <h2 id="blm-commitment-title" className="sec-section__title sec-reveal">
                Said plainly, meant fully.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Not slogans — commitments we can be held to. Here is what we stand
                for, and what we hold ourselves accountable to delivering.
              </p>
            </div>

            <div className="sec-grid">
              {COMMITMENTS.map((p, i) => {
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

        {/* ─── Principles ───────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-principles-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">The principles under it</p>
              <h2 id="blm-principles-title" className="sec-section__title sec-reveal">
                How we think about this.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A shared set of beliefs that guide the decisions — the ones that
                make the news and the thousand small ones that don’t.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {PRINCIPLES.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── In the product ───────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-product-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">In the product</p>
              <h2 id="blm-product-title" className="sec-section__title sec-reveal">
                Inclusion is an engineering requirement.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Values that never touch the product are just PR. These are the ways
                our commitment shows up in what we actually ship.
              </p>
            </div>

            <div className="sec-features">
              {IN_PRODUCT.map((f, i) => {
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

        {/* ─── Inclusion, built in (spec list) ──────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-productspec-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Built in, not bolted on</p>
              <h2 id="blm-productspec-title" className="sec-section__title sec-reveal">
                Inclusion, at the level of the system.
              </h2>
              <p className="sec-section__sub sec-reveal">
                The strongest inclusion is the kind no one has to remember to add.
                Here’s where it lives in the foundation itself.
              </p>
            </div>
            <div className="sec-spec sec-reveal">
              {PRODUCT_SPECS.map((s) => (
                <div className="sec-spec__row" key={s.term}>
                  <div className="sec-spec__term">{s.term}</div>
                  <p className="sec-spec__desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── In the company ───────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-company-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">In the company</p>
              <h2 id="blm-company-title" className="sec-section__title sec-reveal">
                It starts with who’s in the room.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A product reflects the people who make it. So the commitment has to
                reach how we hire, pay, grow, and partner — not just what we build.
              </p>
            </div>

            <div className="sec-features">
              {IN_COMPANY.map((f, i) => {
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

        {/* ─── Accountability (steps) ───────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-accountability-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">How we stay honest</p>
              <h2 id="blm-accountability-title" className="sec-section__title sec-reveal">
                Held to it, not just proud of it.
              </h2>
              <p className="sec-section__sub sec-reveal">
                Good intentions drift without accountability. This is the loop we
                run so the commitment survives contact with the everyday.
              </p>
            </div>
            <ol className="sec-steps">
              {ACCOUNTABILITY.map((s, i) => (
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

        {/* ─── Resources ────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-resources-title">
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">Where to give and learn</p>
              <h2 id="blm-resources-title" className="sec-section__title sec-reveal">
                Organizations doing the work.
              </h2>
              <p className="sec-section__sub sec-reveal">
                We don’t do this alone, and neither should you. These groups have
                been on the front lines of racial justice for years — support them.
              </p>
            </div>

            <div className="sec-grid">
              {RESOURCES.map((r, i) => (
                <a
                  key={r.name}
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sec-card sec-reveal"
                  style={{ '--sec-delay': `${(i % 3) * 80}ms` } as CSSProperties}
                >
                  <span className="sec-card__icon">
                    <HandHeart aria-hidden="true" />
                  </span>
                  <h3 className="sec-card__title">{r.name}</h3>
                  <p className="sec-card__body">{r.desc}</p>
                  <span className="sec-card__tag sec-card__tag--link">
                    Visit
                    <ExternalLink size={12} aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Take action ──────────────────────────────────────────────── */}
        <section
          id="blm-action"
          className="sec-section sec-section--hair"
          aria-labelledby="blm-action-title"
        >
          <div className="sec-shell">
            <div className="sec-section__head">
              <p className="sec-eyebrow sec-reveal">What you can do</p>
              <h2 id="blm-action-title" className="sec-section__title sec-reveal">
                Solidarity is a verb.
              </h2>
              <p className="sec-section__sub sec-reveal">
                A statement is easy. Sustained action is the point. A few ways to
                show up — long after the moment passes.
              </p>
            </div>
            <ul className="sec-list sec-reveal">
              {ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.text}>
                    <span className="sec-list__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{a.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-faq-title">
          <div className="sec-shell">
            <div className="sec-section__head sec-section__head--center">
              <p className="sec-eyebrow sec-reveal">Questions, answered</p>
              <h2 id="blm-faq-title" className="sec-section__title sec-reveal">
                The things people ask.
              </h2>
            </div>
            <div className="sec-faq sec-reveal">
              {BLM_FAQ.map((f) => (
                <details className="sec-faq__item" key={f.q}>
                  <summary className="sec-faq__q">{f.q}</summary>
                  <p className="sec-faq__a">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Closing ──────────────────────────────────────────────────── */}
        <section className="sec-section sec-section--hair" aria-labelledby="blm-closing-title">
          <div className="sec-shell">
            <div className="sec-disclosure sec-reveal">
              <div className="sec-disclosure__glow" aria-hidden="true" />
              <div className="sec-disclosure__inner">
                <p className="sec-eyebrow">Still, and always</p>
                <h2 id="blm-closing-title" className="sec-disclosure__title">
                  The work doesn’t end when the news moves on.
                </h2>
                <p className="sec-disclosure__body">
                  Diversity, equity, and inclusion aren’t a milestone we passed or a
                  box we checked. They’re a standard we hold ourselves to — in what
                  we build, who we build it with, and who we build it for. We won’t
                  always get it right. We will always keep working at it.
                </p>
                <a className="sec-btn sec-btn--primary" href="/security">
                  How we keep you safe
                  <ArrowRight aria-hidden="true" />
                </a>
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
                <Heart size={18} aria-hidden="true" />
                RMH Studios
              </span>
              <span className="sec-footer__tagline">
                Committed to diversity, equity, and inclusion — in the product and
                in how we work.
              </span>
            </div>
            <nav className="sec-footer__links" aria-label="More">
              {FOOTER_LINKS.map((l) => (
                <a key={l.href} href={l.href} className="sec-footer__link">
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="sec-footer__copy">
            &copy; {new Date().getFullYear()} RMH Studios. Black lives matter —
            today, and every day after the headlines fade.
          </div>
        </div>
      </footer>
    </div>
  );
}

export default BlackLivesMatterPage;
