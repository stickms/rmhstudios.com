# The wiki (wiki.rmhstudios.com)

The public wiki is [MediaWiki](https://www.mediawiki.org), the software behind
Wikipedia, running as its own container on its own subdomain. It is a separate
site from rmhstudios.com on purpose: it shares no shell, stylesheet or design
tokens with the main site, and it wears the classic Vector skin, which is
Wikipedia's own look rather than an imitation of it. Everyone can read it.
Site admins create, edit and delete its pages from **rmhstudios.com/admin/wiki**,
with a DeepSeek writing assistant in the editor. Admins do not get a second
account: the site holds one MediaWiki bot password and puts its own admin
check in front of it.

```
visitor ── Cloudflare ── Apache (wiki.rmhstudios.com.conf) ── mediawiki :7010 ── Postgres (database `mediawiki`)
                                                                  ▲
site admin ── /admin/wiki ── /api/admin/wiki/** (auth: admin) ────┘  Action API over compose DNS, bot password
                                    └── /api/admin/wiki/assist ── DeepSeek (streamed)
```

## Where things are

| Piece | Path |
| ----- | ---- |
| Image (official `mediawiki:1.43` + the Postgres driver + short URLs) | `deploy/mediawiki/Dockerfile` |
| Configuration (skin, database, permissions; reads its secrets from the environment) | `deploy/mediawiki/LocalSettings.php` |
| First-run setup, upgrades and bot password (`wiki-bootstrap` in the image) | `deploy/mediawiki/bootstrap.sh` |
| Compose service (`mediawiki`, profile `wiki`, loopback port 7010) | `docker-compose.yml` |
| Apache vhost | `deploy/apache/wiki.rmhstudios.com.conf` |
| DNS record | `deploy/terraform/dns.tf` (`cloudflare_record.wiki`) |
| MediaWiki Action API client (server-only) | `lib/wiki/mediawiki.server.ts` |
| Schemas and typed contracts | `lib/wiki/wiki-schema.ts`, `lib/wiki/wiki.contract.ts` |
| Admin API (list, create, read, update, delete, seed, sidebar) | `lib/wiki/api/*.server.ts` |
| Writing assistant (event stream) | `app/routes/api/admin/wiki/assist.ts`, prompt `WIKI_WRITE` in `lib/ai/prompts/index.ts` |
| Admin page | `app/routes/_site/admin/wiki.tsx`, `components/admin/wiki/` |
| Sidebar (`MediaWiki:Sidebar`) | `lib/wiki/sidebar.server.ts` |
| Starter pages (wikitext) | `lib/wiki/starter-pages.ts`, `lib/wiki/seed.server.ts` |
| Scripts | `scripts/wiki/seed.ts`, `scripts/wiki/sidebar.ts` |
| Tests | `lib/wiki/__tests__/`, `deploy/__tests__/wiki-deploy.test.ts` |

## First-time setup (production)

Nothing here runs on a deploy. The `mediawiki` service is behind the `wiki`
compose profile, so a stack that has not done these steps is unaffected. Run
the commands from the repository checkout on the VPS, after a deploy that
contains the wiki code.

1. **Database.** MediaWiki keeps everything (pages, history, users, settings)
   in its own database on the host Postgres, in a schema called `mediawiki`:

   ```bash
   sudo -u postgres psql -c "CREATE ROLE mediawiki LOGIN PASSWORD '<db-password>'"
   sudo -u postgres psql -c "CREATE DATABASE mediawiki OWNER mediawiki"
   ```

   Postgres must accept that role from the Docker bridge. If the existing
   `pg_hba.conf` rule for the containers names the site's database or role
   rather than `all`, add the same line for `mediawiki` and reload Postgres.

2. **Environment.** Add to `.env.production`:

   ```bash
   MEDIAWIKI_DB_PASS=<db-password>
   MEDIAWIKI_SECRET_KEY=<output of: openssl rand -hex 32>
   ```

3. **Build and start the container** (once; `restart: unless-stopped` keeps
   it up). The image is built on the host from `deploy/mediawiki/`; it is not
   part of the CI images:

   ```bash
   docker compose -p rmhstudios-prod --env-file .env.production --profile wiki up -d --build mediawiki
   ```

4. **Bootstrap.** This creates the tables and the administrator account,
   runs `update.php`, and prints the bot password the site uses. It runs inside
   the container, so the host needs no PHP:

   ```bash
   docker exec -e MEDIAWIKI_ADMIN_PASSWORD='<a strong password>' \
     rmhstudios-prod-mediawiki wiki-bootstrap
   ```

   The administrator is called `Admin` (set `MEDIAWIKI_ADMIN_USER` as well to
   choose another name). Its password, at least 10 characters, is used only to
   sign in at `wiki.rmhstudios.com` for MediaWiki's own pages; keep it in the
   password manager. The last two lines of output are the bot password.

5. **Connect the site.** Add those two lines to `.env.production`, then
   recreate `web` so it reads them (a blue/green swap, no downtime):

   ```bash
   MEDIAWIKI_BOT_USER=Admin@rmhsite
   MEDIAWIKI_BOT_PASSWORD=<the printed password>
   ```

   ```bash
   ./deploy.sh production
   ```

6. **Apache.** Install the vhost (DNS for `wiki.rmhstudios.com` must point at
   the same Cloudflare-proxied origin as the main site):

   ```bash
   sudo cp deploy/apache/wiki.rmhstudios.com.conf /etc/apache2/sites-available/wiki.rmhstudios.com.conf
   sudo a2ensite wiki.rmhstudios.com
   sudo apachectl configtest && sudo systemctl reload apache2
   ```

7. **Sidebar and starter pages.** Sign in to rmhstudios.com as an admin, open
   `/admin/wiki`, press **Update sidebar**, then **Add starter pages**. Both
   are safe to press again: the sidebar is replaced with the current one, and
   pages that already exist are never overwritten. The one exception is the
   main page while it still holds the placeholder MediaWiki's installer wrote.

8. **Check.** `https://wiki.rmhstudios.com` shows the main page in the
   Wikipedia look, signed out.

### Moving from the Wiki.js wiki

The wiki used to be Wiki.js 2 (the `wikijs` service). If that was ever set
up on the host, stop and remove its container
(`docker rm -f rmhstudios-prod-wikijs`), delete `WIKIJS_*` from
`.env.production`, and, once nothing in it is wanted, drop its database
(`DROP DATABASE wikijs; DROP ROLE wikijs;`). Its pages are Markdown and do not
carry over on their own; recreate any that matter from `/admin/wiki`, where the
assistant can turn pasted Markdown into wikitext.

## Local development

Start a Postgres role and database as in step 1, then run the image on port
7010 (the compose service works:
`docker compose --profile wiki up -d --build mediawiki` with
`MEDIAWIKI_DB_*`, `MEDIAWIKI_SECRET_KEY` and
`MEDIAWIKI_SERVER=http://localhost:7010` set), run `wiki-bootstrap` in the
container as in step 4, and put the printed bot password in `.env` with
`MEDIAWIKI_URL=http://localhost:7010` and `WIKI_PUBLIC_URL=http://localhost:7010`.
Then open `/admin/wiki`. `pnpm wiki:sidebar` and `pnpm wiki:seed` do what the
two buttons do.

Without `MEDIAWIKI_BOT_USER` and `MEDIAWIKI_BOT_PASSWORD` the admin page shows
the setup message and makes no request to the wiki.

## How admin access works

- `/api/admin/wiki/**` is `auth: 'admin'`: signed out is 401, signed in without
  `isAdmin` is 403. That check is the only thing between a visitor and the bot
  password.
- The bot password belongs to the administrator account and is limited to the
  grants the admin page uses (read, edit, create, delete, and edit the
  interface namespace for the sidebar). It lives in the server environment and
  is sent only from the site to the `mediawiki` container over the compose
  network. Each server process signs in once and keeps the session; every call
  asserts it is still signed in, and a stale session or token signs in again.
- Create, update, delete, seed and sidebar are written to the admin audit log
  (`wiki.page.create`, `wiki.page.update`, `wiki.page.delete`, `wiki.seed`,
  `wiki.sidebar`). On the wiki itself every one of those edits is by `Admin`;
  the audit log says which site admin made it.
- An edit is saved on top of the revision the editor opened. If someone saved
  in between, MediaWiki merges the two where it can and otherwise refuses the
  save as an edit conflict (409), so one admin never silently overwrites
  another.
- A page's title cannot be changed from the site; move a page in MediaWiki
  itself. The admin page lists articles in the main namespace and nothing else.
- Pages are wikitext and public.

## Who can do what on the wiki

`LocalSettings.php` sets it, and `deploy/__tests__/wiki-deploy.test.ts` holds
it: everyone reads, nobody can create an account, and only sysops edit, create,
move or delete. Uploads and e-mail are off, so the container keeps no files.
To let more people edit, create their accounts as the administrator
(`Special:CreateAccount` works for sysops) and add them to the sysop group.

## The look

The Vector skin, set in `LocalSettings.php`, is the whole look: nothing is
overridden. The logo and favicon are the main site's `favicon.svg`. The
sidebar is the page `MediaWiki:Sidebar`, written by `applyWikiSidebar()`: a
Navigation group, the starter articles, and a link back to rmhstudios.com.
Change it by editing `lib/wiki/sidebar.server.ts`, deploying, and pressing
**Update sidebar** again.

## The writing assistant

The editor sends an instruction, the title and the current body to
`POST /api/admin/wiki/assist`, which streams the whole page back from DeepSeek
through the shared provider (`streamTask('document', …)`, metered in
`AiUsage`). An empty body asks for a new page; otherwise the page comes back
with the instruction applied, in wikitext. The text lands in the editor and is
saved only when the admin saves. It uses `DEEPSEEK_API_KEY` and the
`RMHARK_AI_MODEL` model, and has no settings of its own. The prompt tells the
model not to invent facts and to leave a `[placeholder]` instead, so read a
draft before saving it.

## Operations

- **Rotating the bot password.** Run `wiki-bootstrap` again (step 4; the
  administrator password is needed only for a first install). It issues a new
  bot password and revokes the old one; update `.env.production` and redeploy.
- **A wrong or revoked bot password fails loudly.** The site cannot sign in,
  the admin page shows "The wiki did not answer", and the web log says
  `[wiki] sign-in refused`.
- **Upgrades.** The image is pinned to the 1.43 long-term-support line, and
  `docker compose ... up -d --build mediawiki` picks up its point releases.
  Moving to the next LTS is a change to the `FROM` line (and the compose image
  tag), then a rebuild and `wiki-bootstrap`, which runs `update.php`.
- **Backups.** `deploy/backup/pg-backup.sh` dumps the site's database only.
  The `mediawiki` database is not in it yet; until it is, back it up separately
  (`pg_dump --format=custom mediawiki`). The container holds nothing else.
- **Jobs.** MediaWiki updates link colours and caches through its job queue,
  which runs one job after each page view. A quiet wiki can lag; run
  `docker exec rmhstudios-prod-mediawiki php maintenance/run.php runJobs` to
  drain it. The seed purges the pages it creates, so starter pages never
  start with red links.
- **Health.** The container's healthcheck reads `api.php` on port 80; from the
  host, `curl -s 'http://127.0.0.1:7010/api.php?action=query&meta=siteinfo&format=json'`.
