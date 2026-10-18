#!/usr/bin/env bash
# Does a rolling update drop requests? Sends a steady stream of requests from
# inside the cluster while restarting a Deployment, then counts the answers.
#
#   infra/k8s/rollout-test.sh api     # http://api:3001/api/health/ready
#   infra/k8s/rollout-test.sh web     # through the Envoy gateway, like a browser
set -euo pipefail

TARGET="${1:-api}"
NS=jobpilot
case "$TARGET" in
  api) URL="http://api.$NS:3001/api/health/ready" ;;
  web) URL="http://$(kubectl get svc -n envoy-gateway-system -l gateway.envoyproxy.io/owning-gateway-name=jobpilot -o jsonpath='{.items[0].metadata.name}').envoy-gateway-system/healthz" ;;
  *) echo "usage: $0 api|web" >&2; exit 2 ;;
esac

POD="rollout-test-$TARGET"
kubectl delete pod "$POD" -n "$NS" --ignore-not-found >/dev/null
# ~50 requests/s for 45 s; one line per request: HTTP status (000 = connection failed).
kubectl run "$POD" -n "$NS" --restart=Never --image=curlimages/curl:8.17.0 --command -- sh -c "
  end=\$((\$(date +%s) + 45))
  while [ \$(date +%s) -lt \$end ]; do
    curl -s -o /dev/null -w '%{http_code}\n' --max-time 2 '$URL'
    sleep 0.02
  done" >/dev/null
kubectl wait --for=condition=Ready "pod/$POD" -n "$NS" --timeout=60s >/dev/null

sleep 5
echo "Restarting deployment/$TARGET while requests flow..."
kubectl rollout restart "deployment/$TARGET" -n "$NS" >/dev/null
kubectl rollout status "deployment/$TARGET" -n "$NS" --timeout=180s

kubectl wait --for=jsonpath='{.status.phase}'=Succeeded "pod/$POD" -n "$NS" --timeout=120s >/dev/null
echo "Responses by status code:"
kubectl logs "$POD" -n "$NS" | sort | uniq -c
kubectl delete pod "$POD" -n "$NS" >/dev/null
