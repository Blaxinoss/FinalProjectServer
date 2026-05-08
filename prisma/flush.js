// import { PrismaClient } from "../src/generated/prisma/index.js";
// import { PrismaMariaDb } from '@prisma/adapter-mariadb';
// import mariadb from 'mariadb'; // <-- لازم تستدعي دي

// // 1. إنشاء الـ Pool عن طريق مكتبة mariadb
// const pool = mariadb.createPool({
//     host: "localhost", // <-- غيرناها من localhost
//     user: "root",
//     password: "Asdqwe123564@",
//     database: "garage",
//     port: 3306,
//     connectionLimit: 20,
//     connectTimeout: 10000
// });

// // 2. تمرير الـ Pool للـ Adapter
// const adapter = new PrismaMariaDb(pool);
// const prisma = new PrismaClient({ adapter });

// async function flushDatabase() {
//     try {
//         console.log("🧹 Flushing database...");

//         // 3. الترتيب مهم جداً عشان الـ Foreign Keys
//         // ابدأ بالجداول اللي بتربط حاجات ببعضها، وانتهي بالأساسيات
//         await prisma.paymentTransaction.deleteMany();
//         await prisma.parkingSession.deleteMany();
//         await prisma.reservation.deleteMany();
//         await prisma.vehicle.deleteMany();
//         await prisma.parkingSlot.deleteMany();
//         await prisma.user.deleteMany();

//         console.log("✅ Database flushed successfully!");
//     } catch (error) {
//         console.error("❌ Error flushing database:", error);
//     } finally {
//         // 4. قفل الاتصالات عشان السكريبت ينتهي ويخرج من التيرمينال
//         await prisma.$disconnect();
//         await pool.end();
//     }
// }

// flushDatabase();