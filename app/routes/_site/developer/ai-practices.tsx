import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';

// How to code with AI on this codebase: the working loop, the repo rules AI
// tools break most, the commit gate, what CI/CD does with a merge, and how to
// review what the model wrote. Written for someone new to AI-assisted coding.
// Public (it sits under /developer), so it describes process only — no
// secrets, hostnames or infrastructure details.

export const Route = createFileRoute('/_site/developer/ai-practices')({
  head: () => ({
    meta: buildMeta({
      title: 'Coding with AI | RMH Studios Developer',
      description:
        'How we use AI coding tools on rmhstudios.com: the working loop, repo rules, the commit gate, CI/CD and reviewing AI-written code.',
      path: '/developer/ai-practices',
    }),
    links: [buildCanonical('/developer/ai-practices')],
  }),
  component: AiPracticesPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-site-text">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="glass-inset overflow-x-auto rounded-site p-3 font-mono text-[13px] leading-relaxed text-site-text">
      {children}
    </pre>
  );
}

const P = ({ children }: { children: ReactNode }) => (
  <p className="leading-relaxed text-site-text-muted">{children}</p>
);

const List = ({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) => {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={`space-y-2 pl-5 leading-relaxed text-site-text-muted ${ordered ? 'list-decimal' : 'list-disc'}`}
    >
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  );
};

function AiPracticesPage() {
  const { t } = useTranslation('f-dev-ai');
  return (
    <PageLayout title={t('title', { defaultValue: 'Coding with AI' })} backTo="/developer">
      <article className="mx-auto max-w-[68ch] space-y-10 px-4 pb-[var(--site-page-bottom-space)]">
        <p className="text-lg leading-relaxed text-site-text">
          {t('lede', {
            defaultValue:
              'AI coding tools write a lot of our code. They are fast and confident, and they are wrong often enough that every line still needs an owner. That owner is you: the model writes a draft, you decide what ships.',
          })}
        </p>

        <Section title={t('fails-title', { defaultValue: 'How AI gets code wrong' })}>
          <P>
            {t('fails-body', {
              defaultValue:
                'Knowing the failure modes is most of the skill. Expect these and look for them every time:',
            })}
          </P>
          <List
            items={[
              t('fails-1', {
                defaultValue:
                  'It invents things that look real: functions, props, env vars, API options and file paths that do not exist in this repo.',
              }),
              t('fails-2', {
                defaultValue:
                  'It writes code that works but does not match ours: a hand-rolled fetch instead of our helper, a raw colour instead of a theme token, a new pattern next to an existing one.',
              }),
              t('fails-3', {
                defaultValue:
                  'It "fixes" a failing test by weakening the test, or a failing check by disabling it.',
              }),
              t('fails-4', {
                defaultValue:
                  'It says "done" or "all tests pass" without having run anything. Believe output you saw, not claims.',
              }),
              t('fails-5', {
                defaultValue:
                  'It quietly changes more than you asked: reformatting files, renaming things, touching unrelated code.',
              }),
            ]}
          />
        </Section>

        <Section title={t('loop-title', { defaultValue: 'The loop for every change' })}>
          <P>
            {t('loop-body', {
              defaultValue: 'These steps are in order. Skipping one is how most bad changes ship.',
            })}
          </P>
          <List
            ordered
            items={[
              t('loop-1', {
                defaultValue:
                  'Start the session by pointing the tool at CLAUDE.md (the repo root) and the CLAUDE.md in the directory you are working in. They hold the rules below and the map of the codebase. Claude Code reads them automatically; other tools need to be told.',
              }),
              t('loop-2', {
                defaultValue:
                  'Describe the task precisely: what should change, where, and what "done" looks like. "Fix the bug" gets a guess; "the check-in cards on /admin/alarms overlap at 1000px wide, fix the layout without changing their content" gets a fix.',
              }),
              t('loop-3', {
                defaultValue:
                  'Ask for a plan before code for anything bigger than a few lines. Read it, push back, then let it write.',
              }),
              t('loop-4', {
                defaultValue:
                  'Keep changes small: one concern per change. A 40-file diff cannot be reviewed, so it will not be.',
              }),
              t('loop-5', {
                defaultValue:
                  'Run it yourself: the dev server, the page, the test. Then run the commit gate (below).',
              }),
              t('loop-6', {
                defaultValue:
                  'Read the whole diff (git diff) before committing, using the review checklist at the end of this page.',
              }),
              t('loop-7', {
                defaultValue:
                  'Commit with a message that says why, push a branch, open a pull request, wait for CI.',
              }),
            ]}
          />
        </Section>

        <Section title={t('rules-title', { defaultValue: 'Repo rules AI tools break most' })}>
          <P>
            {t('rules-body', {
              defaultValue:
                'CLAUDE.md is the full list. These are the ones to check by hand in anything a model writes:',
            })}
          </P>
          <List
            items={[
              t('rules-1', {
                defaultValue:
                  'API routes are wrapped in defineHandler (from lib/api/handler.server). It does the session check, rate limit and input validation in the right order. A handler that does those itself is wrong even if it works.',
              }),
              t('rules-2', {
                defaultValue:
                  'Server-only code lives in files named *.server.ts and is never imported from client code. Getting this wrong fails at runtime, not at build time.',
              }),
              t('rules-3', {
                defaultValue:
                  'Every user-facing string goes through the t() function with a defaultValue, then pnpm i18n:extract. Changing the wording of a shipped string means a new key.',
              }),
              t('rules-4', {
                defaultValue:
                  'Colours, radii, shadows and fonts come from the theme tokens (bg-site-surface, rounded-site, …) and shared components in components/ui. No raw colours or hardcoded radii; CI rejects them.',
              }),
              t('rules-5', {
                defaultValue:
                  'Code under server/ imports lib/ with relative paths, never "@/". A wrong import there can ship a service that crashes on start.',
              }),
              t('rules-6', {
                defaultValue:
                  'Never hand-edit generated files (app/routeTree.gen.ts, lib/i18n/resources.*.ts). Regenerate them with their tools.',
              }),
              t('rules-7', {
                defaultValue:
                  'Database changes come with a migration (pnpm db:migrate). Production runs migrations on deploy; db:push is for your local database only.',
              }),
              t('rules-8', {
                defaultValue:
                  'Validate all input with zod, rate-limit writes, and fetch user-supplied URLs only through lib/ssrf-guard.server.',
              }),
            ]}
          />
        </Section>

        <Section title={t('gate-title', { defaultValue: 'The commit gate' })}>
          <P>
            {t('gate-body', {
              defaultValue:
                'One command checks a change against the rules CI enforces: the design rules on the lines you added, the consistency tests, lint, the typechecker and the generated docs. Run it before every commit:',
            })}
          </P>
          <Code>{`pnpm hooks:install            # once per clone: runs the gate on git commit
pnpm check:consistency        # the staged change
pnpm check:consistency --base main   # the whole branch, before a PR
pnpm test                     # the test suite`}</Code>
          <P>
            {t('gate-rule', {
              defaultValue:
                'A failing gate is fixed, not bypassed. If a model suggests --no-verify or a skip variable to get past it, say no. If a rule is genuinely wrong for your change, change the rule in the same commit and say why in the message.',
            })}
          </P>
        </Section>

        <Section title={t('cicd-title', { defaultValue: 'What CI/CD does with your change' })}>
          <List
            items={[
              t('cicd-1', {
                defaultValue:
                  'Opening a pull request runs CI: typecheck, lint, the tests, a production build, a dependency audit, an integration suite, and the Go tests when Go code changed. Do not merge until all of them are green.',
              }),
              t('cicd-2', {
                defaultValue:
                  'Some pull requests also get an automated LLM "senior engineer" review that can block the merge. Treat its comments like a reviewer’s: fix them or reply with why not.',
              }),
              <strong key="ship" className="text-site-text">
                {t('cicd-3', {
                  defaultValue:
                    'Merging to main deploys to production. There is no staging step in between: merge only what you would ship right now.',
                })}
              </strong>,
              t('cicd-4', {
                defaultValue:
                  'The deploy runs the tests again, builds the images, migrates the database, then swaps the web servers one colour at a time and watches them for five minutes. If the new version fails its checks, it rolls back on its own and the deploy channel says so.',
              }),
              t('cicd-5', {
                defaultValue:
                  'A failed deploy or a failed rollback pages whoever is on call. If yours did, say so in the on-call channel and help fix it; the runbooks in docs/runbooks/oncall explain each alarm.',
              }),
              t('cicd-6', {
                defaultValue:
                  'Never commit to main directly, and never force-push to it. Work on a branch; if several AI sessions share one checkout, give each its own git worktree so they cannot switch each other’s branch.',
              }),
            ]}
          />
        </Section>

        <Section title={t('secrets-title', { defaultValue: 'Secrets and AI tools' })}>
          <List
            items={[
              t('secrets-1', {
                defaultValue:
                  'Never paste a token, password, key or webhook URL into an AI chat, a Discord channel or an issue. Chats are logged, and channels are read by everyone in them.',
              }),
              t('secrets-2', {
                defaultValue:
                  'Secrets live in environment files on the server and in the GitHub and Cloudflare secret stores, never in the repo (it is public). When a tool needs a secret, have it read it from a file or prompt for it, without printing it.',
              }),
              t('secrets-3', {
                defaultValue:
                  'If a secret leaks anyway, rotate it: make a new one, put it where the old one was, delete the old one. Deleting the message is not enough.',
              }),
            ]}
          />
        </Section>

        <Section title={t('review-title', { defaultValue: 'Reviewing what the model wrote' })}>
          <P>
            {t('review-body', {
              defaultValue: 'Before you commit, every one of these should be a yes:',
            })}
          </P>
          <List
            items={[
              t('review-1', {
                defaultValue: 'I have read every line of the diff and can explain it.',
              }),
              t('review-2', {
                defaultValue:
                  'Every function, import and option it uses exists. I searched for it, I did not assume.',
              }),
              t('review-3', {
                defaultValue:
                  'It reuses our helpers and components instead of adding a second way to do the same thing.',
              }),
              t('review-4', {
                defaultValue:
                  'I ran it: the page renders, the endpoint answers, the test fails without the fix and passes with it.',
              }),
              t('review-5', {
                defaultValue:
                  'Input is validated, writes are rate-limited, and nothing new is reachable without the right sign-in.',
              }),
              t('review-6', {
                defaultValue: 'No test was weakened, skipped or deleted to make it pass.',
              }),
              t('review-7', { defaultValue: 'Nothing outside the task changed.' }),
              t('review-8', {
                defaultValue:
                  'The commit gate passes, and the commit message says why the change exists.',
              }),
            ]}
          />
        </Section>

        <Section title={t('stuck-title', { defaultValue: 'When you are stuck' })}>
          <P>
            {t('stuck-body', {
              defaultValue:
                'Ask the model to explain the code or the error before asking it to fix anything, and check its explanation against the code. If a fix has not worked twice, stop and read the error yourself; the third guess is rarely better. Then ask a person.',
            })}
          </P>
          <P>
            {t('stuck-links', {
              defaultValue:
                'The repo’s CLAUDE.md, CONTRIBUTING.md and docs/testing.md go deeper on everything here.',
            })}{' '}
            <Link to="/developer" className="text-site-accent hover:underline">
              {t('back-link', { defaultValue: 'Back to Developer' })}
            </Link>
          </P>
        </Section>
      </article>
    </PageLayout>
  );
}
