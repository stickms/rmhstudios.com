# Runtime base for supervisor: Alpine + headless Chromium + git/ssh.
# Satisfies the union of vibe-worker (chromium) and discord-bot (git/ssh) deps,
# since the supervisor runs all five background workers in a single process.
# Built + pushed once (see `make base-images`), then pulled by rules_oci as the
# base for //go-services/images:supervisor_image.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata chromium nss freetype harfbuzz ttf-freefont \
        git openssh-client \
    && addgroup -S app && adduser -S app -G app
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER app
