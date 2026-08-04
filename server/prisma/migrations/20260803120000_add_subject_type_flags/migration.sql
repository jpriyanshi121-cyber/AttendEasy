-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "hasLecture" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "hasTutorial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasPractical" BOOLEAN NOT NULL DEFAULT false;