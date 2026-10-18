#!/usr/bin/env bash
# Builds the images, loads them into the local kind cluster and deploys.
# Safe to re-run: it only creates what is missing and rolls what changed.
#
#   pnpm k8s:up          (needs: Docker, kind, kubectl; `pnpm infra:up` running)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLUSTER=jobpilot
OVERLAY="$ROOT/infra/k8s/overlays/local"
ENVOY_GATEWAY_VERSION=v1.9.2
APPS=(migrate api worker web)
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# 1. Cluster and gateway controller --------------------------------------------
if ! kind get clusters | grep -qx "$CLUSTER"; then
  step "Creating kind cluster '$CLUSTER'"
  kind create cluster --config infra/k8s/kind.yaml
fi
kubectl config use-context "kind-$CLUSTER" >/dev/null

if ! kubectl get deployment envoy-gateway -n envoy-gateway-system >/dev/null 2>&1; then
  step "Installing Envoy Gateway $ENVOY_GATEWAY_VERSION"
  kubectl apply --server-side \
    -f "https://github.com/envoyproxy/gateway/releases/download/$ENVOY_GATEWAY_VERSION/install.yaml"
fi
kubectl wait --timeout=300s -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available >/dev/null

# 2. Images: an immutable tag per commit (plus a timestamp if uncommitted) ------
TAG="$(git rev-parse --short HEAD)"
if [[ -n "$(git status --porcelain -- apps packages infra/docker pnpm-lock.yaml)" ]]; then
  TAG="$TAG-dirty-$(date +%s)"
fi
step "Building images jobpilot/{${APPS[*]// /,}}:$TAG"
for app in "${APPS[@]}"; do
  docker build -q -f "infra/docker/$app.Dockerfile" -t "jobpilot/$app:$TAG" . >/dev/null
  echo "  built jobpilot/$app:$TAG"
done
step "Loading images into the cluster (no registry needed)"
for app in "${APPS[@]}"; do
  kind load docker-image "jobpilot/$app:$TAG" --name "$CLUSTER" >/dev/null
done

# 3. Secrets, then render, migrate and roll out (shared with the AWS server) ----
[[ -f "$OVERLAY/secrets.env" ]] || cp "$OVERLAY/secrets.env.example" "$OVERLAY/secrets.env"
"$ROOT/infra/k8s/apply.sh" local jobpilot "$TAG"

step "Done: http://localhost:8080  (images tagged $TAG)"
