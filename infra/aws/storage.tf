# CV PDFs. Private: browsers only ever get 5-minute presigned URLs.
resource "aws_s3_bucket" "cvs" {
  bucket        = "${var.project}-cvs-${local.account_id}"
  force_destroy = true # `tofu destroy` deletes the PDFs too
}

resource "aws_s3_bucket_public_access_block" "cvs" {
  bucket                  = aws_s3_bucket.cvs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "cvs" {
  bucket = aws_s3_bucket.cvs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# The browser uploads (PUT) and downloads (GET) straight from S3, from the
# app's origin only.
resource "aws_s3_bucket_cors_configuration" "cvs" {
  bucket = aws_s3_bucket.cvs.id
  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = ["https://${local.public_host}"]
    allowed_headers = ["content-type"]
    max_age_seconds = 3600
  }
}
