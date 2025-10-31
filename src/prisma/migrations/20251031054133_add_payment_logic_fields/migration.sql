/*
  Warnings:

  - You are about to drop the column `licenseExpiry` on the `User` table. All the data in the column will be lost.
  - You are about to alter the column `paymentMethod` on the `paymentTransaction` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `Enum(EnumId(3))`.
  - A unique constraint covering the columns `[paymentGatewayToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` DROP COLUMN `licenseExpiry`,
    ADD COLUMN `paymentGatewayToken` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `Vehicle` ADD COLUMN `hasOutstandingDebt` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `paymentTransaction` MODIFY `paymentMethod` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL,
    MODIFY `paidAt` DATETIME(3) NULL,
    MODIFY `transactionStatus` ENUM('PENDING', 'COMPLETED', 'FAILED', 'UNPAID_EXIT') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX `User_paymentGatewayToken_key` ON `User`(`paymentGatewayToken`);
