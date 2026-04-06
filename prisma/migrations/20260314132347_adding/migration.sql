/*
  Warnings:

  - Added the required column `userId` to the `paymentTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `paymenttransaction` ADD COLUMN `stripeTransactionId` VARCHAR(100) NULL,
    ADD COLUMN `userId` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `paymentTransaction` ADD CONSTRAINT `paymentTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
