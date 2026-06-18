# rmhstudios-go — developer entrypoints.
# Go runs inside the pinned golang image so no local Go install is required
# (set USE_LOCAL_GO=1 to use a local toolchain instead).

SERVICES := gateway gamehub rmhmusic rmhtube rmhbox recap doctrine-worker vibe-worker discord-bot
IMAGE_PREFIX ?= rmhstudios-go
GO_IMAGE := golang:1.23-alpine
MODCACHE := rmhgo-modcache
BUILDCACHE := rmhgo-buildcache

ifdef USE_LOCAL_GO
GO := go
else
GO := docker run --rm -v "$(CURDIR)":/src -w /src \
	-v $(MODCACHE):/go/pkg/mod -v $(BUILDCACHE):/root/.cache/go-build \
	$(GO_IMAGE) go
endif

.PHONY: all tidy build vet test e2e fmt images helm-lint helm-template clean

all: tidy vet test build ## tidy, vet, test, build

tidy: ## resolve modules
	$(GO) mod tidy

build: ## compile every service
	$(GO) build ./...

vet: ## static analysis
	$(GO) vet ./...

test: ## unit + integration tests
	$(GO) test ./...

e2e: ## full end-to-end suite (spins up Postgres + binaries in Docker)
	bash scripts/e2e/run.sh

fmt: ## gofmt the tree
	$(GO) fmt ./...

images: ## build a container image per service
	@for svc in $(SERVICES); do \
		extra=""; \
		[ "$$svc" = "vibe-worker" ] && extra="chromium nss freetype harfbuzz ttf-freefont"; \
		[ "$$svc" = "discord-bot" ] && extra="git openssh-client"; \
		echo "==> building $(IMAGE_PREFIX)-$$svc"; \
		docker build -f Dockerfile --build-arg SERVICE=$$svc --build-arg EXTRA_PKGS="$$extra" \
			-t $(IMAGE_PREFIX)-$$svc:$${TAG:-dev} . || exit 1; \
	done

helm-lint: ## lint the chart (defaults + prod)
	helm lint ../deploy/helm/rmhstudios-go
	helm lint ../deploy/helm/rmhstudios-go -f ../deploy/helm/rmhstudios-go/values-prod.yaml

helm-template: ## render manifests
	helm template rmhstudios-go ../deploy/helm/rmhstudios-go

clean:
	docker volume rm -f $(MODCACHE) $(BUILDCACHE) 2>/dev/null || true
