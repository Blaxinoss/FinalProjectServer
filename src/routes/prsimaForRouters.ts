// import "dotenv/config";
// import { PrismaMariaDb } from '@prisma/adapter-mariadb';
// import { PrismaClient } from "../generated/prisma/client.js";

// const adapter = new PrismaMariaDb({
//     host: process.env.DATABASE_HOST ?? "localhost",
//     user: process.env.DATABASE_USER ?? "",
//     password: process.env.DATABASE_PASSWORD ?? "",
//     database: process.env.DATABASE_NAME ?? "",
//     connectionLimit: 20,
//     connectTimeout: 10000
// });

// const prisma = new PrismaClient({ adapter });
// console.log(prisma.$connect().then(() => { console.log("database sql ready prisma") }))


// export { prisma };

import 'dotenv/config'
import { PrismaClient } from "../generated/prisma/client.js";

const prisma = new PrismaClient();

prisma.$connect()
    .then(() => console.log("database ready"))
    .catch((e) => console.error("database connection failed", e));

export { prisma };