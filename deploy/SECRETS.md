# Managing environment variables & secrets

This repo manages production config in **two tiers**, both version-controlled,
so a dev can add or change an env var the same way they change any other code:
**edit → commit → PR → merge → it deploys.** No SSH to the box, no secrets in
Slack, and every change is reviewable.

| Tier | Lives in | In git? | Who can edit | Example keys |
|------|----------|---------|--------------|--------------|
| **Public config** | `deploy/config/public.env` | ✅ plaintext | any dev, via PR | `VITE_*` URLs, OAuth **client IDs**, feature flags, CORS origins |
| **Secrets** | `deploy/secrets/production.enc.env` | ✅ **encrypted** (SOPS) | any dev *with the age key*, via PR | client **secrets**, bot tokens, `DATABASE_URL`, `*_SECRET`, API keys |

At deploy time, `scripts/materialize-env.sh` concatenates the two into
`.env.production` (git-ignored, regenerated every deploy). Both `deploy.sh`
(Compose) and `deploy/deploy-k8s.sh` already consume `.env.production` via
`--env-file` / `--from-env-file`, so **the deploy pipeline itself didn't have to
change** — it just gets its env file from git now instead of a hand-edited file
on the server.

```
 dev edits ──▶ deploy/config/public.env        (plaintext)
            └▶ deploy/secrets/production.enc.env (SOPS-encrypted)
                          │  git push → main → GitHub webhook
                          ▼
            deploy.sh / deploy-k8s.sh on the VPS
                          │  scripts/materialize-env.sh (decrypts with age key)
                          ▼
                    .env.production  ──▶  docker compose --env-file / k8s Secret
```

Encryption is [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age).
SOPS encrypts **values only** — the keys stay readable — so a PR diff shows
*which* secret changed without ever exposing the value.

---

## Day-to-day: how a dev adds or changes an env var

**A non-secret** (a URL, client ID, a flag) — just edit the plaintext file:

```bash
$EDITOR deploy/config/public.env
git commit -am "config: point socket URL at new host" && git push   # open a PR
```

**A secret** (token, password, client secret) — edit through SOPS so it stays
encrypted (you need the age key configured, see setup below):

```bash
./scripts/secrets.sh edit          # opens the decrypted file in $EDITOR, re-encrypts on save
git commit -am "secrets: rotate Discord bot token" && git push        # open a PR
```

The committed diff looks like this — reviewable, no value leaked:

```diff
-DISCORD_BOT_TOKEN=ENC[AES256_GCM,data:9f5a...,type:str]
+DISCORD_BOT_TOKEN=ENC[AES256_GCM,data:1c7e...,type:str]
```

Merge to `main` → the existing webhook redeploys → `materialize-env.sh`
regenerates `.env.production` → containers pick up the new value. Done.

Other helper commands:

```bash
./scripts/secrets.sh view          # print decrypted values (TTY only; refuses to pipe)
./scripts/secrets.sh import        # encrypt an existing .env.production into the repo
./scripts/secrets.sh keygen        # generate a new age key (operator setup)
./scripts/secrets.sh rotate-keys   # re-encrypt after changing recipients in .sops.yaml
```

---

## First-time setup (one-time, by an operator)

> The prototype ships a **throwaway demo key** in `.sops.yaml`. Replace it with a
> real key you control before storing any real secret.

### 1. Install tooling (dev machines + the VPS)

```bash
# sops (https://github.com/getsops/sops/releases) — pick your platform's binary
sudo curl -fsSL -o /usr/local/bin/sops \
  https://github.com/getsops/sops/releases/download/v3.9.4/sops-v3.9.4.linux.amd64
sudo chmod +x /usr/local/bin/sops
# age (Debian/Ubuntu)
sudo apt-get install -y age          # or: brew install age
```

### 2. Generate the team age key

```bash
./scripts/secrets.sh keygen          # writes ~/.config/sops/age/keys.txt, prints the public key
```

- **Private key** (`AGE-SECRET-KEY-…`): store in your password manager / secret
  store. Anyone who can decrypt prod needs it. **Never commit it.**
- **Public key** (`age1…`): paste it into `.sops.yaml` under `age:`, replacing
  the demo key. Add more recipients (other operators, CI) by listing additional
  public keys.

### 3. Encrypt your current production secrets into the repo

On a machine that has the real `.env.production` (e.g. the VPS):

```bash
# 1. Move non-secret keys into deploy/config/public.env (already templated).
# 2. Encrypt the remaining secret keys:
./scripts/secrets.sh import          # encrypts .env.production -> deploy/secrets/production.enc.env
git add .sops.yaml deploy/config/public.env deploy/secrets/production.enc.env
git commit -m "secrets: adopt SOPS-managed env" && git push
```

If you generated a new key in step 2, re-encrypt the demo sample to your key:

```bash
sops updatekeys deploy/secrets/production.enc.env
```

### 4. Put the decryption key on the VPS

The deploy runs as the webhook's child process, so the age key must be readable
by that process. Install it and point SOPS at it:

```bash
sudo install -m600 -o rmhstudios -g rmhstudios keys.txt \
  /home/rmhstudios/.config/sops/age/keys.txt
```

Then export `SOPS_AGE_KEY_FILE` in the **webhook service environment** (the
process that spawns the deploy — see `webhook-server.cjs`). For a systemd unit:

```ini
# /etc/systemd/system/rmhstudios-webhook.service  (drop-in)
[Service]
Environment=SOPS_AGE_KEY_FILE=/home/rmhstudios/.config/sops/age/keys.txt
```

```bash
sudo systemctl daemon-reload && sudo systemctl restart rmhstudios-webhook
```

`materialize-env.sh` reads `SOPS_AGE_KEY_FILE` (or `SOPS_AGE_KEY`) to decrypt.
After this, the next push to `main` regenerates `.env.production` from git.

---

## Where GitHub fits in

- **The review/audit trail is GitHub.** Every env-var change is a commit on a
  PR against `main` — branch protection, required reviewers, and history all
  apply to secrets now, which they couldn't when secrets were hand-edited on the
  box.
- **The trigger is the existing GitHub webhook.** Nothing new to wire: merging
  to `main` fires the same `push` webhook that already drives deploys.
- **The key never goes to GitHub.** Decryption happens on the VPS with the age
  key held there. GitHub only ever sees ciphertext.
- **Optional — decrypt in GitHub Actions instead of on the VPS:** if you later
  move the deploy into Actions, add the age private key as an *Environment
  secret* (`SOPS_AGE_KEY`) on a protected `production` environment and the same
  `materialize-env.sh` works unchanged. Keeping it on the VPS (current model)
  means the secret never leaves your infrastructure.

## Rotating / revoking access

- **Add a person or CI as a recipient:** append their `age1…` public key to
  `.sops.yaml`, run `./scripts/secrets.sh rotate-keys`, commit.
- **Revoke:** remove their public key from `.sops.yaml`, `rotate-keys`, commit —
  **and rotate the underlying secret values**, since they may have cached the
  old plaintext.
- **Compromised age key:** generate a new key (step 2), `rotate-keys` onto it,
  redeploy, and rotate every secret value to be safe.

## Security notes

- `.env.production`, `*.agekey`, and `keys.txt` are git-ignored (see
  `.gitignore`) — the decrypted file and private keys never land in git.
- `materialize-env.sh` writes `.env.production` with `0600` perms and an atomic
  rename, so a half-written file is never read by a concurrent deploy.
- SOPS encryption is deterministic per change, so `deploy.sh`'s env-file
  fingerprint (its build-skip hash) only moves when a value actually changes.
