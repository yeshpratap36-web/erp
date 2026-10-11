import { randomInt } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (19 MiB memory, 2 iterations).
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash — treat as a failed verification rather than a 500.
    return false;
  }
}

// No look-alike characters (0/O, 1/l/I) so admins can read temp passwords aloud.
const TEMP_ALPHABET = {
  lower: "abcdefghijkmnpqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digit: "23456789",
  symbol: "@#$%&*!?",
};

/** Cryptographically random temporary password that satisfies `passwordSchema` (lib/validators/auth.ts). */
export function generateTempPassword(length = 12): string {
  const pick = (chars: string) => chars[randomInt(chars.length)];
  const all = Object.values(TEMP_ALPHABET).join("");
  const chars = [
    pick(TEMP_ALPHABET.lower),
    pick(TEMP_ALPHABET.upper),
    pick(TEMP_ALPHABET.digit),
    pick(TEMP_ALPHABET.symbol),
    ...Array.from({ length: length - 4 }, () => pick(all)),
  ];
  // Fisher–Yates shuffle so the required classes aren't always in the first positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
