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

# 3. Render manifests with this tag, without editing committed files -----------
[[ -f "$OVERLAY/secrets.env" ]] || cp "$OVERLAY/secrets.env.example" "$OVERLAY/secrets.env"
# Rendered next to the overlays (gitignored) so the relative path is stable.
WORK="$ROOT/infra/k8s/.build"
rm -rf "$WORK" && mkdir -p "$WORK"
{
  echo "apiVersion: kustomize.config.k8s.io/v1beta1"
  echo "kind: Kustomization"
  echo "resources: [../overlays/local]"  # Kustomize only accepts relative paths
  echo "images:"
  for app in "${APPS[@]}"; do echo "  - { name: jobpilot/$app, newTag: $TAG }"; done
} > "$WORK/kustomization.yaml"
kubectl kustomize --load-restrictor LoadRestrictionsNone "$WORK" > "$WORK/all.yaml"

# Split: everything the apps depend on first, the workloads last.
python3 - "$WORK" <<'PY'
import sys, pathlib
work = pathlib.Path(sys.argv[1])
docs = [d for d in (work / "all.yaml").read_text().split("\n---\n") if d.strip()]
is_app = lambda d: any(f"kind: {k}\n" in d for k in ("Deployment", "CronJob"))
(work / "prepare.yaml").write_text("\n---\n".join(d for d in docs if not is_app(d)))
(work / "apps.yaml").write_text("\n---\n".join(d for d in docs if is_app(d)))
PY

# 4. Migrate, then roll the apps ------------------------------------------------
step "Applying config, secrets, services and gateway; running migrations"
kubectl delete job migrate -n jobpilot --ignore-not-found >/dev/null  # Jobs are immutable
kubectl apply -f "$WORK/prepare.yaml" >/dev/null
if ! kubectl wait --for=condition=Complete job/migrate -n jobpilot --timeout=300s >/dev/null; then
  echo "Migration failed:" >&2
  kubectl logs job/migrate -n jobpilot >&2 || true
  exit 1
fi
kubectl logs job/migrate -n jobpilot | tail -1

step "Rolling out api, worker and web"
kubectl apply -f "$WORK/apps.yaml" >/dev/null
for deploy in api worker web; do
  kubectl rollout status "deployment/$deploy" -n jobpilot --timeout=300s
done

step "Done: http://localhost:8080  (images tagged $TAG)"
