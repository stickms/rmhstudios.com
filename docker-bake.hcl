# Candidate publication and reusable-stage cache export have separate job boundaries.

variable "IMAGE_WEB" {
  default = "ghcr.io/stickms/rmhstudios-app"
}
variable "IMAGE_FULL" {
  default = "ghcr.io/stickms/rmhstudios-app-full"
}

variable "GIT_SHA" {
  default = "dev"
}

variable "COMPOSE_PROJECT_NAME" {
  default = "rmhstudios"
}
variable "DATABASE_URL" {
  default = "postgresql://ci-build:ci-build@localhost:5432/ci-build"
}
variable "BETTER_AUTH_SECRET" {
  default = "ci-build-not-a-runtime-secret-000000000000"
}
variable "BETTER_AUTH_URL" {
  default = "http://localhost:3000/"
}
variable "VITE_BETTER_AUTH_URL" {
  default = "http://localhost:3000/"
}
variable "VITE_SOCKET_URL" {
  default = "http://localhost:7001/"
}
variable "VITE_RMHBOX_SOCKET_URL" {
  default = "http://localhost:7676/"
}
variable "VITE_RMHTUBE_SOCKET_URL" {
  default = "http://localhost:7003/"
}
variable "VITE_DISCORD_ACTIVITY_CLIENT_ID" {
  default = "ci"
}
variable "VITE_CDN_BASE_URL" {
  default = ""
}
variable "STATIC_ASSET_VERSIONS" {
  default = "{}"
}

variable "VITE_ADSENSE_CLIENT_ID" {
  default = ""
}
variable "VITE_ADSENSE_SLOTS" {
  default = ""
}
variable "NITRO_PRESET" {
  default = "node-cluster"
}

variable "IMAGE_COMPRESSION" {
  default = "gzip"
}

variable "CHROMIUM_REFRESH" {
  default = formatdate("YYYY-MM", timestamp())
}

function "frontend_args" {
  params = []
  result = {
    COMPOSE_PROJECT_NAME            = COMPOSE_PROJECT_NAME
    DATABASE_URL                    = DATABASE_URL
    BETTER_AUTH_SECRET              = BETTER_AUTH_SECRET
    BETTER_AUTH_URL                 = BETTER_AUTH_URL
    VITE_BETTER_AUTH_URL            = VITE_BETTER_AUTH_URL
    VITE_SOCKET_URL                 = VITE_SOCKET_URL
    VITE_RMHBOX_SOCKET_URL          = VITE_RMHBOX_SOCKET_URL
    VITE_RMHTUBE_SOCKET_URL         = VITE_RMHTUBE_SOCKET_URL
    VITE_DISCORD_ACTIVITY_CLIENT_ID = VITE_DISCORD_ACTIVITY_CLIENT_ID
    VITE_CDN_BASE_URL               = VITE_CDN_BASE_URL
    STATIC_ASSET_VERSIONS           = STATIC_ASSET_VERSIONS
    VITE_ADSENSE_CLIENT_ID          = VITE_ADSENSE_CLIENT_ID
    VITE_ADSENSE_SLOTS              = VITE_ADSENSE_SLOTS
    NITRO_PRESET                    = NITRO_PRESET
    PUBLIC_BUILD_CONFIG_HASH = sha256(jsonencode({
      auth = BETTER_AUTH_URL,
      vite_auth = VITE_BETTER_AUTH_URL,
      socket = VITE_SOCKET_URL,
      box = VITE_RMHBOX_SOCKET_URL,
      tube = VITE_RMHTUBE_SOCKET_URL,
      discord = VITE_DISCORD_ACTIVITY_CLIENT_ID,
      cdn = VITE_CDN_BASE_URL,
      ads_client = VITE_ADSENSE_CLIENT_ID,
      ads_slots = VITE_ADSENSE_SLOTS,
      assets = STATIC_ASSET_VERSIONS,
      nitro = NITRO_PRESET
    }))
  }
}

group "default" {
  targets = ["web", "full"]
}

target "web" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "runner"
  platforms  = ["linux/arm64"]
  provenance = false
  tags = [
    "${IMAGE_WEB}:${GIT_SHA}",
    "${IMAGE_WEB}:latest",
  ]
  args = frontend_args()
  output = [
    "type=image,compression=${IMAGE_COMPRESSION},force-compression=${IMAGE_COMPRESSION != "gzip"}",
  ]
  cache-from = reusable_caches()
  cache-to = []
}

target "full" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "runner-full"
  platforms  = ["linux/arm64"]
  provenance = false
  tags = [
    "${IMAGE_FULL}:${GIT_SHA}",
    "${IMAGE_FULL}:latest",
  ]
  args = {
    CHROMIUM_REFRESH = CHROMIUM_REFRESH
  }
  output = [
    "type=image,compression=${IMAGE_COMPRESSION},force-compression=${IMAGE_COMPRESSION != "gzip"}",
  ]
  cache-from = ["type=registry,ref=${IMAGE_FULL}:latest", "type=registry,ref=${IMAGE_FULL}:cache-go"]
  cache-to   = ["type=inline"]
}

function "reusable_caches" {
  params = []
  result = [
    "type=registry,ref=${IMAGE_WEB}:buildcache",
    "type=registry,ref=${IMAGE_WEB}:cache-deps",
    "type=registry,ref=${IMAGE_WEB}:cache-prisma",
    "type=registry,ref=${IMAGE_WEB}:cache-prod",
    "type=registry,ref=${IMAGE_WEB}:cache-media",
    "type=registry,ref=${IMAGE_WEB}:cache-vibe",
  ]
}
target "_cache" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/arm64"]
  cache-from = reusable_caches()
  output = ["type=cacheonly"]
}
target "cache-deps" {
  inherits = ["_cache"]
  target = "deps"
  cache-to = ["type=registry,ref=${IMAGE_WEB}:cache-deps,mode=max,image-manifest=true,oci-mediatypes=true"]
}
target "cache-prisma" {
  inherits = ["_cache"]
  target = "prisma-generate"
  cache-to = ["type=registry,ref=${IMAGE_WEB}:cache-prisma,mode=max,image-manifest=true,oci-mediatypes=true"]
}
target "cache-prod" {
  inherits = ["_cache"]
  target = "prod-deps"
  cache-to = ["type=registry,ref=${IMAGE_WEB}:cache-prod,mode=max,image-manifest=true,oci-mediatypes=true"]
}
target "cache-media" {
  inherits = ["_cache"]
  target = "image-variants"
  cache-to = ["type=registry,ref=${IMAGE_WEB}:cache-media,mode=max,image-manifest=true,oci-mediatypes=true"]
}
target "cache-vibe" {
  inherits = ["_cache"]
  target = "vibe-builder"
  cache-to = ["type=registry,ref=${IMAGE_WEB}:cache-vibe,mode=max,image-manifest=true,oci-mediatypes=true"]
}
target "cache-go" {
  inherits = ["_cache"]
  target = "go-builder"
  cache-from = ["type=registry,ref=${IMAGE_FULL}:cache-go", "type=registry,ref=${IMAGE_FULL}:latest"]
  cache-to = ["type=registry,ref=${IMAGE_FULL}:cache-go,mode=max,image-manifest=true,oci-mediatypes=true"]
}
