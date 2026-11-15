# rmhstudios.com — single-command build/deploy entrypoint.
# Bazel (via bazelisk) owns the hermetic core (Go binaries + container images);
# this Makefile is the ergonomic face and orchestrates the edges (frontend leaf).

BAZEL    ?= bazelisk
PLATFORM ?= linux_amd64   # target arch for images; override with PLATFORM=linux_arm64
# Realtime hubs (gateway/gamehub/rmhmusic/rmhtube/rmhbox) + the Helm/k8s deploy
# path were removed in the rewrite (design §5.2), and the last Go worker (the
# Discord bot, with its supervisor and git base image) moved to the Node jobs
# worker (D3). Production Go is `status` + `assets`, built into the app-full
# image; these targets build/push their standalone images.
SERVICES := status assets
SHA      := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
REGISTRY ?=
GUARD    := ./scripts/preflight.sh --guard

.PHONY: help bootstrap dev gazelle build images push test clean assets-sync

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
	pnpm test

clean: ## remove Bazel outputs
	$(BAZEL) clean
