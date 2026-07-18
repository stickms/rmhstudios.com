# Database backups (rmhstudios)

The P0 operational floor from the rewrite design
(`docs/full-rewrite-design-2026-07-18.md` §2.3, task R0-T1). Before this
existed, a host/disk failure meant **total, unrecoverable loss of all user
data** — there was no `pg_dump`, no WAL archiving, nothing.

Two legs, install both:

## 1. Nightly logical backup (this directory)

`pg-backup.sh` dumps the DB (`pg_dump -Fc`, compressed) and uploads it to
Cloudflare R2, keeping 30 dailies + 12 monthly snapshots. It is idempotent and
**fail-closed**: missing credentials abort before any dump, so a misconfigured
host is loud rather than silently backup-less.

Install as a systemd timer (privileged, out-of-sandbox — the CD deploy can't do
this): see the header of `deploy/systemd/rmh-db-backup.service`.

```bash
sudo install -d -m 700 /etc/rmhstudios
sudo tee /etc/rmhstudios/db-backup.env >/dev/null <<'EOF'
DATABASE_URL=postgres://USER:PASS@localhost:5432/rmhstudios
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...        # R2 token scoped to the backup bucket (Object R/W)
R2_SECRET_ACCESS_KEY=...
R2_BACKUP_BUCKET=rmh-db-backups
EOF
sudo chmod 600 /etc/rmhstudios/db-backup.env
sudo cp deploy/systemd/rmh-db-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rmh-db-backup.timer
sudo systemctl start rmh-db-backup.service   # run one now
```

## 2. WAL archiving (point-in-time recovery)

Logical dumps give you at-most-24h-loss recovery. For PITR, archive WAL
continuously. Recommended: [`wal-g`](https://github.com/wal-g/wal-g) to the same
R2 bucket. Append to `deploy/postgres/postgresql.tuning.conf` (applied by
`deploy/apply-perf-tuning.sh`):

```conf
# WAL archiving for PITR (rewrite R0-T1). wal-g reads WALG_* from the postgres
# service environment; scope an R2 token to the backup bucket.
archive_mode = on
archive_command = 'wal-g wal-push %p'
archive_timeout = 60
wal_level = replica
```

Provision `wal-g` on the host with `WALG_S3_PREFIX=s3://rmh-db-backups/wal`,
`AWS_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, and the R2 creds;
take a base backup (`wal-g backup-push`) on a schedule (a second systemd timer,
or extend `pg-backup.sh`). This is a host-provisioning step, not repo code.

## 3. Prove it works — the restore drill

`restore-drill.sh` pulls the newest daily dump, restores it into a throwaway
Docker Postgres, and sanity-checks it. **Run quarterly** and after any change to
the backup or migration flow.

```bash
sudo -E env $(cat /etc/rmhstudios/db-backup.env | grep R2_ | xargs) \
  bash deploy/backup/restore-drill.sh
```

A restore you haven't tested does not count. Record the drill date in the ops
log.
