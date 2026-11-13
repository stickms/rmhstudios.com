# The wiki (wiki.rmhstudios.com)

The public wiki is [Wiki.js](https://js.wiki) 2, running as its own container
on its own subdomain. It is a separate site from rmhstudios.com on purpose: it
shares no shell, stylesheet or design tokens with the main site, and it is
styled after Wikipedia (the classic Vector skin). Everyone can read it. Site
admins create, edit and delete its pages from **rmhstudios.com/admin/wiki**,
with a DeepSeek writing assistant in the editor. Admins do not get a second
account: the site holds one Wiki.js API key and puts its own admin check in
front of it.

```
visitor ── Cloudflare ── Apache (wiki.rmhstudios.com.conf) ── wikijs :7010 ── Postgres (database `wikijs`)
                                                                 ▲
site admin ── /admin/wiki ── /api/admin/wiki/** (auth: admin) ───┘  GraphQL over compose DNS, WIKIJS_API_KEY
                                    └── /api/admin/wiki/assist ── DeepSeek (streamed)
```

## Where things are

| Piece | Path |
| ----- | ---- |
| Compose service (`wikijs`, profile `wiki`, loopback port 7010) | `docker-compose.yml` |
| Apache vhost | `deploy/apache/wiki.rmhstudios.com.conf` |
| DNS record | `deploy/terraform/dns.tf` (`cloudflare_record.wiki`) |
| Wiki.js GraphQL client (server-only) | `lib/wiki/wikijs.server.ts` |
| Schemas and typed contracts | `lib/wiki/wiki-schema.ts`, `lib/wiki/wiki.contract.ts` |
| Admin API (list, create, read, update, delete, seed) | `lib/wiki/api/*.server.ts` |
| Writing assistant (event stream) | `app/routes/api/admin/wiki/assist.ts`, prompt `WIKI_WRITE` in `lib/ai/prompts/index.ts` |
| Admin page | `app/routes/_site/admin/wiki.tsx`, `components/admin/wiki/` |
| Wikipedia look (CSS override, site title, sidebar navigation) | `lib/wiki/wikipedia-theme.ts`, `lib/wiki/appearance.server.ts` |
| Starter pages | `lib/wiki/starter-pages.ts`, `lib/wiki/seed.server.ts` |
| Setup scripts | `scripts/wiki/bootstrap.mjs`, `scripts/wiki/theme.ts`, `scripts/wiki/seed.ts` |
| Tests | `lib/wiki/__tests__/`, `deploy/__tests__/wiki-deploy.test.ts` |

## First-time setup (production)

Nothing here runs on a deploy. The `wikijs` service is behind the `wiki`
compose profile, so a stack that has not done these steps is unaffected. Run
the commands from the repository checkout on the VPS, after a deploy that
contains the wiki code.

1. **Database.** Wiki.js keeps everything (pages, history, uploads, settings)
   in its own database on the host Postgres:

   ```bash
   sudo -u postgres psql -c "CREATE ROLE wikijs LOGIN PASSWORD '<db-password>'"
   sudo -u postgres psql -c "CREATE DATABASE wikijs OWNER wikijs"
   ```

   Postgres must accept that role from the Docker bridge. If the existing
   `pg_hba.conf` rule for the containers names the site's database or role
   rather than `all`, add the same line for `wikijs` and reload Postgres.

2. **Environment.** Add to `.env.production`:

   ```bash
   WIKIJS_DB_PASS=<db-password>
   ```

3. **Start the container** (once; `restart: unless-stopped` keeps it up):

   ```bash
   docker compose -p rmhstudios-prod --env-file .env.production --profile wiki up -d wikijs
   docker logs -f rmhstudios-prod-wikijs   # wait for "Browse to http://YOUR-SERVER-IP:3000/ to complete setup!"
   ```

4. **Bootstrap.** This finishes the Wiki.js setup wizard, turns its API on and
   prints the API key. It runs inside the container, so the host needs no Node:

   ```bash
   docker exec -i \
     -e WIKIJS_ADMIN_EMAIL='<you>' -e WIKIJS_ADMIN_PASSWORD='<a strong password>' \
     rmhstudios-prod-wikijs node - < scripts/wiki/bootstrap.mjs
   ```

   The email and password become the Wiki.js root administrator, used only to
   sign in at `wiki.rmhstudios.com/login` for Wiki.js's own settings. Keep them
   in the password manager. The last line of output is the API key.

5. **Connect the site.** Add the key to `.env.production`, then recreate `web`
   so it reads it (a blue/green swap, no downtime):

   ```bash
   WIKIJS_API_KEY=<the printed key>
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

7. **Theme and starter pages.** Sign in to rmhstudios.com as an admin, open
   `/admin/wiki`, press **Apply wiki theme**, then **Add starter pages**. Both
   are safe to press again: the theme is replaced with the current one, and
   pages that already exist are never overwritten.

8. **Check.** `https://wiki.rmhstudios.com` shows the main page in the
   Wikipedia look, signed out.

## Local development

Run Wiki.js any way you like on port 7010 (the compose service works:
`docker compose --profile wiki up -d wikijs` with `WIKIJS_DB_*` pointing at a
local Postgres), then
`WIKIJS_URL=http://localhost:7010 WIKIJS_ADMIN_EMAIL=… WIKIJS_ADMIN_PASSWORD=… pnpm wiki:bootstrap`,
put the key in `.env` as `WIKIJS_API_KEY` with `WIKIJS_URL=http://localhost:7010`
and `WIKI_PUBLIC_URL=http://localhost:7010`, and open `/admin/wiki`.
`pnpm wiki:theme` and `pnpm wiki:seed` do what the two buttons do.

Without `WIKIJS_API_KEY` the admin page shows the setup message and makes no
request to the wiki.

## How admin access works

- `/api/admin/wiki/**` is `auth: 'admin'`: signed out is 401, signed in without
  `isAdmin` is 403. That check is the only thing between a visitor and the key.
- The key has full access to Wiki.js. It lives in the server environment and is
  sent only from the site to the `wikijs` container over the compose network.
- Create, update, delete, seed and theme are written to the admin audit log
  (`wiki.page.create`, `wiki.page.update`, `wiki.page.delete`, `wiki.seed`,
  `wiki.theme`).
- A page's path cannot be changed from the site; move a page in Wiki.js itself.
- Pages are Markdown and public. The site does not create private pages.

## The Wikipedia look

Wiki.js has no theme files to deploy; its look is configuration in its own
database. `applyWikiAppearance()` writes all of it through the API:

- the CSS override (`WIKIPEDIA_CSS`): grey page, white article with the pale
  blue edge, serif headings on hairline rules, blue links, a boxed contents
  list and bordered tables with grey headers;
- the site title ("RMH Studios Wiki") and logo, with comments, ratings and
  personal wikis turned off (visitors read; they have no accounts);
- a static sidebar: Main page, the starter pages, and a link back to
  rmhstudios.com.

Change the look by editing `lib/wiki/wikipedia-theme.ts`, deploying, and
pressing **Apply wiki theme** again. The stylesheet uses Wikipedia's literal
colours and no `--site-*` token, so a change to the main site's palette never
reaches the wiki; `lib/wiki/__tests__/appearance.server.test.ts` holds that.
Its selectors target Wiki.js 2.5's markup, which is one reason the image is
pinned.

## The writing assistant

The editor sends an instruction, the title and the current body to
`POST /api/admin/wiki/assist`, which streams the whole page back from DeepSeek
through the shared provider (`streamTask('document', …)`, metered in
`AiUsage`). An empty body asks for a new page; otherwise the page comes back
with the instruction applied. The text lands in the editor and is saved only
when the admin saves. It uses `DEEPSEEK_API_KEY` and the `RMHARK_AI_MODEL`
model, and has no settings of its own. The prompt tells the model not to invent
facts and to leave a `[placeholder]` instead, so read a draft before saving it.

## Operations

- **The API key expires after three years.** Run the bootstrap command (step
  4) again with the same administrator credentials to issue a new one; it
  skips the steps that are already done.
- **A wrong or expired key reads but does not write.** Wiki.js treats an
  invalid key as a guest, and guests can read public pages, so the page list
  still loads and saving fails. If saves fail, check the key first.
- **Backups.** `deploy/backup/pg-backup.sh` dumps the site's database only.
  The `wikijs` database is not in it yet; until it is, back it up separately
  (`pg_dump --format=custom wikijs`).
- **Upgrades.** The image is pinned to the 2.5 line. Wiki.js 3 is a different
  product with a different API and is not a drop-in replacement.
- **Health.** `GET /healthz` on port 7010 returns `{"ok":true}` once setup is
  finished. Before that, the setup wizard answers every path with its own page.
