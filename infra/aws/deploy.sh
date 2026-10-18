#!/usr/bin/env bash
# Deploys the current commit to the AWS server.
#   pnpm aws:deploy           # normal deploy
#   pnpm aws:deploy --seed    # first deploy: also create the user and sources
# Needs: `tofu apply` done, AWS CLI logged in (aws sso login --profile jobpilot),
# Docker running, and the commit pushed to GitHub (the server downloads it).
set -euo pipefail

SEED="${1:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export AWS_PROFILE="${AWS_PROFILE:-jobpilot}"
cd "$ROOT"

out() { tofu -chdir=infra/aws output -raw "$1"; }
REGION="$(out region)"
REGISTRY="$(out ecr_registry)"
INSTANCE="$(out instance_id)"
REPO="$(out github_repository)"
TAG="$(git rev-parse HEAD)"

# The server deploys exactly this commit from GitHub, so it must be there.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes: commit (and push) first, so the server deploys what you see." >&2
  exit 1
fi
if [[ -z "$(git branch -r --contains "$TAG" 2>/dev/null)" ]]; then
  echo "Commit $TAG is not on GitHub yet: git push first." >&2
  exit 1
fi

echo "==> Images for $TAG (CI may already have pushed them)"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
for app in migrate api worker web; do
  if aws ecr describe-images --region "$REGION" --repository-name "jobpilot/$app" --image-ids "imageTag=$TAG" >/dev/null 2>&1; then
    echo "  $app: already in ECR"
  else
    docker build -q --platform linux/arm64 -f "infra/docker/$app.Dockerfile" -t "$REGISTRY/jobpilot/$app:$TAG" . >/dev/null
    docker push -q "$REGISTRY/jobpilot/$app:$TAG" >/dev/null
    echo "  $app: built and pushed"
  fi
done

echo "==> Deploying on $INSTANCE through SSM Run Command"
SRC="/opt/jobpilot/src-$TAG"
REMOTE="set -euo pipefail; rm -rf $SRC; mkdir -p $SRC; \
curl -sfL https://codeload.github.com/$REPO/tar.gz/$TAG | tar xz --strip-components=1 -C $SRC; \
bash $SRC/infra/aws/server-deploy.sh $SRC $TAG $SEED"
PARAMS="$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]], "executionTimeout": ["1200"]}))' "$REMOTE")"
COMMAND_ID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript --comment "deploy ${TAG:0:7}" \
  --parameters "$PARAMS" --query Command.CommandId --output text)"

status=InProgress
while [[ "$status" == "Pending" || "$status" == "InProgress" || "$status" == "Delayed" ]]; do
  sleep 5
  status="$(aws ssm get-command-invocation --region "$REGION" --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)"
done
aws ssm get-command-invocation --region "$REGION" --command-id "$COMMAND_ID" --instance-id "$INSTANCE" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text
[[ "$status" == "Success" ]] || { echo "Deploy $status" >&2; exit 1; }
