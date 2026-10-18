# --- What the server (and so every pod on it) may do in AWS -------------------

data "aws_iam_policy_document" "server_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = "${var.project}-server"
  assume_role_policy = data.aws_iam_policy_document.server_assume.json
}

# Session Manager (shell without SSH) and Run Command (deploys).
resource "aws_iam_role_policy_attachment" "server_ssm" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "server" {
  statement {
    sid       = "PullImages"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "PullFromOurRepositories"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  statement {
    sid       = "CvFiles"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.cvs.arn}/*"]
  }
  statement {
    sid       = "CvBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.cvs.arn]
  }
  statement {
    sid       = "ReadOurSecrets"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.database_url.arn, aws_ssm_parameter.seed_user_password.arn]
  }
  statement {
    sid       = "DecryptThroughSsmOnly"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "server" {
  name   = "${var.project}-server"
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.server.json
}

resource "aws_iam_instance_profile" "server" {
  name = "${var.project}-server"
  role = aws_iam_role.server.name
}

# --- The machine ---------------------------------------------------------------

# The latest Amazon Linux 2023 for ARM: SSM agent and AWS CLI preinstalled.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# Allocated before the server, so its address can go into the server's own
# configuration (the sslip.io hostname) without a dependency cycle.
resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = var.project }
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.al2023_arm64.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 only
    # 2 hops: pods sit one network hop behind the host, and they get their
    # AWS credentials (S3) from the instance role through this endpoint.
    http_put_response_hop_limit = 2
  }

  user_data = templatefile("${path.module}/server-init.sh.tftpl", {
    k3s_version  = var.k3s_version
    instance_env = <<-ENV
      REGION=${var.region}
      ECR_REGISTRY=${local.account_id}.dkr.ecr.${var.region}.amazonaws.com
      GITHUB_REPOSITORY=${var.github_repository}
      PUBLIC_HOST=${local.public_host}
      ACME_EMAIL=${var.notification_email}
      S3_BUCKET=${aws_s3_bucket.cvs.id}
      PARAM_DATABASE_URL=${aws_ssm_parameter.database_url.name}
      PARAM_SEED_USER_PASSWORD=${aws_ssm_parameter.seed_user_password.name}
      ENVOY_GATEWAY_VERSION=${var.envoy_gateway_version}
      CERT_MANAGER_VERSION=${var.cert_manager_version}
    ENV
  })
  # Boot scripts only run on first boot: a changed script means a new server.
  user_data_replace_on_change = true

  tags = { Name = var.project }

  # Make sure the database exists before the server tries to use it.
  depends_on = [aws_db_instance.main]
}

resource "aws_eip_association" "server" {
  allocation_id = aws_eip.server.id
  instance_id   = aws_instance.server.id
}
