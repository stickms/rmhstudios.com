# rmhstudios.com — single-command build/deploy entrypoint.
# Bazel (via bazelisk) owns the hermetic core (Go binaries + container images);
# this Makefile is the ergonomic face and orchestrates the edges (frontend leaf,
# special base images, Helm deploy).

BAZEL    ?= bazelisk
PLATFORM ?= linux_amd64   # target arch for images; override with PLATFORM=linux_arm64
# Realtime hubs (gateway/gamehub/rmhmusic/rmhtube/rmhbox) + the Helm/k8s deploy
# path were removed in the rewrite (design §5.2). Production Go is the four
# background workers, built into the app-full image; the Node hubs serve
# realtime. What remains here builds/pushes the standalone worker images.
SERVICES := recap doctrine-worker vibe-worker discord-bot
SHA      := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
REGISTRY ?=
GUARD    := ./scripts/preflight.sh --guard

.PHONY: help bootstrap dev gazelle build images base-images push test clean assets-sync

help: ## list targets
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

assets-sync: ## Mirror public/{library,music,models,sprites} to the S3 bucket (reads S3_* env)
	./scripts/assets-sync.sh

bootstrap: ## install/verify all toolchain prerequisites
	./scripts/preflight.sh

dev: ## run the existing pnpm dev loop (Bazel not involved)
	pnpm run dev

gazelle: ## regenerate Go BUILD.bazel files
	$(BAZEL) run //:gazelle

build: ## build artifacts: all Go binaries + frontend bundle
	@$(GUARD)
	$(BAZEL) build //go-services/cmd/...
	$(BAZEL) run //:frontend

base-images: ## build + push the special runtime bases (chromium/git)
	@$(GUARD)
	docker build -f deploy/docker/base-chromium.Dockerfile -t ghcr.io/rmhstudios/rmhstudios-go-base-chromium:latest deploy/docker
	docker build -f deploy/docker/base-git.Dockerfile      -t ghcr.io/rmhstudios/rmhstudios-go-base-git:latest      deploy/docker
	docker push ghcr.io/rmhstudios/rmhstudios-go-base-chromium:latest
	docker push ghcr.io/rmhstudios/rmhstudios-go-base-git:latest

images: ## build + load every service image into Docker
	@$(GUARD)
	@for svc in $(SERVICES); do \
		echo "==> loading rmhstudios-go-$$svc ($(PLATFORM))"; \
		$(BAZEL) run --config=$(PLATFORM) //go-services/images:$${svc}_load || exit 1; \
	done

push: ## push every service image to $REGISTRY (REGISTRY required)
	@test -n "$(REGISTRY)" || { echo "REGISTRY is required for push"; exit 1; }
	@$(GUARD)
	@for svc in $(SERVICES); do \
		echo "==> pushing $(REGISTRY)/rmhstudios-go-$$svc:$(SHA) ($(PLATFORM))"; \
		$(BAZEL) run --config=$(PLATFORM) //go-services/images:$${svc}_push -- \
			--repository=$(REGISTRY)/rmhstudios-go-$$svc --tag=$(SHA) || exit 1; \
	done

test: ## run Go tests (Bazel) + frontend tests (vitest)
	@$(GUARD)
	$(BAZEL) test --build_tests_only //go-services/...
	pnpm exec vitest run

clean: ## remove Bazel outputs
	$(BAZEL) clean
