/*
  Warnings:

  - Added the required column `expectedExitTime` to the `ParkingSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ParkingSession` ADD COLUMN `exitCheckJobId` VARCHAR(100) NULL,
    ADD COLUMN `expectedExitTime` DATETIME(3) NOT NULL,
    ADD COLUMN `isExtended` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `overtimeEndTime` DATETIME(3) NULL,
    ADD COLUMN `overtimeStartTime` DATETIME(3) NULL;
