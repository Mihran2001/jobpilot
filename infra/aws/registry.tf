locals {
  apps = ["api", "worker", "web", "migrate"]
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(local.apps)
  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "IMMUTABLE" # a tag (the git commit) always means the same image
  force_delete         = true        # `tofu destroy` removes the images too

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Keep the 5 newest images per repository; older ones expire automatically.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 5 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
