output "url" {
  description = "The app (HTTPS works once the certificate is issued, about a minute after the first deploy)."
  value       = "https://${local.public_host}"
}

output "instance_id" {
  description = "For Session Manager: aws ssm start-session --target <id>"
  value       = aws_instance.server.id
}

output "region" {
  value = var.region
}

output "ecr_registry" {
  value = "${local.account_id}.dkr.ecr.${var.region}.amazonaws.com"
}

output "app_login" {
  description = "Seeded user. Run: tofu output -raw app_password"
  value       = "dev@jobpilot.test"
}

output "app_password" {
  value     = random_password.seed_user.result
  sensitive = true
}

output "github_repository" {
  value = var.github_repository
}
