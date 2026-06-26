#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# secrets.sh — dev-facing helper for managing encrypted production secrets.
#
# The whole point: a dev adds or changes a secret the same way they change any
# other code — edit, commit, open a PR. The value is encrypted at rest, the diff
# shows WHICH key changed (not the value), and only holders of the age key can
# decrypt. No SSH to the box, no Slack-ing secrets around.
#
# Commands:
#   ./scripts/secrets.sh edit [env]      # open the encrypted file in $EDITOR
#   ./scripts/secrets.sh view [env]      # print decrypted values (to a TTY only)
#   ./scripts/secrets.sh keygen          # generate a new age key (operator setup)
#   ./scripts/secrets.sh import [env]    # encrypt an existing .env.<env> -> repo
#   ./scripts/secrets.sh rotate-keys [env] # re-encrypt after editing .sops.yaml
#
# `env` defaults to "production". Requires `sops` (+ `age`/`age-keygen` for keygen).
# Key discovery: SOPS_AGE_KEY_FILE, then SOPS_AGE_KEY, then ~/.config/sops/age/keys.txt
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

CMD="${1:-help}"
ENVIRONMENT="${2:-production}"
ENC_FILE="deploy/secrets/${ENVIRONMENT}.enc.env"

need_sops() {
    command -v sops >/dev/null 2>&1 || { echo "FATAL: sops not installed — https://github.com/getsops/sops" >&2; exit 1; }
}

case "$CMD" in
    edit)
        need_sops
        [ -f "$ENC_FILE" ] || { echo "FATAL: $ENC_FILE not found (run 'import' first)." >&2; exit 1; }
        # sops decrypts to a temp file, opens $EDITOR, re-encrypts on save. The
        # plaintext never touches the working tree.
        exec sops "$ENC_FILE"
        ;;
    view)
        need_sops
        [ -t 1 ] || { echo "FATAL: refusing to print secrets to a non-TTY (pipe/redirect)." >&2; exit 1; }
        exec sops --decrypt "$ENC_FILE"
        ;;
    keygen)
        command -v age-keygen >/dev/null 2>&1 || { echo "FATAL: age-keygen not installed." >&2; exit 1; }
        DEST="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
        mkdir -p "$(dirname "$DEST")"
        [ -f "$DEST" ] && { echo "FATAL: $DEST already exists — refusing to overwrite." >&2; exit 1; }
        age-keygen -o "$DEST"
        chmod 600 "$DEST"
        echo
        echo "Private key written to: $DEST   (keep it OFF git; back it up securely)"
        echo "Public key (put this in .sops.yaml under 'age:'):"
        grep -oE 'age1[0-9a-z]+' "$DEST" | head -1
        ;;
    import)
        need_sops
        SRC=".env.${ENVIRONMENT}"
        [ -f "$SRC" ] || { echo "FATAL: $SRC not found to import." >&2; exit 1; }
        echo "This encrypts the SECRET keys from $SRC into $ENC_FILE."
        echo "Public (non-secret) keys should instead live in deploy/config/public.env."
        mkdir -p "$(dirname "$ENC_FILE")"
        cp "$SRC" "$ENC_FILE"
        sops --encrypt --in-place "$ENC_FILE"
        echo "Done. Review with: git diff $ENC_FILE   (keys visible, values encrypted)"
        ;;
    rotate-keys)
        need_sops
        # Apply a changed recipient list in .sops.yaml to an existing file.
        exec sops updatekeys "$ENC_FILE"
        ;;
    *)
        grep -E '^#( |─)' "$0" | sed 's/^# \{0,1\}//'
        ;;
esac
