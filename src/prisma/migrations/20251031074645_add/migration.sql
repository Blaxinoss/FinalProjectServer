-- AlterTable
ALTER TABLE `ParkingSession` ADD COLUMN `paymentType` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL;

-- AlterTable
ALTER TABLE `Reservation` ADD COLUMN `paymentType` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL;
