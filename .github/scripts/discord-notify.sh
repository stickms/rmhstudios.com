#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Post or edit ONE Discord embed that tracks the push → build → deploy pipeline.
#
# GitHub Actions posts the embed at build-start (capturing the message id, which
# it then hands to the VPS in the trigger payload), and BOTH Actions and
# deploy.sh EDIT that same message — so the whole story lives in a single embed
# that evolves: 🟡 build started → 🔵 images pushed → 🟣 deploying on VPS →
# ✅ deployed / ❌ failed.
#
# Best-effort by design: Discord being unreachable must NEVER fail the build, so
# every path exits 0.
#
# Usage:
#   discord-notify.sh post <color> <title> <description> <footer>
#   discord-notify.sh edit <color> <title> <description> <footer>
#
# Env:
#   DISCORD_WEBHOOK_URL  when unset the script no-ops (the feature is simply off)
#   DISCORD_MSG_ID       required for `edit`; `post` appends it to $GITHUB_ENV so
#                        later steps (and the trigger payload) can read it
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

mode="${1:-}"
color="${2:-0}"
title="${3:-}"
description="${4:-}"
footer="${5:-}"

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
    echo "DISCORD_WEBHOOK_URL not set — skipping Discord notification."
    exit 0
fi

payload=$(jq -nc \
    --arg t "$title" \
    --arg d "$description" \
    --arg f "$footer" \
    --argjson c "$color" \
    '{embeds:[{title:$t, description:$d, color:$c, footer:{text:$f}}]}') || {
    echo "Could not build Discord payload — skipping."
    exit 0
}

case "$mode" in
    post)
        # ?wait=true makes Discord return the created message so we can grab its id.
        resp=$(curl -sS --max-time 15 -X POST "${DISCORD_WEBHOOK_URL}?wait=true" \
            -H 'Content-Type: application/json' -d "$payload" 2>/dev/null) || {
            echo "Discord POST failed — continuing."
            exit 0
        }
        id=$(printf '%s' "$resp" | jq -r '.id // empty' 2>/dev/null || true)
        if [ -n "$id" ] && [ -n "${GITHUB_ENV:-}" ]; then
            echo "DISCORD_MSG_ID=$id" >> "$GITHUB_ENV"
        fi
        echo "Posted Discord message ${id:-<none>}."
        ;;
    edit)
        if [ -z "${DISCORD_MSG_ID:-}" ]; then
            echo "No DISCORD_MSG_ID to edit — skipping."
            exit 0
        fi
        curl -sS --max-time 15 -X PATCH "${DISCORD_WEBHOOK_URL}/messages/${DISCORD_MSG_ID}" \
            -H 'Content-Type: application/json' -d "$payload" >/dev/null 2>&1 ||
            echo "Discord PATCH failed — continuing."
        echo "Edited Discord message ${DISCORD_MSG_ID}."
        ;;
    *)
        echo "Usage: discord-notify.sh {post|edit} <color> <title> <description> <footer>" >&2
        exit 0
        ;;
esac
