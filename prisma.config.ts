import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Optional so `prisma generate` works without a database (e.g. in the Docker build);
    // migrate/seed commands still fail clearly when it's missing.
    url: process.env.DATABASE_URL,
  },
});
