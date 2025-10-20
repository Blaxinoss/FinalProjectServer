/*
  Warnings:

  - You are about to alter the column `status` on the `Reservation` table. The data in that column could be lost. The data in that column will be cast from `Enum(EnumId(1))` to `Enum(EnumId(0))`.

*/
-- AlterTable
ALTER TABLE `Reservation` MODIFY `status` ENUM('CONFIRMED', 'CANCELLED', 'FULFILLED', 'NO_SHOW') NOT NULL DEFAULT 'CONFIRMED',
    MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
