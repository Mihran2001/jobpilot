# Server: only HTTP and HTTPS from the internet. No SSH port at all; shell
# access goes through AWS Systems Manager Session Manager instead.
resource "aws_security_group" "server" {
  name        = "${var.project}-server"
  description = "JobPilot server: web traffic in, anything out"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP (redirects to HTTPS; LetsEncrypt challenges)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    description = "Job sources, ECR, S3, SSM, LetsEncrypt, package mirrors"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Database: Postgres only, and only from the server.
resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "JobPilot database: Postgres from the server only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the server"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.server.id]
  }
}
