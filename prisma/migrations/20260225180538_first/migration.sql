-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(15) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `uuid` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `NationalID` VARCHAR(20) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `licenseNumber` VARCHAR(50) NOT NULL,
    `paymentGatewayToken` VARCHAR(255) NULL,
    `notificationToken` VARCHAR(255) NULL,
    `licenseExpiry` DATETIME(3) NOT NULL,
    `hasOutstandingDebt` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_phone_key`(`phone`),
    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_uuid_key`(`uuid`),
    UNIQUE INDEX `User_NationalID_key`(`NationalID`),
    UNIQUE INDEX `User_licenseNumber_key`(`licenseNumber`),
    UNIQUE INDEX `User_paymentGatewayToken_key`(`paymentGatewayToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParkingSlot` (
    `id` VARCHAR(20) NOT NULL,
    `type` ENUM('REGULAR', 'EMERGENCY') NOT NULL DEFAULT 'REGULAR',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vehicle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `plate` VARCHAR(20) NOT NULL,
    `color` VARCHAR(50) NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `hasOutstandingDebt` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Vehicle_plate_key`(`plate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reservation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `vehicleId` INTEGER NOT NULL,
    `slotId` VARCHAR(20) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `paymentType` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL,
    `paymentIntentId` VARCHAR(191) NULL,
    `isStacked` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('CONFIRMED', 'CANCELLED', 'FULFILLED', 'NO_SHOW') NOT NULL DEFAULT 'CONFIRMED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Reservation_paymentIntentId_key`(`paymentIntentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParkingSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `vehicleId` INTEGER NOT NULL,
    `slotId` VARCHAR(20) NOT NULL,
    `status` ENUM('ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `entryTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `exitTime` DATETIME(3) NULL,
    `exitCheckJobId` VARCHAR(100) NULL,
    `occupancyCheckJobId` VARCHAR(100) NULL,
    `paymentType` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL,
    `paymentIntentId` VARCHAR(191) NULL,
    `isExtended` BOOLEAN NOT NULL DEFAULT false,
    `overtimeStartTime` DATETIME(3) NULL,
    `overtimeEndTime` DATETIME(3) NULL,
    `expectedExitTime` DATETIME(3) NOT NULL,
    `notes` MEDIUMTEXT NULL,
    `involvedInConflict` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reservationId` INTEGER NULL,

    UNIQUE INDEX `ParkingSession_paymentIntentId_key`(`paymentIntentId`),
    UNIQUE INDEX `ParkingSession_reservationId_key`(`reservationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paymentTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parkingSessionId` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paymentMethod` ENUM('CASH', 'CARD', 'APPLICATION', 'OTHER') NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `transactionStatus` ENUM('PENDING', 'COMPLETED', 'FAILED', 'UNPAID_EXIT', 'CANCELLED') NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Vehicle` ADD CONSTRAINT `Vehicle_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reservation` ADD CONSTRAINT `Reservation_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingSession` ADD CONSTRAINT `ParkingSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingSession` ADD CONSTRAINT `ParkingSession_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `Vehicle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParkingSession` ADD CONSTRAINT `ParkingSession_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `Reservation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentTransaction` ADD CONSTRAINT `paymentTransaction_parkingSessionId_fkey` FOREIGN KEY (`parkingSessionId`) REFERENCES `ParkingSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
