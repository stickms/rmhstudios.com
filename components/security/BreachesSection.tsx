import {
  ShieldAlert,
  Link2,
  EyeOff,
  ScanLine,
  Globe,
  FileTerminal,
  KeyRound,
  History,
  CheckCircle2,
  XCircle,
  Wrench,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

/**
 * The public incident log, as the `#breaches` part of /security. It was its own
 * page, /breaches, until the 2026-11-19 consolidation; that path now redirects
 * here (lib/route/legacy-redirects.ts). The rest of /security says what holds;
 * this part says what did not.
 *
 * Every date, file and mechanism below was read out of this repository's own
 * history before it was written down, and the log is deliberately
 * self-incriminating where the history is — including that the fix arrived by
 * accident, inside an unrelated refactor, nine days late.
 *
 * Two things are deliberately ABSENT and must stay absent: the exposed URL
 * itself, and the commit SHA that still contains it. The credential is public
 * in the sense that anyone willing to walk the history can find it; it does not
 * follow that we should publish a one-click pointer to it from the front of the
 * site. Describe the incident, never hand over the artifact.
 *
 * TODO(security): the one remediation this log cannot claim is rotation —
 * deleting the webhook in Discord and issuing a new one. Nothing in the repo
 * can prove it happened, so nothing here asserts it. Confirm it is done, then
 * this section can say so.
 *
 * The sections follow SecurityPage's own pattern (an `h2` and a lead paragraph
 * inside the LegalLayout column) and render complete on the server; the old
 * page's scroll reveal is gone (R5: nothing moves at rest).
 */

interface Stat {
  num: string;
  label: string;
}

const STATS: Stat[] = [
  { num: '1', label: 'Credential exposed' },
  { num: '9 days', label: 'Live in the default branch' },
  { num: 'Zero', label: 'User accounts or data affected' },
  { num: 'Forever', label: 'How long it stays in git history' },
];

interface Spec {
  term: string;
  desc: string;
}

const WHAT_HAPPENED: Spec[] = [
  {
    term: 'The credential',
    desc: 'A Discord webhook URL — the address our deploy script posts build and release status to. A webhook URL is a bearer credential: the last path segment is a token, and anyone holding the whole string can post to that channel. It is a secret that is shaped like a link, which is exactly the problem.',
  },
  {
    term: 'Where it went',
    desc: 'Straight into deploy.sh as a quoted literal, on the line that defined the notification target. deploy.sh is a tracked file in this repository, and this repository is public. There was no private staging step between the commit and the world.',
  },
  {
    term: 'How long',
    desc: 'Nine days at the tip of the default branch, across twenty-one further commits to that same file by four different people. Every one of those commits touched the script and none of them noticed the line.',
  },
  {
    term: 'How it ended',
    desc: 'Not with an incident response. The literal was swapped for a shell expansion that reads the value out of the environment — a one-line change that rode along inside a commit about removing news and research articles from the feed. It was housekeeping, not a fix.',
  },
  {
    term: 'Where it is now',
    desc: 'Still in the history. The working tree stopped containing the value on day nine; the commit that introduced it never stopped containing it, and never will on its own.',
  },
];

interface Step {
  title: string;
  body: string;
}

const TIMELINE: Step[] = [
  {
    title: '2026-01-28 — the repository is public',
    body: 'rmhstudios.com is developed in the open. That is a deliberate choice and we are keeping it, but it sets the stakes for everything below: there is no window between pushing a mistake and publishing it.',
  },
  {
    title: '2026-03-01 — the webhook is committed',
    body: 'Deploy-status notifications are added to deploy.sh. The webhook URL is written directly into the script rather than read from the environment, and pushed to the default branch.',
  },
  {
    title: '2026-03-01 to 03-10 — nobody sees it',
    body: 'The script is edited twenty-one more times — queueing, locking, migration retries, staging database checks, build-cache fixes, a whole framework migration — by four different contributors. The line sits near the top of the file, in plain sight, the entire time.',
  },
  {
    title: '2026-03-10 — the literal is removed',
    body: 'The value becomes a reference to the DISCORD_WEBHOOK_URL environment variable, defaulting to empty, with the notification path skipped when it is unset. The change is correct. It is also incidental — it is not what that commit was about, and there is no rotation or disclosure alongside it.',
  },
  {
    title: '2026-03-11 onward — the exposure outlives the fix',
    body: 'Retry logic lands on the notification path the next day. The pipeline is now clean at HEAD and has been ever since. The original commit is unchanged, public, and one command away for anyone who looks.',
  },
];

interface Cause {
  icon: LucideIcon;
  title: string;
  body: string;
}

const ROOT_CAUSES: Cause[] = [
  {
    icon: FileTerminal,
    title: 'The value had nowhere else to live',
    body: 'deploy.sh runs on the production host and is version-controlled with everything else. At the time it read no environment file for this setting, so the only place the script could get the URL from was itself. The path of least resistance and the wrong answer were the same edit.',
  },
  {
    icon: Link2,
    title: 'It does not look like a secret',
    body: 'It has no prefix that reads as dangerous, no SECRET or KEY or TOKEN in the name, and no shape a reviewer flinches at. It looks like a URL, because it is one — the credential is just the tail of the path. Both the human eye and the mental grep slide right over it.',
  },
  {
    icon: ScanLine,
    title: 'Nothing mechanical was watching',
    body: 'There was no secret-scanning step in CI to fail the push, and there still is not. Provider push protection catches tokens with well-known prefixes; a webhook URL for a chat service is not reliably one of them. The only line of defence was somebody happening to read line 18.',
  },
  {
    icon: Globe,
    title: 'The repository is public',
    body: 'In a private repository this would have been a mistake with a blast radius the size of the team. Here, the blast radius was the internet from the instant the push completed — and public pushes are indexed by automated scrapers in seconds, not days.',
  },
  {
    icon: EyeOff,
    title: 'Review was for correctness, not for secrets',
    body: 'Twenty commits went past that line. Each of them was reviewed for whether the deploy worked, which is a genuinely hard question that filled the reviewer’s attention. Nobody was assigned the question "does this file contain a credential", so nobody asked it.',
  },
  {
    icon: History,
    title: 'It was found by luck, not by process',
    body: 'The thing that ended the exposure was a cleanup pass that happened to rewrite that line. If it had not, the literal would still be at the tip of the branch. A control that depends on someone happening to look is not a control.',
  },
];

const BLAST_RADIUS_YES: string[] = [
  'Post messages into one Discord channel — the one the deploy bot reports to',
  'Edit or delete the messages that webhook itself created',
  'Choose a display name and avatar per message, which is what makes convincing spoofing easy',
];

const BLAST_RADIUS_NO: string[] = [
  'Read any message, in that channel or any other',
  'List members, roles, or servers, or act as a bot user',
  'Reach the site: no database, no accounts, no sessions, no payments',
  'Trigger, alter, or observe a deployment — that is a different, signed channel',
];

const BLAST_RADIUS_DID: string[] = [
  'No unexplained posts appeared in the channel over the exposure window',
  'No user data was ever reachable through this credential, so none was at risk',
  'The deploy trigger itself was never exposed and never shared this secret',
];

const PERSISTENCE: Spec[] = [
  {
    term: 'Git does not overwrite',
    desc: 'A commit is not an edit. It is a new snapshot that points at the old one as its parent, and both are kept. Changing a line in the current file writes a new version of that file next to the old one — it does not reach back and alter what the previous commit stored. The old content stays exactly as reachable as it always was.',
  },
  {
    term: 'So the fix only changed the future',
    desc: 'After day nine a fresh clone checks out a clean deploy.sh, which is why the problem looks solved from the outside. But asking git for the file’s history, or opening the original commit on the hosting provider, still returns the original line, in full, today.',
  },
  {
    term: 'Rewriting history is not a fix either',
    desc: 'Purging the value from every commit and force-pushing is worth doing as hygiene, and it is not containment. Hosting providers keep detached commits addressable by their hash after the branch stops pointing at them, every existing clone and fork keeps a private copy, and anything that scraped the push already has it.',
  },
  {
    term: 'Only rotation actually ends it',
    desc: 'The exposed string stops being dangerous at the moment the provider stops honouring it, and not one second earlier. Deleting the webhook and issuing a new one is the remediation; everything else is tidying. This is the single most important sentence in this log, and it is the one most incidents get backwards.',
  },
];

interface Fix {
  icon: LucideIcon;
  text: string;
}

const WHAT_CHANGED: Fix[] = [
  {
    icon: Wrench,
    text: 'deploy.sh reads the notification target from DISCORD_WEBHOOK_URL and does nothing when it is unset. The value lives in the host environment and in repository secrets, and it is never written to the log.',
  },
  {
    icon: KeyRound,
    text: 'The webhook that actually ships code is a separate, signed channel. Requests to it carry an HMAC-SHA256 signature, its secret has only ever been read from the environment, and the listener refuses to start without one — so the incident on this page never touched the ability to deploy.',
  },
  {
    icon: ShieldCheck,
    text: 'Webhook URLs supplied through the product are treated as credentials in their own right: stored server-side, returned to the browser only with the token masked, and checked against an allow-list of real hosts on write and again on send.',
  },
  {
    icon: ScanLine,
    text: 'Still open, and stated here rather than quietly omitted: this repository has no automated secret scanning in its pipeline. Until it does, the control that failed in March is the same control we are relying on.',
  },
];

interface Faq {
  q: string;
  a: string;
}

const FAQ: Faq[] = [
  {
    q: 'Was my account or my data involved?',
    a: 'No. The exposed credential could post messages into one Discord channel and nothing else. It gave no access to the site, the database, accounts, sessions, or payment information, and there is no path from it to any of those.',
  },
  {
    q: 'Why publish this at all if no user was affected?',
    a: 'Because a security page that only lists what works is marketing. The point of writing down a near-miss is that the reasons it happened are ordinary — a value with nowhere to live, a secret shaped like a link, a review pass aimed at a different question — and those reasons are still in the room. This log exists so the next one is harder.',
  },
  {
    q: 'Are you going to show me the commit?',
    a: 'No. The history is public and anyone determined to find the value can, but there is a real difference between something being discoverable and it being linked from the front of the site. The incident is described here completely; the artifact is not reproduced.',
  },
  {
    q: 'Why not just delete it from the history?',
    a: 'Because that is a tidying step people mistake for a remedy. Detached commits stay retrievable by hash, existing clones and forks keep their own copies, and automated scrapers read public pushes within seconds. Rewriting history narrows exposure, it never revokes it. Rotating the credential is what revokes it.',
  },
  {
    q: 'How do I report something like this?',
    a: 'Through the disclosure form on this page, or by email to security@rmhstudios.com. Credential exposure in a public repository is explicitly in scope, and a report about it is worth exactly as much as one about the running application.',
  },
];

const SECURITY_EMAIL = 'security@rmhstudios.com';

export function BreachesSection() {
  return (
    <>
      <section id="breaches" aria-labelledby="breaches-title">
        <h2 id="breaches-title">Breaches: we put a secret in public.</h2>
        <p>
          A security page that only lists wins is advertising, so this is our incident log. In March 2026 a Discord
          webhook URL was committed to this repository in plain text and stayed at the tip of the default branch for
          nine days. No user data was ever reachable through it. Here is exactly how it got there, why nobody caught it,
          and why deleting the line did not undo it.
        </p>
      </section>

      <section className="sec-stats" aria-label="The incident at a glance">
        {STATS.map((s) => (
          <div key={s.label} className="surface-card sec-stat">
            <p className="sec-stat__num">{s.num}</p>
            <p className="sec-stat__label">{s.label}</p>
          </div>
        ))}
      </section>

      <section id="breaches-incident" aria-labelledby="brc-incident-title">
        <h2 id="brc-incident-title">A webhook in the deploy script.</h2>
        <p>
          Five facts, none of them flattering. Every one was read back out of this repository&apos;s own history before
          it was written here.
        </p>
        <div className="surface-card sec-spec">
          {WHAT_HAPPENED.map((s) => (
            <div className="sec-spec__row" key={s.term}>
              <div className="sec-spec__term">{s.term}</div>
              <p className="sec-spec__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="brc-timeline-title">
        <h2 id="brc-timeline-title">Nine days, twenty commits, nobody looking.</h2>
        <p>The interesting part of this timeline is not the mistake. It is how ordinary every step after it was.</p>
        <ol className="sec-steps">
          {TIMELINE.map((s, i) => (
            <li className="surface-card sec-step" key={s.title}>
              <span className="sec-step__num">{i + 1}</span>
              <div>
                <h3 className="sec-step__title">{s.title}</h3>
                <p className="sec-step__body">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="brc-causes-title">
        <h2 id="brc-causes-title">Six reasons, and none of them is &ldquo;careless.&rdquo;</h2>
        <p>
          Blaming the commit explains nothing and prevents nothing. These are the conditions that made it the easy thing
          to do — and most of them are conditions, not people.
        </p>
        <div className="sec-grid">
          {ROOT_CAUSES.map((c) => {
            const Icon = c.icon;
            return (
              <article key={c.title} className="surface-card sec-card">
                <span className="sec-card__icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3 className="sec-card__title">{c.title}</h3>
                <p className="sec-card__body">{c.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="brc-radius-title">
        <h2 id="brc-radius-title">What it could actually do.</h2>
        <p>
          A Discord webhook is a write-only pipe into exactly one channel. That is a real risk — a convincing message
          from something that looks like our deploy bot is a good phish — and it is a narrow one.
        </p>
        <div className="sec-rules">
          <div className="surface-card sec-rule">
            <h3 className="sec-rule__title">
              <span className="sec-rule__icon">
                <XCircle aria-hidden="true" />
              </span>
              A holder could
            </h3>
            <ul className="sec-rule__list">
              {BLAST_RADIUS_YES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="surface-card sec-rule">
            <h3 className="sec-rule__title">
              <span className="sec-rule__icon">
                <CheckCircle2 aria-hidden="true" />
              </span>
              A holder could not
            </h3>
            <ul className="sec-rule__list">
              {BLAST_RADIUS_NO.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="surface-card sec-rule">
            <h3 className="sec-rule__title">
              <span className="sec-rule__icon">
                <ShieldAlert aria-hidden="true" />
              </span>
              What we observed
            </h3>
            <ul className="sec-rule__list">
              {BLAST_RADIUS_DID.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="brc-history-title">
        <h2 id="brc-history-title">Deleting the line did not delete the secret.</h2>
        <p>
          This is the lesson worth taking from an otherwise unremarkable mistake, so it gets its own section rather than
          a footnote.
        </p>
        <div className="surface-card sec-spec">
          {PERSISTENCE.map((s) => (
            <div className="sec-spec__row" key={s.term}>
              <div className="sec-spec__term">{s.term}</div>
              <p className="sec-spec__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="brc-changed-title">
        <h2 id="brc-changed-title">Where the pipeline stands now.</h2>
        <p>
          Three things are fixed and one is not. The unfixed one is listed here for the same reason the rest of this log
          is.
        </p>
        <ul className="sec-list">
          {WHAT_CHANGED.map((f) => {
            const Icon = f.icon;
            return (
              <li key={f.text}>
                <span className="sec-list__icon">
                  <Icon aria-hidden="true" />
                </span>
                <span>{f.text}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="brc-takeaway-title">
        <h2 id="brc-takeaway-title">Treat every URL with a token in it as a password.</h2>
        <p>
          It is the shape that fooled us and it is the shape that fools most people: a webhook endpoint, a signed asset
          link, a pre-authenticated callback. If the string alone is enough to act as you, it belongs in the
          environment, never in a tracked file — and once it has been published, the only real remedy is to revoke it at
          the source and issue a new one.
        </p>
        <p>
          <strong>Found something we have missed?</strong> Credential exposure in this repository is in scope for our
          bug bounty and is treated with the same seriousness as a flaw in the running application. Report it through
          the <a href="#sec-disclosure">disclosure form</a> or email{' '}
          <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>.
        </p>
      </section>

      <section aria-labelledby="brc-faq-title">
        <h2 id="brc-faq-title">About the incident.</h2>
        <div className="sec-faq">
          {FAQ.map((f) => (
            <details className="surface-card sec-faq__item" key={f.q}>
              <summary className="sec-faq__q">{f.q}</summary>
              <p className="sec-faq__a">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
