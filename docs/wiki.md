# The wiki (wiki.rmhstudios.com)

The public wiki is [Wiki.js](https://js.wiki) 2, running as its own container
on its own subdomain. Everyone can read it. Site admins create, edit and delete
its pages from **rmhstudios.com/admin/wiki**, with a DeepSeek writing assistant
in the editor. Admins do not get a second account: the site holds one Wiki.js
API key and puts its own admin check in front of it.

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
| Starter pages | `lib/wiki/starter-pages.ts`, `lib/wiki/seed.server.ts` |
| Setup scripts | `scripts/wiki/bootstrap.ts`, `scripts/wiki/seed.ts` |

## First-time setup (production)

Nothing here runs on a deploy. The `wikijs` service is behind the `wiki`
compose profile, so a stack that has not done these steps is unaffected.

1. **Database.** Wiki.js keeps everything (pages, history, uploads, settings)
   in its own database on the host Postgres:

   ```bash
   sudo -u postgres psql -c "CREATE ROLE wikijs LOGIN PASSWORD '<password>'"
   sudo -u postgres psql -c "CREATE DATABASE wikijs OWNER wikijs"
   ```

   Postgres must accept that role from the Docker bridge, the same
   `pg_hba.conf` rule the site's own role already has.

2. **Environment.** In `.env.production` set `WIKIJS_DB_PASS=<password>` (the
   other `WIKIJS_DB_*` values have working defaults; see `.env.example`).

3. **Start the container** (once; `restart: unless-stopped` keeps it up):

   ```bash
   docker compose -p rmhstudios-prod --env-file .env.production --profile wiki up -d wikijs
   ```

4. **Bootstrap.** This finishes the Wiki.js setup wizard, turns its API on and
   prints the API key:

   ```bash
   WIKIJS_URL=http://localhost:7010 \
   WIKIJS_ADMIN_EMAIL=<you> WIKIJS_ADMIN_PASSWORD='<a strong password>' \
   pnpm wiki:bootstrap
   ```

   The email and password become the Wiki.js root administrator, used only to
   sign in at `wiki.rmhstudios.com/login` for Wiki.js's own settings (theme,
   navigation, search). Keep them in the password manager.

5. **Connect the site.** Put the printed key in `.env.production` as
   `WIKIJS_API_KEY`, then deploy (or restart `web`) so the site picks it up.

6. **Apache and DNS.** Install `deploy/apache/wiki.rmhstudios.com.conf` (the
   steps are in its header) and create the `wiki` DNS record
   (`terraform apply` in `deploy/terraform/`, or by hand in Cloudflare, proxied).

7. **Starter pages.** Press **Add starter pages** on `/admin/wiki`, or run
   `WIKIJS_URL=http://localhost:7010 WIKIJS_API_KEY=<key> pnpm wiki:seed`.
   Both create only the pages that are missing and never overwrite one.

## Local development

Run Wiki.js any way you like on port 7010 (the compose service works:
`docker compose --profile wiki up -d wikijs` with `WIKIJS_DB_*` pointing at a
local Postgres), then `pnpm wiki:bootstrap`, put the key in `.env` as
`WIKIJS_API_KEY` with `WIKIJS_URL=http://localhost:7010` and
`WIKI_PUBLIC_URL=http://localhost:7010`, and open `/admin/wiki`.

Without `WIKIJS_API_KEY` the admin page shows the setup message and makes no
request to the wiki.

## How admin access works

- `/api/admin/wiki/**` is `auth: 'admin'`: signed out is 401, signed in without
  `isAdmin` is 403. That check is the only thing between a visitor and the key.
- The key has full access to Wiki.js. It lives in the server environment and is
  sent only from the site to the `wikijs` container over the compose network.
- Create, update, delete and seed are written to the admin audit log
  (`wiki.page.create`, `wiki.page.update`, `wiki.page.delete`, `wiki.seed`).
- A page's path cannot be changed from the site; move a page in Wiki.js itself.
- Pages are Markdown and public. The site does not create private pages.

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

- **The API key expires after three years.** Run `pnpm wiki:bootstrap` again
  with the same administrator credentials to issue a new one; it skips the
  steps that are already done.
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
