import { PrismaClient } from "../src/generated/prisma/index.js";
let prisma = new PrismaClient();
async function flushDatabase() {
  // List all your models here
  await prisma.reservation.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.user.deleteMany();
  await prisma.parkingSlot.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.parkingSession.deleteMany();
    

  // ... add more as needed

  console.log("✅ All data cleared successfully");
}

flushDatabase()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
