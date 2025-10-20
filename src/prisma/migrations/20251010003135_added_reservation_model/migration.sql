/*
  Warnings:

  - You are about to alter the column `status` on the `ParkingSession` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `Enum(EnumId(1))`.
  - You are about to alter the column `transactionStatus` on the `paymentTransaction` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `Enum(EnumId(2))`.
  - A unique constraint covering the columns `[reservationId]` on the table `ParkingSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `ParkingSession` ADD COLUMN `reservationId` INTEGER NULL,
    MODIFY `status` ENUM('ACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE',
    MODIFY `exitTime` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `paymentTransaction` MODIFY `transactionStatus` ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `vehicleId` INTEGER NOT NULL,
    `slotId` VARCHAR(20) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `status` ENUM('CONFIRMER', 'CANCELLED', 'FULFILLED', 'NO_SHOW') NOT NULL DEFAULT 'CONFIRMER',
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ParkingSession_reservationId_key` ON `ParkingSession`(`reservationId`);

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingSession` ADD CONSTRAINT `ParkingSession_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
