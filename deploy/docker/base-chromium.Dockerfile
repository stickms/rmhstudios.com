# Runtime base for vibe-worker: Alpine + headless Chromium.
# Built + pushed once (see `make base-images`), then pulled by rules_oci as the
# base for //go-services/images:vibe-worker_image.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata chromium nss freetype harfbuzz ttf-freefont \
    && addgroup -S app && adduser -S app -G app
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER app
