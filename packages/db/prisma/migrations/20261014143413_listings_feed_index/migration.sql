-- CreateIndex
CREATE INDEX "job_listings_posted_at_id_idx" ON "job_listings"("posted_at" DESC, "id" DESC);
