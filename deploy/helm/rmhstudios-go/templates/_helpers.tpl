{{/* Common name + label helpers (one release per namespace, mirrors PR #121). */}}

{{- define "rmhgo.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "rmhgo.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: rmhstudios-go
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* Per-service image reference: <registry>/<repoPrefix>-<svc>:<tag> */}}
{{- define "rmhgo.image" -}}
{{- $root := index . 0 -}}
{{- $svc := index . 1 -}}
{{- $img := $root.Values.image -}}
{{- if $img.registry -}}
{{- printf "%s/%s-%s:%s" $img.registry $img.repoPrefix $svc $img.tag -}}
{{- else -}}
{{- printf "%s-%s:%s" $img.repoPrefix $svc $img.tag -}}
{{- end -}}
{{- end -}}

{{/* The port a service's /health + /metrics listen on (client port or metricsPort). */}}
{{- define "rmhgo.probePort" -}}
{{- $cfg := index . 0 -}}
{{- $metrics := index . 1 -}}
{{- if $cfg.port -}}{{ $cfg.port }}{{- else -}}{{ $metrics }}{{- end -}}
{{- end -}}
