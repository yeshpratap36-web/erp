import { z } from "zod";

/**
 * Server-side environment, validated once at startup. Import `env` instead of
 * reading `process.env` directly so misconfiguration fails fast and loudly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  FACE_SERVICE_URL: z.url(),
  FACE_SERVICE_TOKEN: z.string().min(32, "FACE_SERVICE_TOKEN must be at least 32 characters"),
});

export type Env = z.infer<typeof envSchema>;

/** Placeholder values used only while `next build` collects page data (no secrets exist then). */
const BUILD_PLACEHOLDERS = {
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  AUTH_SECRET: "build-time-placeholder-not-a-real-secret-0000",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "build",
  S3_SECRET_ACCESS_KEY: "build",
  S3_BUCKET: "build",
  FACE_SERVICE_URL: "http://127.0.0.1:8001",
  FACE_SERVICE_TOKEN: "build-time-placeholder-not-a-real-token-0000",
};

function parseEnv(): Env {
  // `next build` imports server modules to collect page data; nothing connects at that point.
  // Real values are still required (and validated) whenever the server actually runs.
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const result = envSchema.safeParse(
    isBuild ? { ...BUILD_PLACEHOLDERS, ...process.env } : process.env,
  );
  if (!result.success) {
    console.error("Invalid environment variables:\n" + z.prettifyError(result.error));
    throw new Error("Invalid environment variables");
  }
  return result.data;
}

export const env = parseEnv();
