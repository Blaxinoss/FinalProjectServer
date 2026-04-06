-- AlterTable
ALTER TABLE `paymenttransaction` ADD COLUMN `reservationId` INTEGER NULL,
    MODIFY `parkingSessionId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `paymentTransaction` ADD CONSTRAINT `paymentTransaction_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
