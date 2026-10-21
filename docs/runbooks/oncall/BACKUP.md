# BACKUP — a backup run failed

**Sev3.** `pg-backup.sh` exited non-zero. If it keeps failing,
[A04](A04.md) pages after 26 hours without a good backup.

1. `journalctl -u rmh-db-backup.service -n 100`: the script names what it was doing.
2. Fix it and run `sudo systemctl start rmh-db-backup.service`; a successful
   run clears this and A04.
