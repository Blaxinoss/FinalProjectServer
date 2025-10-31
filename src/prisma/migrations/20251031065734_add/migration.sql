/*
  Warnings:

  - A unique constraint covering the columns `[paymentIntentId]` on the table `ParkingSession` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentIntentId]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `licenseExpiry` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ParkingSession` ADD COLUMN `paymentIntentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `paymentIntentId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `licenseExpiry` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ParkingSession_paymentIntentId_key` ON `ParkingSession`(`paymentIntentId`);

-- CreateIndex
CREATE UNIQUE INDEX `Reservation_paymentIntentId_key` ON `Reservation`(`paymentIntentId`);
