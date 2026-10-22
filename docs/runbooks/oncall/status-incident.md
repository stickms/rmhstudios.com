# STATUS — automatic status-page incident

**Sev2** when a component is **down**, **Sev3** when **degraded**. The status
service opened an automatic incident (2 failed checks at 15s) for one
component; the alarm key names it, e.g. `STATUS:rmhbox`.

The alert links to the incident page with its timeline. By component:

- **Realtime / Games, RMHbox, RMHtube** (the hubs): `docker logs <hub> --tail 200`,
  then `docker compose -p rmhstudios-prod --env-file .env.production restart <service>`.
  Players lose their in-progress game on restart; rmhtube restores rooms.
- **Database**: as [A02](A02.md).
- **Background workers** (the Go supervisor): `docker logs <supervisor> --tail 200`;
  look for `worker panic` / `worker exited before shutdown`.
- **Content feed / Sitemap**: render-path failures; check web logs and recent deploys.

Website / App readiness are not forwarded here; the watchdog pages for those
directly ([A01](A01.md), [A02](A02.md)).
