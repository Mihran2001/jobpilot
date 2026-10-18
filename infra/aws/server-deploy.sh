#!/usr/bin/env bash
# Runs ON the server (via SSM Run Command from infra/aws/deploy.sh), from a
# checkout of the commit being deployed:
#   server-deploy.sh <source-dir> <git-sha> [--seed]
set -euo pipefail

SRC="$1"
TAG="$2"
SEED="${3:-}"
# shellcheck disable=SC1091
source /opt/jobpilot/instance.env
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
export PATH="/usr/local/bin:$PATH"

step() { printf '\n==> %s\n' "$*"; }

if [[ ! -f /opt/jobpilot/ready ]]; then
  echo "k3s is not ready yet: the server's first boot is still running (a few minutes after creation)." >&2
  exit 1
fi

# 1. Platform: the same Envoy Gateway as locally, and cert-manager --------------
step "Envoy Gateway $ENVOY_GATEWAY_VERSION"
kubectl apply --server-side --force-conflicts \
  -f "https://github.com/envoyproxy/gateway/releases/download/$ENVOY_GATEWAY_VERSION/install.yaml" >/dev/null
kubectl wait --timeout=300s -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available

# Installed after Envoy Gateway on purpose: cert-manager's Gateway API support
# only switches on if the Gateway API CRDs exist when it starts. k3s's built-in
# Helm controller installs the chart from this HelmChart object.
step "cert-manager $CERT_MANAGER_VERSION"
kubectl apply -f - >/dev/null <<YAML
apiVersion: helm.cattle.io/v1
kind: HelmChart
metadata:
  name: cert-manager
  namespace: kube-system
spec:
  repo: https://charts.jetstack.io
  chart: cert-manager
  version: $CERT_MANAGER_VERSION
  targetNamespace: cert-manager
  createNamespace: true
  valuesContent: |-
    crds:
      enabled: true
    config:
      apiVersion: controller.config.cert-manager.io/v1alpha1
      kind: ControllerConfiguration
      gatewayAPI:
        enabled: true
YAML
until kubectl get deployment cert-manager-webhook -n cert-manager >/dev/null 2>&1; do sleep 5; done
kubectl wait --timeout=300s -n cert-manager deployment --all --for=condition=Available

# 2. Images: like `kind load`, pulled into k3s's image store with the server's
#    IAM role, so pods start from local images and need no registry password.
step "Pulling images $TAG from ECR"
TOKEN="$(aws ecr get-login-password --region "$REGION")"
for app in migrate api worker web; do
  k3s ctr images pull --user "AWS:$TOKEN" "$ECR_REGISTRY/jobpilot/$app:$TAG" >/dev/null
  echo "  $app"
done
unset TOKEN

# 3. Config and secrets (secrets from SSM Parameter Store, readable by root only)
step "Writing config and secrets"
OVERLAY="$SRC/infra/k8s/overlays/aws"
cat > "$OVERLAY/config.env" <<ENV
PUBLIC_HOST=$PUBLIC_HOST
ACME_EMAIL=$ACME_EMAIL
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3001
API_INTERNAL_URL=http://api:3001
TRUST_PROXY=uniquelocal
SESSION_TTL_DAYS=7
AUTH_RATE_LIMIT_PER_MINUTE=5
REDIS_URL=redis://redis:6379
AWS_REGION=$REGION
S3_REGION=$REGION
S3_BUCKET=$S3_BUCKET
S3_FORCE_PATH_STYLE=false
S3_CREATE_BUCKET=false
WORKER_HEALTH_PORT=3003
BULL_BOARD_PORT=0
SCORE_CONCURRENCY=10
CV_CONCURRENCY=1
ENV
param() { aws ssm get-parameter --region "$REGION" --with-decryption --name "$1" --query Parameter.Value --output text; }
(
  umask 077
  {
    echo "DATABASE_URL=$(param "$PARAM_DATABASE_URL")"
    echo "SEED_USER_PASSWORD=$(param "$PARAM_SEED_USER_PASSWORD")"
  } > "$OVERLAY/secrets.env"
)

# 4. Amazon's RDS certificate authority, so pods can verify the database
step "RDS certificate bundle"
kubectl create namespace jobpilot --dry-run=client -o yaml | kubectl apply -f - >/dev/null
curl -sfL -o /opt/jobpilot/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
kubectl create configmap rds-ca -n jobpilot \
  --from-file=global-bundle.pem=/opt/jobpilot/rds-global-bundle.pem \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null

# 5. The same migrate-then-roll sequence as the local cluster
step "Deploying"
"$SRC/infra/k8s/apply.sh" aws "$ECR_REGISTRY/jobpilot" "$TAG"

# 6. First deploy only: create the user and the job sources
if [[ "$SEED" == "--seed" ]]; then
  step "Seeding the database"
  kubectl patch job seed -n jobpilot --type merge -p '{"spec":{"suspend":false}}' >/dev/null
  kubectl wait --for=condition=Complete job/seed -n jobpilot --timeout=300s
  kubectl logs job/seed -n jobpilot | grep -A8 'Seed complete' || true
fi

# Keep the last three checkouts.
ls -1dt /opt/jobpilot/src-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
rm -f "$OVERLAY/secrets.env"

step "Deployed $TAG: https://$PUBLIC_HOST"
