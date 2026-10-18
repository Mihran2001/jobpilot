terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # Every resource is tagged, so a leftover can always be found:
  # Resource Groups & Tag Editor -> tag Project = jobpilot.
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "opentofu"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  # 3.121.45.6 -> 3-121-45-6.sslip.io: a free hostname that resolves to the
  # server, so Let's Encrypt can issue a certificate without a domain.
  public_host = "${replace(aws_eip.server.public_ip, ".", "-")}.sslip.io"
}
