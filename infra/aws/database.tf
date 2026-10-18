resource "random_password" "db" {
  length  = 32
  special = false # goes into a connection URL; letters and digits need no escaping
}

resource "aws_db_subnet_group" "main" {
  name       = var.project
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier     = var.project
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.project
  username = var.project
  password = random_password.db.result

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false # one AZ: half the price; fine for a learning project

  backup_retention_period    = 1 # daily automated backup, free up to the database's size
  auto_minor_version_upgrade = true
  apply_immediately          = true

  deletion_protection       = false
  skip_final_snapshot       = !var.keep_final_db_snapshot
  final_snapshot_identifier = var.keep_final_db_snapshot ? "${var.project}-final" : null
}
