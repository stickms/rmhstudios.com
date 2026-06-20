# Runtime base for discord-bot: Alpine + git/ssh for RMHBot worktrees.
# Built + pushed once (see `make base-images`), then pulled by rules_oci as the
# base for //go-services/images:discord-bot_image.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata git openssh-client \
    && addgroup -S app && adduser -S app -G app
USER app
