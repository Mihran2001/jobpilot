#!/usr/bin/env bash
# Renders an overlay with the given image tag, runs the migration Job, waits
# for it, then rolls out the workloads. Used by up.sh (kind) and by the AWS
# server's deploy script.
#
#   infra/k8s/apply.sh <overlay-name> <image-prefix> <tag>
#   e.g. apply.sh local jobpilot 8c5512c
#        apply.sh aws 123456789012.dkr.ecr.eu-central-1.amazonaws.com/jobpilot <sha>
set -euo pipefail

OVERLAY="$1"
PREFIX="$2"
TAG="$3"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APPS=(migrate api worker web)

# Rendered next to the overlays (gitignored): Kustomize only accepts relative
# resource paths, and this keeps them stable.
WORK="$ROOT/infra/k8s/.build"
rm -rf "$WORK" && mkdir -p "$WORK"
{
  echo "apiVersion: kustomize.config.k8s.io/v1beta1"
  echo "kind: Kustomization"
  echo "resources: [../overlays/$OVERLAY]"
  echo "images:"
  for app in "${APPS[@]}"; do
    echo "  - { name: jobpilot/$app, newName: $PREFIX/$app, newTag: \"$TAG\" }"
  done
} > "$WORK/kustomization.yaml"
kubectl kustomize "$WORK" > "$WORK/all.yaml"

# Split: everything the apps depend on first, the workloads last.
python3 - "$WORK" <<'PY'
import sys, pathlib
work = pathlib.Path(sys.argv[1])
docs = [d for d in (work / "all.yaml").read_text().split("\n---\n") if d.strip()]
is_app = lambda d: any(f"kind: {k}\n" in d for k in ("Deployment", "StatefulSet", "CronJob")) and "name: redis" not in d
(work / "prepare.yaml").write_text("\n---\n".join(d for d in docs if not is_app(d)))
(work / "apps.yaml").write_text("\n---\n".join(d for d in docs if is_app(d)))
PY

echo "==> Applying config, secrets, services and gateway; running migrations"
# Jobs are immutable: a new image tag needs a new Job object.
kubectl delete job migrate seed -n jobpilot --ignore-not-found >/dev/null
kubectl apply -f "$WORK/prepare.yaml" >/dev/null
if ! kubectl wait --for=condition=Complete job/migrate -n jobpilot --timeout=300s >/dev/null; then
  echo "Migration failed:" >&2
  kubectl logs job/migrate -n jobpilot >&2 || true
  exit 1
fi
kubectl logs job/migrate -n jobpilot | tail -1

echo "==> Rolling out api, worker and web"
kubectl apply -f "$WORK/apps.yaml" >/dev/null
for deploy in api worker web; do
  kubectl rollout status "deployment/$deploy" -n jobpilot --timeout=300s
done
