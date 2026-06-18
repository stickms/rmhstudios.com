# Terraform + Helm Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate rmhstudios.com from a Docker-Compose deploy on a single VPS to a **single-node k3s + Helm** deployment (with a Helm pre-upgrade hook owning Prisma migrations) plus a **Terraform** layer for DNS/provisioning, without touching the running Compose stack until an explicit cutover.

**Architecture:** The proven multi-stage `Dockerfile` and `docker compose build` step are **kept verbatim** — only the *run* layer changes. `deploy-k8s.sh` builds the image with Compose (identical caching/build-args), imports it into k3s's containerd, syncs a Secret from `.env.production`, then runs `helm upgrade --install --atomic --wait`. A Helm `pre-upgrade`/`pre-install` hook Job runs the exact Prisma baseline-resolve + `migrate deploy` logic from today's `deploy.sh`. All 8 services render from one generic templated Deployment. Terraform manages DNS (Cloudflare, pluggable) and documents the k3s bootstrap. The existing `deploy.sh` + Compose stack stays in place as a rollback escape hatch.

**Tech Stack:** k3s (bundled Traefik ingress + local-path PVC provisioner), Helm 3, Terraform (Cloudflare provider), Docker BuildKit, Prisma, kubeconform (offline manifest validation).

## Global Constraints

- **Single image, all services:** every Deployment uses `image: rmhstudios:<git-sha>` with `imagePullPolicy: Never` (image is imported locally, no registry on day one). Copied from Compose's `x-common` pattern.
- **Build on the VPS:** no CI/registry. Build via `docker compose build web`, then `docker save | k3s ctr images import`. (Multi-node later requires a registry — every template marks this seam with a `# MULTI-NODE SEAM` comment.)
- **Secrets never enter git or Helm history:** the k8s `Secret` is created out-of-band from `.env.production` via `kubectl create secret ... --from-env-file` (server-side apply). The chart only references it by name via `envFrom`.
- **Compose stack stays runnable** until cutover. Do not delete `deploy.sh`, `docker-compose.yml`, or `Dockerfile`.
- **Service inventory (verbatim from `docker-compose.yml`):**
  | service | command | port (env var) | special |
  |---|---|---|---|
  | `web` | `node .output/server/index.mjs` (default CMD) | `PORT=7005` | HTTP, ingress root |
  | `socket` | `node dist-server/server/socket-server/index.cjs` | `SOCKET_PORT=7001` | websocket |
  | `rmhbox` | `node dist-server/server/rmhbox/index.cjs` | `RMHBOX_PORT=7676` | websocket |
  | `rmhtube` | `node dist-server/server/rmhtube/index.cjs` | `RMHTUBE_PORT=7003` | websocket |
  | `recap` | `node dist-server/server/recap/index.cjs` | `RECAP_PORT=7004` | HTTP, internal |
  | `discord-bot` | `node dist-server/server/discord-bot/index.cjs` | none | `stopGracePeriod=90s`, repo hostPath mount |
  | `doctrine-worker` | `node dist-server/server/doctrine-worker/index.cjs` | none | worker |
  | `vibe-worker` | `node dist-server/server/vibe-worker/index.cjs` | none | `stopGracePeriod=30s`, Chromium, shares db/ PVC |
- **Shared volume:** Compose mounts `${STORAGE_PATH:-./db}:/app/db` on every service. In k8s this is one `local-path` PVC (`rmhstudios-data`) mounted at `/app/db` on `web`, `vibe-worker`, and `discord-bot` (the writers/readers of `db/vibe-thumbs` and rmhbot worktrees). **RWO is fine single-node**; multi-node needs RWX (marked at the seam).
- **discord-bot repo mount:** Compose bind-mounts `${RMHBOT_REPO_PATH:-/home/rmhstudios/rmhstudios.com}` into the container at the same path for git-worktree ops. In k8s this is a `hostPath` volume (node-pinned — acceptable single-node).
- **Healthchecks → probes:** port the existing `curl -f http://localhost:<port>/` checks to `livenessProbe`/`readinessProbe` for `web/socket/rmhbox/rmhtube/recap`. Workers (`discord-bot/doctrine-worker/vibe-worker`) have no port — no probes, `restartPolicy: Always` via Deployment.
- **Migration logic (verbatim from `deploy.sh` steps 3):** wait-for-DB loop → `prisma migrate resolve --applied 0_baseline || true` → resolve any failed migration `--rolled-back` → `prisma migrate deploy`. Baseline migration is `prisma/migrations/0_baseline`.
- **Plan location:** `docs/plans/` (repo convention), not `docs/superpowers/plans/`.
- **All new infra lives under `deploy/`** (`deploy/helm/`, `deploy/terraform/`, `deploy/k8s/`). Do not scatter files at repo root.

---

## File Structure

```
deploy/
├── helm/
│   └── rmhstudios/
│       ├── Chart.yaml
│       ├── .helmignore
│       ├── values.yaml                 # defaults: image, services map, pvc, ingress off
│       ├── values-prod.yaml            # prod: real hosts, ingress on, replicas
│       └── templates/
│           ├── _helpers.tpl            # name/labels/selector helpers
│           ├── NOTES.txt               # post-install hints
│           ├── pvc.yaml                # rmhstudios-data PVC (local-path)
│           ├── deployment.yaml         # generic: range over .Values.services
│           ├── service.yaml            # ClusterIP for services with .port
│           ├── ingress.yaml            # Traefik: web + ws hosts
│           └── migrate-job.yaml        # pre-install/pre-upgrade hook Job
├── terraform/
│   ├── versions.tf                     # required_version + providers
│   ├── providers.tf                    # cloudflare provider config
│   ├── variables.tf
│   ├── dns.tf                          # A/CNAME records for app + ws subdomains
│   ├── outputs.tf
│   ├── terraform.tfvars.example
│   └── README.md
├── k8s/
│   └── secret.example.env              # documents required keys (names only)
├── deploy-k8s.sh                       # new run-layer deploy (build→import→secret→helm)
└── README.md                           # cutover runbook + day-2 ops

docs/plans/2026-06-17-terraform-helm-migration.md   # this file
webhook-server.cjs                                   # modified: DEPLOY_SCRIPT switchable
```

**Validation tooling (offline, no cluster needed):** `helm lint`, `helm template`, `kubeconform -strict` (validates rendered manifests against real k8s API schemas), `terraform validate`, `bash -n`/`shellcheck`. A live k3s smoke test is in the cutover runbook (Task 11) — it runs on the VPS, not in this environment.

---

## Task 1: Scaffold Helm chart skeleton + helpers

**Files:**
- Create: `deploy/helm/rmhstudios/Chart.yaml`
- Create: `deploy/helm/rmhstudios/.helmignore`
- Create: `deploy/helm/rmhstudios/templates/_helpers.tpl`

**Interfaces:**
- Produces: chart name `rmhstudios`; template helpers `rmhstudios.fullname`, `rmhstudios.labels`, `rmhstudios.selectorLabels` (consumed by all later templates); `rmhstudios.componentSelectorLabels` (adds `app.kubernetes.io/component`).

- [ ] **Step 1: Create `Chart.yaml`**

```yaml
apiVersion: v2
name: rmhstudios
description: rmhstudios.com — all 8 services from one image, single-node k3s
type: application
version: 0.1.0
appVersion: "0.1.0"
```

- [ ] **Step 2: Create `.helmignore`**

```
.git
*.tmp
*.bak
.DS_Store
*.tfstate
*.tfstate.*
.env*
```

- [ ] **Step 3: Create `templates/_helpers.tpl`**

```yaml
{{- define "rmhstudios.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "rmhstudios.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" (include "rmhstudios.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "rmhstudios.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "rmhstudios.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{- define "rmhstudios.selectorLabels" -}}
app.kubernetes.io/name: {{ include "rmhstudios.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "rmhstudios.componentSelectorLabels" -}}
{{ include "rmhstudios.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}
```

- [ ] **Step 4: Verify the chart parses**

Run: `cd deploy/helm/rmhstudios && helm lint .`
Expected: `1 chart(s) linted, 0 chart(s) failed` (an INFO about missing icon is fine). It is normal to see no template-render errors yet because there are no resource templates.

- [ ] **Step 5: Commit**

```bash
git add deploy/helm/rmhstudios/Chart.yaml deploy/helm/rmhstudios/.helmignore deploy/helm/rmhstudios/templates/_helpers.tpl
git commit -m "feat(deploy): scaffold rmhstudios helm chart + helpers"
```

---

## Task 2: Chart values (services map, image, pvc, ingress)

**Files:**
- Create: `deploy/helm/rmhstudios/values.yaml`
- Create: `deploy/helm/rmhstudios/values-prod.yaml`

**Interfaces:**
- Produces the `.Values` contract consumed by every template:
  - `.Values.image` = `{repository, tag, pullPolicy}`
  - `.Values.secretName` (string) — name of the externally-created Secret referenced via `envFrom`
  - `.Values.data` = `{enabled, size, storageClass, mountPath}` (the shared PVC)
  - `.Values.rmhbotRepoPath` (string) — hostPath for discord-bot repo mount
  - `.Values.services` = map; each value has `command([]string)`, optional `port(int)` + `portEnv(string)`, `replicas(int)`, optional `probePath(string)`, `extraEnv([]{name,value})`, `mountData(bool)`, `mountRepo(bool)`, `stopGracePeriod(int seconds)`, `resources(object)`
  - `.Values.ingress` = `{enabled, className, annotations, tls{enabled,secretName}, hosts:[{host, service, port}]}`

- [ ] **Step 1: Create `values.yaml` (defaults; ingress OFF so `helm template` is safe anywhere)**

```yaml
# Default values — safe for `helm template`/CI. Prod overrides in values-prod.yaml.
nameOverride: ""
fullnameOverride: "rmhstudios"

image:
  repository: rmhstudios
  tag: latest
  # Never: image is imported into k3s containerd locally; there is no registry.
  # MULTI-NODE SEAM: switch to IfNotPresent + a real repository when adding a registry.
  pullPolicy: Never

# Secret is created out-of-band from .env.production (see deploy-k8s.sh).
# Templates reference it via envFrom; its contents never enter git or Helm history.
secretName: rmhstudios-secrets

# Shared /app/db volume (Compose: ${STORAGE_PATH:-./db}:/app/db).
data:
  enabled: true
  size: 20Gi
  storageClass: local-path   # k3s built-in provisioner
  mountPath: /app/db
  # MULTI-NODE SEAM: local-path is node-local (RWO). Multi-node needs RWX (NFS/Longhorn).

# discord-bot bind-mounts the repo for git-worktree ops (Compose: RMHBOT_REPO_PATH).
rmhbotRepoPath: /home/rmhstudios/rmhstudios.com

# Common resource floor; override per service as needed.
defaultResources:
  requests:
    cpu: 50m
    memory: 128Mi

services:
  web:
    command: ["node", ".output/server/index.mjs"]
    port: 7005
    portEnv: PORT
    replicas: 1
    probePath: /
    mountData: true
    extraEnv:
      - name: HOSTNAME
        value: "0.0.0.0"
    resources:
      requests: { cpu: 250m, memory: 512Mi }

  socket:
    command: ["node", "dist-server/server/socket-server/index.cjs"]
    port: 7001
    portEnv: SOCKET_PORT
    replicas: 1
    probePath: /

  rmhbox:
    command: ["node", "dist-server/server/rmhbox/index.cjs"]
    port: 7676
    portEnv: RMHBOX_PORT
    replicas: 1
    probePath: /

  rmhtube:
    command: ["node", "dist-server/server/rmhtube/index.cjs"]
    port: 7003
    portEnv: RMHTUBE_PORT
    replicas: 1
    probePath: /

  recap:
    command: ["node", "dist-server/server/recap/index.cjs"]
    port: 7004
    portEnv: RECAP_PORT
    replicas: 1
    probePath: /

  discord-bot:
    command: ["node", "dist-server/server/discord-bot/index.cjs"]
    replicas: 1
    mountData: true
    mountRepo: true
    stopGracePeriod: 90

  doctrine-worker:
    command: ["node", "dist-server/server/doctrine-worker/index.cjs"]
    replicas: 1

  vibe-worker:
    command: ["node", "dist-server/server/vibe-worker/index.cjs"]
    replicas: 1
    mountData: true
    stopGracePeriod: 30
    resources:
      requests: { cpu: 250m, memory: 768Mi }   # Chromium captures

# Migration hook (pre-install/pre-upgrade). Mirrors deploy.sh step 3.
migrations:
  enabled: true
  baseline: "0_baseline"

ingress:
  enabled: false
  className: traefik
  annotations: {}
  tls:
    enabled: false
    secretName: rmhstudios-tls
  hosts: []
```

- [ ] **Step 2: Create `values-prod.yaml` (real hosts + ingress on)**

> NOTE: replace the four `REPLACE_ME` hostnames with the real domains from `.env.production`
> (`BETTER_AUTH_URL`, `VITE_SOCKET_URL`, `VITE_RMHBOX_SOCKET_URL`, `VITE_RMHTUBE_SOCKET_URL`).
> Traefik + ws: the `websocket` traffic is plain HTTP upgrade; no special annotation needed for Traefik.

```yaml
ingress:
  enabled: true
  className: traefik
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: websecure
  tls:
    enabled: true
    secretName: rmhstudios-tls
  hosts:
    - host: REPLACE_ME_app_host          # e.g. rmhstudios.com
      service: web
      port: 7005
    - host: REPLACE_ME_socket_host       # e.g. socket.rmhstudios.com
      service: socket
      port: 7001
    - host: REPLACE_ME_rmhbox_host       # e.g. box.rmhstudios.com
      service: rmhbox
      port: 7676
    - host: REPLACE_ME_rmhtube_host      # e.g. tube.rmhstudios.com
      service: rmhtube
      port: 7003

services:
  web:
    replicas: 1     # bump after multi-node + RWX; web is the scale target
  socket:
    replicas: 1
  rmhbox:
    replicas: 1
  rmhtube:
    replicas: 1
```

- [ ] **Step 3: Verify values parse**

Run: `cd deploy/helm/rmhstudios && helm lint . && helm lint . -f values-prod.yaml`
Expected: both report `0 chart(s) failed`.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/rmhstudios/values.yaml deploy/helm/rmhstudios/values-prod.yaml
git commit -m "feat(deploy): chart values — service map, pvc, ingress, image"
```

---

## Task 3: PVC template

**Files:**
- Create: `deploy/helm/rmhstudios/templates/pvc.yaml`

**Interfaces:**
- Consumes: `.Values.data`, `rmhstudios.fullname`, `rmhstudios.labels`.
- Produces: a PVC named `<fullname>-data` (e.g. `rmhstudios-data`) consumed by `deployment.yaml`.

- [ ] **Step 1: Create `templates/pvc.yaml`**

```yaml
{{- if .Values.data.enabled }}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "rmhstudios.fullname" . }}-data
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
spec:
  accessModes:
    - ReadWriteOnce   # MULTI-NODE SEAM: ReadWriteMany for multi-node
  storageClassName: {{ .Values.data.storageClass | quote }}
  resources:
    requests:
      storage: {{ .Values.data.size | quote }}
{{- end }}
```

- [ ] **Step 2: Verify it renders**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -A3 'kind: PersistentVolumeClaim'`
Expected: shows `name: rmhstudios-data` with `storage: 20Gi`.

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/rmhstudios/templates/pvc.yaml
git commit -m "feat(deploy): shared data PVC template"
```

---

## Task 4: Generic Deployment template (all 8 services)

**Files:**
- Create: `deploy/helm/rmhstudios/templates/deployment.yaml`

**Interfaces:**
- Consumes: `.Values.services`, `.Values.image`, `.Values.secretName`, `.Values.data`, `.Values.rmhbotRepoPath`, `.Values.defaultResources`, helpers.
- Produces: one Deployment per service key, named `<fullname>-<service>` with `component=<service>`. Pods get `envFrom` the shared Secret, `env` PORT (if `portEnv`), probes (if `probePath`+`port`), volume mounts (if `mountData`/`mountRepo`), `terminationGracePeriodSeconds` (if `stopGracePeriod`).

- [ ] **Step 1: Create `templates/deployment.yaml`**

```yaml
{{- $root := . -}}
{{- range $name, $svc := .Values.services }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "rmhstudios.fullname" $root }}-{{ $name }}
  labels:
    {{- include "rmhstudios.labels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  replicas: {{ $svc.replicas | default 1 }}
  selector:
    matchLabels:
      {{- include "rmhstudios.componentSelectorLabels" (dict "Chart" $root.Chart "Release" $root.Release "Values" $root.Values "component" $name) | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "rmhstudios.componentSelectorLabels" (dict "Chart" $root.Chart "Release" $root.Release "Values" $root.Values "component" $name) | nindent 8 }}
    spec:
      {{- if $svc.stopGracePeriod }}
      terminationGracePeriodSeconds: {{ $svc.stopGracePeriod }}
      {{- end }}
      containers:
        - name: {{ $name }}
          image: "{{ $root.Values.image.repository }}:{{ $root.Values.image.tag }}"
          imagePullPolicy: {{ $root.Values.image.pullPolicy }}
          command: {{ toJson $svc.command }}
          envFrom:
            - secretRef:
                name: {{ $root.Values.secretName }}
          env:
            {{- if $svc.portEnv }}
            - name: {{ $svc.portEnv }}
              value: {{ $svc.port | quote }}
            {{- end }}
            {{- with $svc.extraEnv }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
          {{- if $svc.port }}
          ports:
            - containerPort: {{ $svc.port }}
              name: http
          {{- end }}
          {{- if and $svc.probePath $svc.port }}
          readinessProbe:
            httpGet:
              path: {{ $svc.probePath }}
              port: {{ $svc.port }}
            initialDelaySeconds: 15
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: {{ $svc.probePath }}
              port: {{ $svc.port }}
            initialDelaySeconds: 30
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          {{- end }}
          resources:
            {{- toYaml ($svc.resources | default $root.Values.defaultResources) | nindent 12 }}
          {{- if or $svc.mountData $svc.mountRepo }}
          volumeMounts:
            {{- if $svc.mountData }}
            - name: data
              mountPath: {{ $root.Values.data.mountPath }}
            {{- end }}
            {{- if $svc.mountRepo }}
            - name: repo
              mountPath: {{ $root.Values.rmhbotRepoPath }}
            {{- end }}
          {{- end }}
      {{- if or $svc.mountData $svc.mountRepo }}
      volumes:
        {{- if $svc.mountData }}
        - name: data
          persistentVolumeClaim:
            claimName: {{ include "rmhstudios.fullname" $root }}-data
        {{- end }}
        {{- if $svc.mountRepo }}
        # MULTI-NODE SEAM: hostPath pins discord-bot to this node.
        - name: repo
          hostPath:
            path: {{ $root.Values.rmhbotRepoPath }}
            type: Directory
        {{- end }}
      {{- end }}
{{- end }}
```

- [ ] **Step 2: Verify all 8 Deployments render**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -c 'kind: Deployment'`
Expected: `8`

- [ ] **Step 3: Verify per-service specifics**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -E 'terminationGracePeriodSeconds|name: (PORT|SOCKET_PORT|RMHBOX_PORT|RMHTUBE_PORT|RECAP_PORT)'`
Expected: sees `PORT`, `SOCKET_PORT`, `RMHBOX_PORT`, `RMHTUBE_PORT`, `RECAP_PORT`, and two `terminationGracePeriodSeconds` (90 for discord-bot, 30 for vibe-worker).

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/rmhstudios/templates/deployment.yaml
git commit -m "feat(deploy): generic Deployment template for all 8 services"
```

---

## Task 5: Service template (ClusterIP for ported services)

**Files:**
- Create: `deploy/helm/rmhstudios/templates/service.yaml`

**Interfaces:**
- Consumes: `.Values.services` (only entries with `.port`), helpers.
- Produces: one ClusterIP Service `<fullname>-<service>` per ported service, targeting `containerPort` by number. Consumed by `ingress.yaml` (by name `<fullname>-<service>` + port).

- [ ] **Step 1: Create `templates/service.yaml`**

```yaml
{{- $root := . -}}
{{- range $name, $svc := .Values.services }}
{{- if $svc.port }}
---
apiVersion: v1
kind: Service
metadata:
  name: {{ include "rmhstudios.fullname" $root }}-{{ $name }}
  labels:
    {{- include "rmhstudios.labels" $root | nindent 4 }}
    app.kubernetes.io/component: {{ $name }}
spec:
  type: ClusterIP
  selector:
    {{- include "rmhstudios.componentSelectorLabels" (dict "Chart" $root.Chart "Release" $root.Release "Values" $root.Values "component" $name) | nindent 4 }}
  ports:
    - name: http
      port: {{ $svc.port }}
      targetPort: {{ $svc.port }}
      protocol: TCP
{{- end }}
{{- end }}
```

- [ ] **Step 2: Verify 5 Services render (web, socket, rmhbox, rmhtube, recap)**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -c 'kind: Service'`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/rmhstudios/templates/service.yaml
git commit -m "feat(deploy): ClusterIP services for ported components"
```

---

## Task 6: Ingress template (Traefik)

**Files:**
- Create: `deploy/helm/rmhstudios/templates/ingress.yaml`

**Interfaces:**
- Consumes: `.Values.ingress` (`enabled`, `className`, `annotations`, `tls`, `hosts:[{host,service,port}]`), helpers.
- Produces: one Ingress `<fullname>` routing each host to `<fullname>-<service>:<port>`. Only rendered when `ingress.enabled`.

- [ ] **Step 1: Create `templates/ingress.yaml`**

```yaml
{{- if .Values.ingress.enabled }}
{{- $root := . -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "rmhstudios.fullname" . }}
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  {{- if .Values.ingress.tls.enabled }}
  tls:
    - hosts:
        {{- range .Values.ingress.hosts }}
        - {{ .host | quote }}
        {{- end }}
      secretName: {{ .Values.ingress.tls.secretName }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "rmhstudios.fullname" $root }}-{{ .service }}
                port:
                  number: {{ .port }}
    {{- end }}
{{- end }}
```

- [ ] **Step 2: Verify ingress is OFF by default, ON with prod values**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -c 'kind: Ingress'`
Expected: `0`

Run: `cd deploy/helm/rmhstudios && helm template r . -f values-prod.yaml | grep -c 'kind: Ingress'`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add deploy/helm/rmhstudios/templates/ingress.yaml
git commit -m "feat(deploy): Traefik ingress template"
```

---

## Task 7: Prisma migration hook Job + NOTES

**Files:**
- Create: `deploy/helm/rmhstudios/templates/migrate-job.yaml`
- Create: `deploy/helm/rmhstudios/templates/NOTES.txt`

**Interfaces:**
- Consumes: `.Values.migrations` (`enabled`, `baseline`), `.Values.image`, `.Values.secretName`, helpers.
- Produces: a Helm hook Job `<fullname>-migrate` (`pre-install,pre-upgrade`, weight `-5`, `before-hook-creation` delete policy) that runs the exact migration sequence from `deploy.sh` step 3. Because `deploy-k8s.sh` calls `helm upgrade --wait`, Helm blocks until this Job succeeds before rolling Deployments.

- [ ] **Step 1: Create `templates/migrate-job.yaml`**

```yaml
{{- if .Values.migrations.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "rmhstudios.fullname" . }}-migrate
  labels:
    {{- include "rmhstudios.labels" . | nindent 4 }}
    app.kubernetes.io/component: migrate
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  backoffLimit: 0
  activeDeadlineSeconds: 600
  template:
    metadata:
      labels:
        {{- include "rmhstudios.labels" . | nindent 8 }}
        app.kubernetes.io/component: migrate
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          envFrom:
            - secretRef:
                name: {{ .Values.secretName }}
          command: ["sh", "-c"]
          args:
            - |
              set -e
              echo "[migrate] waiting for database..."
              for i in $(seq 1 10); do
                if npx prisma migrate status 2>&1 | grep -qE 'migration|Database schema|up to date'; then
                  echo "[migrate] database reachable"; break
                fi
                if [ "$i" -eq 10 ]; then echo "[migrate] DB not reachable"; exit 1; fi
                echo "[migrate] not reachable yet ($i/10), retrying in 5s"; sleep 5
              done
              echo "[migrate] resolving baseline {{ .Values.migrations.baseline }} (idempotent)"
              npx prisma migrate resolve --applied {{ .Values.migrations.baseline }} 2>/dev/null || true
              FAILED=$(npx prisma migrate status 2>&1 | grep -oE 'resolve --rolled-back "[^"]+"' | grep -oE '"[^"]+"' | tr -d '"' || true)
              if [ -n "$FAILED" ]; then
                echo "[migrate] rolling back failed migration $FAILED"
                npx prisma migrate resolve --rolled-back "$FAILED" || true
              fi
              echo "[migrate] applying migrations"
              npx prisma migrate deploy
              echo "[migrate] done"
{{- end }}
```

- [ ] **Step 2: Create `templates/NOTES.txt`**

```
rmhstudios deployed (release {{ .Release.Name }}).

Image:   {{ .Values.image.repository }}:{{ .Values.image.tag }}
Secret:  {{ .Values.secretName }} (created out-of-band from .env.production)

Check rollout:
  kubectl get pods -l app.kubernetes.io/instance={{ .Release.Name }}
  kubectl logs job/{{ include "rmhstudios.fullname" . }}-migrate

{{- if .Values.ingress.enabled }}
Ingress hosts:
{{- range .Values.ingress.hosts }}
  https://{{ .host }}  ->  {{ .service }}:{{ .port }}
{{- end }}
{{- else }}
Ingress is disabled. Enable with -f values-prod.yaml (set real hosts first).
{{- end }}

Rollback:  helm rollback {{ .Release.Name }}
```

- [ ] **Step 3: Verify the hook Job renders with correct annotations**

Run: `cd deploy/helm/rmhstudios && helm template r . | grep -E 'helm.sh/hook|name: rmhstudios-migrate|prisma migrate deploy'`
Expected: shows `helm.sh/hook": pre-install,pre-upgrade`, the job name, and `prisma migrate deploy`.

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/rmhstudios/templates/migrate-job.yaml deploy/helm/rmhstudios/templates/NOTES.txt
git commit -m "feat(deploy): prisma migration pre-upgrade hook + NOTES"
```

---

## Task 8: Validate full chart against k8s schemas (kubeconform)

**Files:**
- Create: `deploy/helm/rmhstudios/.validate.sh` (helper used here and in CI)

**Interfaces:**
- Consumes: the whole chart + `values-prod.yaml`.
- Produces: a repeatable offline validation gate. This is the strongest "works on first try" guarantee available without a live cluster — kubeconform checks every rendered manifest against the real Kubernetes OpenAPI schemas.

- [ ] **Step 1: Create `deploy/helm/rmhstudios/.validate.sh`**

```bash
#!/usr/bin/env bash
# Offline validation: lint + render + schema-check every manifest.
set -euo pipefail
cd "$(dirname "$0")"

echo "== helm lint (defaults) =="
helm lint .
echo "== helm lint (prod) =="
helm lint . -f values-prod.yaml

# Render with a placeholder image tag and a real-looking prod host so
# ingress renders. kubeconform validates kind/apiVersion/fields vs k8s schemas.
echo "== kubeconform (defaults) =="
helm template r . --set image.tag=test \
  | kubeconform -strict -summary -ignore-missing-schemas

echo "== kubeconform (prod) =="
helm template r . -f values-prod.yaml --set image.tag=test \
  --set ingress.hosts[0].host=app.example.com \
  --set ingress.hosts[1].host=socket.example.com \
  --set ingress.hosts[2].host=box.example.com \
  --set ingress.hosts[3].host=tube.example.com \
  | kubeconform -strict -summary -ignore-missing-schemas

echo "ALL CHART VALIDATION PASSED"
```

- [ ] **Step 2: Make it executable and run it**

Run: `chmod +x deploy/helm/rmhstudios/.validate.sh && deploy/helm/rmhstudios/.validate.sh`
Expected: ends with `ALL CHART VALIDATION PASSED`; kubeconform summaries report `0 invalid`. (`-ignore-missing-schemas` tolerates the Traefik CRD-less ingressClass; core kinds — Deployment/Service/Ingress/Job/PVC — are fully validated.)

- [ ] **Step 3: Fix any reported schema error**

If kubeconform reports an invalid manifest, the message names the file, kind, and field. Correct the offending template, re-run Step 2 until it passes. (No code shown here because the fix depends on the specific error; do not skip — the gate must be green.)

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/rmhstudios/.validate.sh
git commit -m "test(deploy): offline chart validation via kubeconform"
```

---

## Task 9: Terraform — DNS + provider scaffold

**Files:**
- Create: `deploy/terraform/versions.tf`
- Create: `deploy/terraform/providers.tf`
- Create: `deploy/terraform/variables.tf`
- Create: `deploy/terraform/dns.tf`
- Create: `deploy/terraform/outputs.tf`
- Create: `deploy/terraform/terraform.tfvars.example`
- Create: `deploy/terraform/README.md`

**Interfaces:**
- Produces a Terraform root module managing DNS records (Cloudflare) for the four app hosts pointing at the VPS IP. Provider is pluggable; Cloudflare is the concrete default. Validated offline with `terraform init -backend=false` + `terraform validate` (no credentials needed for validation).

> Provider note: Cloudflare is the default because it's the most common fit for this kind of setup. If DNS is elsewhere (Route53, DigitalOcean, etc.), swap the provider block + record resource — the variable surface (`vps_ip`, host names, `zone`) stays the same. This is the one task where the implementer should confirm the provider with the user before `terraform apply` (validate works regardless).

- [ ] **Step 1: Create `versions.tf`**

```hcl
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
  }
}
```

- [ ] **Step 2: Create `providers.tf`**

```hcl
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
```

- [ ] **Step 3: Create `variables.tf`**

```hcl
variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit on the zone"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain"
  type        = string
}

variable "vps_ip" {
  description = "Public IPv4 of the VPS running k3s"
  type        = string
}

variable "app_host" {
  description = "Root app hostname (e.g. rmhstudios.com)"
  type        = string
}

variable "socket_host" {
  description = "Socket.IO hostname (e.g. socket.rmhstudios.com)"
  type        = string
}

variable "rmhbox_host" {
  description = "RMHBox websocket hostname"
  type        = string
}

variable "rmhtube_host" {
  description = "RMHTube websocket hostname"
  type        = string
}

variable "proxied" {
  description = "Whether Cloudflare proxies (orange-cloud) the records. Use false for raw websockets unless on a proxy-compatible plan."
  type        = bool
  default     = false
}
```

- [ ] **Step 4: Create `dns.tf`**

```hcl
locals {
  records = {
    app    = var.app_host
    socket = var.socket_host
    rmhbox = var.rmhbox_host
    rmhtube = var.rmhtube_host
  }
}

resource "cloudflare_record" "app" {
  for_each = local.records

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = "A"
  content = var.vps_ip
  proxied = var.proxied
  ttl     = var.proxied ? 1 : 300
}
```

- [ ] **Step 5: Create `outputs.tf`**

```hcl
output "dns_records" {
  description = "Managed DNS hostnames -> VPS IP"
  value       = { for k, r in cloudflare_record.app : k => r.name }
}
```

- [ ] **Step 6: Create `terraform.tfvars.example`**

```hcl
cloudflare_api_token = "REPLACE_ME"
cloudflare_zone_id   = "REPLACE_ME"
vps_ip               = "203.0.113.10"
app_host             = "rmhstudios.com"
socket_host          = "socket.rmhstudios.com"
rmhbox_host          = "box.rmhstudios.com"
rmhtube_host         = "tube.rmhstudios.com"
proxied              = false
```

- [ ] **Step 7: Create `README.md`**

```markdown
# Terraform — rmhstudios DNS / infra

Manages DNS records pointing the app + websocket hostnames at the k3s VPS.

## Usage
1. `cp terraform.tfvars.example terraform.tfvars` and fill in real values.
2. `terraform init`
3. `terraform plan`
4. `terraform apply`

## Provider
Default is Cloudflare. To use another DNS provider, replace `providers.tf`,
`versions.tf` provider block, and the `cloudflare_record` resource in `dns.tf`.
The variable surface (`vps_ip`, `*_host`, zone) is provider-agnostic.

## State
Default is local state (`terraform.tfstate`, gitignored). For team use, move to
a remote backend (S3/GCS/Terraform Cloud) by adding a `backend` block to
`versions.tf` and re-running `terraform init`.

## Scope (intentionally narrow)
DNS only on day one. VPS-provider resources (droplet, firewall) can be added
once the hosting provider is confirmed — they need that provider's API.
```

- [ ] **Step 8: Add Terraform artifacts to `.gitignore`**

Append to repo-root `.gitignore` (create lines if absent):

```
# Terraform
deploy/terraform/.terraform/
deploy/terraform/*.tfstate
deploy/terraform/*.tfstate.*
deploy/terraform/terraform.tfvars
deploy/terraform/.terraform.lock.hcl
```

- [ ] **Step 9: Validate Terraform (no credentials needed)**

Run: `cd deploy/terraform && terraform fmt -check && terraform init -backend=false && terraform validate`
Expected: `terraform fmt -check` prints nothing (formatted); init downloads the Cloudflare provider; `terraform validate` prints `Success! The configuration is valid.`

- [ ] **Step 10: Commit**

```bash
git add deploy/terraform .gitignore
git commit -m "feat(deploy): terraform DNS module (cloudflare, pluggable)"
```

---

## Task 10: New run-layer deploy script (`deploy-k8s.sh`)

**Files:**
- Create: `deploy/deploy-k8s.sh`
- Create: `deploy/k8s/secret.example.env`

**Interfaces:**
- Consumes: `.env.production` (build args + Secret source), the Helm chart, k3s, docker.
- Produces: the production deploy entrypoint that replaces `docker compose up` with Helm. Reuses the **proven** Compose build (identical caching). Keeps lock/notification semantics minimal but safe. `webhook-server.cjs` (Task 11) points here.

> Design choice (robustness): build with `docker compose build web` (unchanged caching + build-args from `.env.production`), then tag → `docker save | k3s ctr images import` → sync Secret → `helm upgrade --install --atomic --wait`. `--atomic` auto-rolls-back the release if the migration hook or any probe fails, so a bad deploy never leaves prod half-updated. The old `deploy.sh` + Compose stack remains the manual fallback.

- [ ] **Step 1: Create `deploy/k8s/secret.example.env` (key names only — no values)**

```
# Source of truth is .env.production on the VPS. These are the keys the app needs.
# The Secret is created by deploy-k8s.sh via:
#   kubectl create secret generic rmhstudios-secrets --from-env-file=.env.production
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
VITE_BETTER_AUTH_URL=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_ACTIVITY_CLIENT_ID=
DISCORD_ACTIVITY_CLIENT_SECRET=
VITE_DISCORD_ACTIVITY_CLIENT_ID=
DISCORD_ACTIVITY_BOT_TOKEN=
DISCORD_BOT_TOKEN=
DISCORD_BOT_CLIENT_ID=
DISCORD_DEV_GUILD_ID=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
ALLOW_EMAIL_ONLY_AUTH=
VITE_ALLOW_EMAIL_ONLY_AUTH=
TOKEN_ENCRYPTION_KEY=
SOCKET_CORS_ORIGIN=
VITE_SOCKET_URL=
VITE_RMHBOX_SOCKET_URL=
VITE_RMHTUBE_SOCKET_URL=
WEBHOOK_SECRET=
WEATHER_WEBHOOK_SECRET=
ANTHROPIC_API_KEY=
NEWS_APPROVAL_SECRET=
NEWS_DISCORD_WEBHOOK_URL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

- [ ] **Step 2: Create `deploy/deploy-k8s.sh`**

```bash
#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# rmhstudios.com — k3s + Helm deploy (run layer).
# Build stays on Docker Compose (identical caching/build-args). Only the run
# layer changes: image -> k3s containerd, `compose up` -> `helm upgrade`.
#
# Usage: ./deploy/deploy-k8s.sh production
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENVIRONMENT="${1:-production}"
[ "$ENVIRONMENT" = "production" ] || { echo "FATAL: only 'production' is supported"; exit 1; }

REPO_DIR="/home/rmhstudios/rmhstudios.com"
ENV_FILE=".env.production"
PROJECT_NAME="rmhstudios-prod"
RELEASE="rmhstudios"
NAMESPACE="rmhstudios"
CHART_DIR="deploy/helm/rmhstudios"
SECRET_NAME="rmhstudios-secrets"
IMAGE_REPO="rmhstudios"

LOCKFILE="/tmp/autodeploy-k8s.lock"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [k8s] $1"; }

cd "$REPO_DIR" || { echo "FATAL: cannot cd to $REPO_DIR"; exit 1; }

# Single-flight lock.
exec 200>>"$LOCKFILE"
flock -n 200 || { log "Another deploy is running. Exiting."; exit 0; }

[ -f "$ENV_FILE" ] || { log "FATAL: $ENV_FILE missing"; exit 1; }

# ── Step 1: Pull latest ──────────────────────────────────────────────────────
log "Fetching latest code..."
git fetch origin main
git checkout main 2>/dev/null || git checkout -b main origin/main
git reset --hard origin/main
GIT_SHA="$(git rev-parse --short HEAD)"
log "Deploying $GIT_SHA"

# ── Step 2: Build image via Compose (unchanged caching/build-args) ───────────
log "Building image (docker compose build)..."
docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" build web

# Resolve the image Compose just built (COMPOSE_PROJECT_NAME-app:latest) and
# retag to rmhstudios:<sha> for Helm.
BUILT_IMAGE="$(docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" config --images web | head -1)"
[ -n "$BUILT_IMAGE" ] || { log "FATAL: could not resolve built image name"; exit 1; }
docker tag "$BUILT_IMAGE" "${IMAGE_REPO}:${GIT_SHA}"
log "Tagged ${IMAGE_REPO}:${GIT_SHA} (from $BUILT_IMAGE)"

# ── Step 3: Import image into k3s containerd ─────────────────────────────────
# k3s uses its own containerd, not docker — the image must be imported.
# Requires sudo for `k3s ctr` (document in runbook).
log "Importing image into k3s..."
docker save "${IMAGE_REPO}:${GIT_SHA}" | sudo k3s ctr images import -

# ── Step 4: Sync Secret from .env.production (server-side, never in git) ──────
log "Syncing Secret ${SECRET_NAME}..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic "$SECRET_NAME" \
  --namespace "$NAMESPACE" \
  --from-env-file="$ENV_FILE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Step 5: helm upgrade (atomic: auto-rollback on hook/probe failure) ───────
log "helm upgrade --install (atomic)..."
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  -f "${CHART_DIR}/values-prod.yaml" \
  --set image.tag="$GIT_SHA" \
  --atomic --wait --timeout 10m

# ── Step 6: Prune old local images (keep recent for manual rollback) ─────────
log "Pruning dangling docker images..."
docker image prune -f >/dev/null 2>&1 || true

log "=== Deploy complete ($RELEASE @ $GIT_SHA) ==="
```

- [ ] **Step 3: Syntax-check the script**

Run: `bash -n deploy/deploy-k8s.sh && echo "SYNTAX OK"`
Expected: `SYNTAX OK`. If `shellcheck` is installed, also run `shellcheck deploy/deploy-k8s.sh` and address warnings (the `exec 200>>` flock idiom and `sudo k3s ctr` are intentional).

- [ ] **Step 4: Make executable**

Run: `chmod +x deploy/deploy-k8s.sh`

- [ ] **Step 5: Commit**

```bash
git add deploy/deploy-k8s.sh deploy/k8s/secret.example.env
git commit -m "feat(deploy): k3s+helm run-layer deploy script"
```

---

## Task 11: Webhook switch + cutover runbook

**Files:**
- Modify: `webhook-server.cjs` (make `DEPLOY_SCRIPT` env-overridable)
- Create: `deploy/README.md`

**Interfaces:**
- Consumes: nothing new at runtime; the webhook keeps its HMAC + branch-map behavior.
- Produces: a one-env-var switch (`DEPLOY_SCRIPT`) so the same webhook server can drive either the old Compose deploy or the new k3s deploy, enabling a reversible cutover. Plus the human runbook for installing k3s and flipping over.

- [ ] **Step 1: Make `DEPLOY_SCRIPT` overridable in `webhook-server.cjs`**

Find:

```js
const DEPLOY_SCRIPT = '/home/rmhstudios/rmhstudios.com/deploy.sh';
```

Replace with:

```js
// Default to the Compose deploy; set DEPLOY_SCRIPT to deploy/deploy-k8s.sh to cut over to k3s.
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || '/home/rmhstudios/rmhstudios.com/deploy.sh';
```

- [ ] **Step 2: Verify the webhook server still parses**

Run: `node -c webhook-server.cjs && echo "WEBHOOK OK"`
Expected: `WEBHOOK OK`

- [ ] **Step 3: Create `deploy/README.md` (cutover runbook + day-2 ops)**

```markdown
# rmhstudios deploy — k3s + Helm

This directory holds the k3s/Helm/Terraform deploy. The legacy Docker-Compose
deploy (`/deploy.sh` + `/docker-compose.yml`) stays in place as a fallback.

## One-time VPS setup

1. **Install k3s** (bundles Traefik ingress + local-path PVC provisioner):
   ```bash
   curl -sfL https://get.k3s.io | sh -
   sudo k3s kubectl get nodes        # node should be Ready
   ```
2. **Give the deploy user kubectl + ctr access:**
   ```bash
   sudo mkdir -p ~/.kube
   sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
   sudo chown "$(id -u):$(id -g)" ~/.kube/config
   # deploy-k8s.sh uses `sudo k3s ctr` to import images — ensure the deploy
   # user has passwordless sudo for `k3s ctr`, or run the deploy as root.
   ```
3. **TLS (if using cert-manager):** install cert-manager and a ClusterIssuer,
   then set `ingress.tls.secretName`. Alternatively terminate TLS at Cloudflare.

## First deploy

```bash
cd /home/rmhstudios/rmhstudios.com
# Edit deploy/helm/rmhstudios/values-prod.yaml — set the four real hostnames.
./deploy/deploy-k8s.sh production
```

This builds the image (Compose), imports it into k3s, syncs the Secret from
`.env.production`, runs the Prisma migration hook, then rolls the 8 Deployments.
`--atomic` auto-rolls-back if anything fails.

## Smoke test (on the VPS, after first deploy)

```bash
kubectl -n rmhstudios get pods                       # all Running/Ready
kubectl -n rmhstudios logs job/rmhstudios-migrate    # "[migrate] done"
kubectl -n rmhstudios get ingress                    # hosts listed
curl -fsS -H "Host: <app_host>" http://127.0.0.1/    # via Traefik
```

## Cutover (reversible)

1. Run `./deploy/deploy-k8s.sh production` and pass the smoke test while the
   old Compose stack is still up (k3s Traefik binds :80/:443 — stop the old
   reverse proxy / Compose web only when ready to flip).
2. Point the webhook at the new script:
   ```bash
   # in the webhook server's systemd unit / env:
   DEPLOY_SCRIPT=/home/rmhstudios/rmhstudios.com/deploy/deploy-k8s.sh
   sudo systemctl restart rmhstudios-webhook   # or however it is supervised
   ```
3. **Rollback to Compose:** unset `DEPLOY_SCRIPT` (back to `deploy.sh`), restart
   the webhook, and `docker compose -p rmhstudios-prod --env-file .env.production up -d`.

## Day-2 ops

- Roll back one release:  `helm -n rmhstudios rollback rmhstudios`
- Scale web (after multi-node + RWX):  `kubectl -n rmhstudios scale deploy/rmhstudios-web --replicas=3`
- Tail a service:  `kubectl -n rmhstudios logs -f deploy/rmhstudios-socket`
- DNS changes:  see `deploy/terraform/README.md`

## Multi-node later (the seams)

Search the chart for `MULTI-NODE SEAM`. Three changes are needed:
1. A registry (in-cluster or GHCR) + `image.pullPolicy: IfNotPresent`.
2. PVC `ReadWriteMany` (NFS/Longhorn) instead of local-path RWO.
3. discord-bot repo `hostPath` → a shared volume or node affinity pin.
```

- [ ] **Step 4: Commit**

```bash
git add webhook-server.cjs deploy/README.md
git commit -m "feat(deploy): webhook script switch + k3s cutover runbook"
```

---

## Task 12: Final end-to-end offline validation

**Files:**
- None (validation only).

**Interfaces:**
- Consumes: everything built. Produces the green gate that justifies "works on first try" at the manifest/config-validity level.

- [ ] **Step 1: Chart validation gate**

Run: `deploy/helm/rmhstudios/.validate.sh`
Expected: ends with `ALL CHART VALIDATION PASSED`, kubeconform `0 invalid`.

- [ ] **Step 2: Confirm resource counts in prod render**

Run: `helm template r deploy/helm/rmhstudios -f deploy/helm/rmhstudios/values-prod.yaml --set image.tag=test --set ingress.hosts[0].host=a.example.com --set ingress.hosts[1].host=b.example.com --set ingress.hosts[2].host=c.example.com --set ingress.hosts[3].host=d.example.com | grep -E '^kind:' | sort | uniq -c`
Expected:
```
   8 kind: Deployment
   1 kind: Ingress
   1 kind: Job
   1 kind: PersistentVolumeClaim
   5 kind: Service
```

- [ ] **Step 3: Terraform validation gate**

Run: `cd deploy/terraform && terraform fmt -check && terraform init -backend=false && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Script syntax gates**

Run: `bash -n deploy/deploy-k8s.sh && node -c webhook-server.cjs && echo "SCRIPTS OK"`
Expected: `SCRIPTS OK`

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test(deploy): final offline validation gate green" || echo "nothing to commit"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Compose→k3s run layer ✅ (Tasks 1–7, 10) · build-on-VPS, no registry ✅ (Global Constraints, Task 10 Step 2–3) · Helm hook owns migrations ✅ (Task 7) · all 8 services ✅ (Task 2/4, verified Task 4 Step 2) · shared db/ volume ✅ (Task 3, mounts Task 4) · discord-bot repo mount ✅ (Task 4 hostPath) · stop grace periods ✅ (Task 4) · healthchecks→probes ✅ (Task 4) · Terraform for DNS/provisioning ✅ (Task 9) · reversible cutover, Compose fallback ✅ (Task 11) · "works first try / robust" → kubeconform + terraform validate + --atomic auto-rollback ✅ (Tasks 8, 12; Task 10).
- Multi-node scaling goal: explicitly deferred with documented seams (Global Constraints, Task 11 runbook) — honest given the build-on-VPS choice conflicts with multi-node until a registry exists.

**Placeholder scan:** Hostnames in `values-prod.yaml`/terraform are intentional `REPLACE_ME` config the operator must fill (not plan placeholders); every code/template step contains complete content. Task 8 Step 3 / Task 12 Step 5 are conditional fix-ups, not deferred work.

**Type/name consistency:** chart name `rmhstudios`; fullname `rmhstudios`; PVC `rmhstudios-data` (Task 3 produces, Task 4 consumes); Service name `rmhstudios-<svc>` (Task 5 produces, Task 6 ingress consumes); Secret `rmhstudios-secrets` (Task 2 `secretName`, Task 4 `envFrom`, Task 10 creates); helper `rmhstudios.componentSelectorLabels` used identically in Tasks 4/5; image `rmhstudios:<sha>` consistent across Task 10 build/import and chart `image.repository`/`tag`. Migration baseline `0_baseline` matches `prisma/migrations/0_baseline` and `deploy.sh`.
