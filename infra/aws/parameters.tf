# Secrets for the server, in SSM Parameter Store (standard tier: free). The
# server reads them with its IAM role at deploy time, so they never appear in
# the instance's user data, which anyone allowed to describe it could read.
# They are also in OpenTofu's state file: keep terraform.tfstate private.

resource "random_password" "seed_user" {
  length  = 24
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name = "/${var.project}/database-url"
  type = "SecureString"
  value = format(
    "postgresql://%s:%s@%s:%d/%s?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem",
    aws_db_instance.main.username, random_password.db.result,
    aws_db_instance.main.address, aws_db_instance.main.port, aws_db_instance.main.db_name,
  )
}

resource "aws_ssm_parameter" "seed_user_password" {
  name  = "/${var.project}/seed-user-password"
  type  = "SecureString"
  value = random_password.seed_user.result
}
