# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — Go microservices image (one Dockerfile, every service)
#
# Build a single service by passing SERVICE (the cmd/<SERVICE> dir) and, when a
# service needs extra OS packages at runtime, EXTRA_PKGS:
#
#   docker build -f go-services/Dockerfile \
#     --build-arg SERVICE=gateway \
#     -t rmhstudios-go-gateway:dev go-services
#
#   # vibe-worker needs headless Chromium; discord-bot needs git for RMHBot:
#   --build-arg SERVICE=vibe-worker  --build-arg EXTRA_PKGS="chromium nss freetype harfbuzz ttf-freefont"
#   --build-arg SERVICE=discord-bot  --build-arg EXTRA_PKGS="git openssh-client"
#
# Mirrors PR #121's philosophy: a tiny, reproducible runtime; the build layer is
# the only thing that changes per service. Statically-linked Go binary on a
# minimal Alpine base → images are a few MB + deps.
# ─────────────────────────────────────────────────────────────────────────────

# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.23.12-alpine AS build
ARG SERVICE
WORKDIR /src

# Cache module downloads independently of source changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
# CGO disabled → fully static binary that runs on a bare Alpine/scratch base.
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    test -n "$SERVICE" || (echo "SERVICE build-arg is required" && exit 1) && \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/app ./cmd/${SERVICE}

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM alpine:3.20 AS runtime
ARG EXTRA_PKGS=""
# ca-certificates: outbound TLS (Discord, DeepSeek). tzdata: doctrine-worker's
# per-timezone time.LoadLocation. EXTRA_PKGS: per-service runtime deps.
RUN apk add --no-cache ca-certificates tzdata ${EXTRA_PKGS} && \
    addgroup -S app && adduser -S app -G app
# Default Chromium path for vibe-worker (no-op for other services).
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=build /out/app /usr/local/bin/app
USER app
ENTRYPOINT ["/usr/local/bin/app"]
