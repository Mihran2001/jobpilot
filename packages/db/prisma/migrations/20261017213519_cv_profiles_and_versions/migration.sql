/*
  Warnings:

  - Added the required column `file_name` to the `cv_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `cv_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `cv_versions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "cv_status" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "cv_source" AS ENUM ('GENERATED', 'UPLOADED');

-- AlterTable
ALTER TABLE "cv_versions" ADD COLUMN     "error" TEXT,
ADD COLUMN     "file_name" TEXT NOT NULL,
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "source" "cv_source" NOT NULL,
ADD COLUMN     "status" "cv_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL;

-- CreateTable
CREATE TABLE "cv_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cv_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cv_profiles_user_id_key" ON "cv_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "cv_profiles" ADD CONSTRAINT "cv_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
