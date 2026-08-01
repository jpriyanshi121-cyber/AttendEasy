/*
  Warnings:

  - You are about to drop the column `threshold` on the `Subject` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'lecture';

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "threshold",
ADD COLUMN     "thresholdLecture" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "thresholdPractical" INTEGER NOT NULL DEFAULT 75,
ADD COLUMN     "thresholdTutorial" INTEGER NOT NULL DEFAULT 75;
