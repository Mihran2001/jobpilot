variable "aws_profile" {
  description = "AWS CLI profile to use (from `aws configure sso`)."
  type        = string
  default     = "jobpilot"
}

variable "region" {
  description = "AWS region. Stockholm: the account's home region, and cheaper than Frankfurt for this setup."
  type        = string
  default     = "eu-north-1"
}

variable "project" {
  type    = string
  default = "jobpilot"
}

variable "github_repository" {
  description = "owner/name of the GitHub repository whose CI may push images."
  type        = string
  default     = "Mihran2001/jobpilot"
}

variable "notification_email" {
  description = "Receives budget alerts and Let's Encrypt expiry notices."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Budget alert threshold. Option A is about $47/month when running."
  type        = number
  default     = 60
}

variable "instance_type" {
  description = "t4g.medium: 2 ARM vCPUs, 4 GB. Enough for k3s, gateway, 5 app pods and Chrome."
  type        = string
  default     = "t4g.medium"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL major version; RDS picks the latest minor."
  type        = string
  default     = "18"
}

variable "k3s_version" {
  description = "Same Kubernetes minor version as the local kind cluster."
  type        = string
  default     = "v1.35.9+k3s1"
}

variable "envoy_gateway_version" {
  type    = string
  default = "v1.9.2"
}

variable "cert_manager_version" {
  type    = string
  default = "v1.21.2"
}

variable "keep_final_db_snapshot" {
  description = "On `tofu destroy`, keep a final RDS snapshot (costs ~$0.10/GB-month until deleted)."
  type        = bool
  default     = false
}
