import { describe, expect, it } from "vitest";
import { generateTempPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/validators/auth";

describe("password hashing", () => {
  it("verifies the correct password and rejects others", async () => {
    const hash = await hashPassword("Correct#Horse9");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct#Horse9")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("returns false for a malformed hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

describe("passwordSchema", () => {
  it.each(["short1!A", "alllowercase1!", "ALLUPPERCASE1!", "NoNumbers!!xx", "NoSymbols123x"])(
    "rejects weak password %s",
    (pw) => expect(passwordSchema.safeParse(pw).success).toBe(false),
  );

  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("Str0ng#Passw0rd").success).toBe(true);
  });
});

describe("generateTempPassword", () => {
  it("always satisfies the strength rules", () => {
    for (let i = 0; i < 200; i++) {
      expect(passwordSchema.safeParse(generateTempPassword()).success).toBe(true);
    }
  });
});
