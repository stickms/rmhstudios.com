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
