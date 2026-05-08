
import { prisma } from "../../routes/prsimaForRouters.js";

const seedGates = async () => {
  await prisma.gate.createMany({
    data: [
      { name: "Main Entry", type: "ENTRY", status: "CLOSED" },
      { name: "Main Exit", type: "EXIT", status: "CLOSED" },
    ],
    skipDuplicates: true,
  });

  console.log("✅ Gates seeded");
  process.exit(0);
};

seedGates();