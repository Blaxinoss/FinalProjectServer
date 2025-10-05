/*
  Warnings:

  - You are about to drop the column `VehicleId` on the `ParkingSession` table. All the data in the column will be lost.
  - You are about to drop the column `slotNumber` on the `ParkingSession` table. All the data in the column will be lost.
  - Added the required column `slotId` to the `ParkingSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `vehicleId` to the `ParkingSession` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `ParkingSession` DROP FOREIGN KEY `ParkingSession_VehicleId_fkey`;

-- DropIndex
DROP INDEX `ParkingSession_VehicleId_fkey` ON `ParkingSession`;

-- AlterTable
ALTER TABLE `ParkingSession` DROP COLUMN `VehicleId`,
    DROP COLUMN `slotNumber`,
    ADD COLUMN `slotId` VARCHAR(20) NOT NULL,
    ADD COLUMN `vehicleId` INTEGER NOT NULL,
    MODIFY `status` VARCHAR(50) NOT NULL DEFAULT 'active';

-- AddForeignKey
ALTER TABLE `ParkingSession` ADD CONSTRAINT `ParkingSession_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
