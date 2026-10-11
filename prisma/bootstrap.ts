/**
 * Production bootstrap (`pnpm admin:bootstrap`) — safe to run repeatedly, never creates demo data.
 *  - default settings and the default 10-point grade scale, if missing
 *  - the first SUPER_ADMIN, only if no admin exists yet; prints a one-time temporary
 *    password (the admin must change it at first sign-in)
 *
 * Required env: DATABASE_URL, ADMIN_LOGIN_ID, ADMIN_EMAIL, ADMIN_NAME.
 */
import "dotenv/config";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { settingDefaults } from "@/lib/settings";

const DEFAULT_BANDS = [
  { letter: "O", minPercent: 90, gradePoint: 10, isPass: true },
  { letter: "A+", minPercent: 80, gradePoint: 9, isPass: true },
  { letter: "A", minPercent: 70, gradePoint: 8, isPass: true },
  { letter: "B+", minPercent: 60, gradePoint: 7, isPass: true },
  { letter: "B", minPercent: 50, gradePoint: 6, isPass: true },
  { letter: "C", minPercent: 45, gradePoint: 5, isPass: true },
  { letter: "P", minPercent: 40, gradePoint: 4, isPass: true },
  { letter: "F", minPercent: 0, gradePoint: 0, isPass: false },
];

async function main() {
  const settings = await db.setting.createMany({
    data: Object.entries(settingDefaults).map(([key, value]) => ({ key, value })),
    skipDuplicates: true,
  });
  console.log(`Settings: ${settings.count} added (existing values kept).`);

  if (!(await db.gradeScale.findFirst({ where: { isDefault: true } }))) {
    await db.gradeScale.create({
      data: { name: "10-point (default)", isDefault: true, bands: { create: DEFAULT_BANDS } },
    });
    console.log("Grade scale: default 10-point scale created.");
  } else {
    console.log("Grade scale: already configured.");
  }

  if (await db.user.findFirst({ where: { role: "SUPER_ADMIN", deletedAt: null } })) {
    console.log("Admin: an administrator already exists — nothing to do.");
    return;
  }
  const { ADMIN_LOGIN_ID, ADMIN_EMAIL, ADMIN_NAME } = process.env;
  if (!ADMIN_LOGIN_ID || !ADMIN_EMAIL || !ADMIN_NAME) {
    throw new Error(
      "Set ADMIN_LOGIN_ID, ADMIN_EMAIL and ADMIN_NAME to create the first administrator.",
    );
  }
  const tempPassword = generateTempPassword();
  const admin = await db.user.create({
    data: {
      loginId: ADMIN_LOGIN_ID.trim(),
      email: ADMIN_EMAIL.trim().toLowerCase(),
      name: ADMIN_NAME.trim(),
      role: "SUPER_ADMIN",
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      onboardingStep: "COMPLETE",
    },
  });
  await db.auditLog.create({
    data: {
      action: "user.created",
      entityType: "User",
      entityId: admin.id,
      metadata: { role: "SUPER_ADMIN", via: "bootstrap" },
    },
  });
  // Printed exactly once, to the operator running the command. It is not stored anywhere.
  console.log(
    `\nAdmin created: ${admin.loginId}\nTemporary password (shown once): ${tempPassword}\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
