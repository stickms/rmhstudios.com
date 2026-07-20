# Go Backend & Bazel Runbooks

## Assets / CDN cutover (library, music, models, sprites)

The `assets` Go service streams these four prefixes from the bucket. The
front door (Apache today, or the gateway) re-points one prefix at a time;
rollback is a one-line revert. The migration is independent of the Node→Go
gateway cutover.

1. **Populate the bucket:** `make assets-sync` (after a frontend build, so
   generated library covers are included). Re-run on every deploy — it's
   idempotent (`mc mirror` uploads only changed/new files).
2. **Deploy the assets service:** it ships in the Go chart
   (`deploy/helm/rmhstudios-go`, service `assets`, port 7007) via
   `./deploy/deploy-go.sh production` (single-node) or
   `REGISTRY=… ./deploy/deploy-go.sh production` (multi-node).
3. **Smoke-test directly** (before routing public traffic):
   `curl -s -o /dev/null -w "%{http_code}\n" http://<assets-host>:7007/models/<known>.glb`
   and a Range request: `curl -s -D- -o /dev/null -H 'Range: bytes=0-1023' http://<assets-host>:7007/music/<known>.mp3` → expect `206` + `Content-Range`.
4. **Cut over the smallest prefix first (`/models`).**
   - Gateway front door: already routed (Task 4) once the gateway is the edge.
   - Apache front door: replace `Alias /models …` + `ProxyPass /models !` with
     `ProxyPass /models http://<assets-host>:7007/models` (+ `ProxyPassReverse`),
     then `apachectl configtest && systemctl reload apache2`.
     Verify behind Cloudflare; watch error rate, latency, and range behavior.
5. **Roll the rest** one at a time: `music` → `sprites` → `library`.
6. **Phase 4 — slim the image:** activate the `.dockerignore` exclusion for
   `public/library` (uncomment it in the "Assets/CDN cutover — Phase 4" block).
   `public/models` no longer exists (its two unused `.glb` files were deleted),
   and the Dockerfile's public-root sanity check already targets
   `public/robots.txt`, so no Dockerfile change is needed here.
   Rebuild and confirm the image is ~500 MB lighter.
7. **Rollback (any phase):** re-point the prefix back to the Apache `Alias` /
   disk (or remove the gateway prefix) and reload.
