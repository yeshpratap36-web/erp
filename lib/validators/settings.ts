import { z } from "zod";
import { checkboxField } from "@/lib/validators/common";

export const settingsFormSchema = z
  .object({
    "attendance.threshold": z.coerce.number().min(0).max(100),
    "face.matchThreshold": z.coerce.number().min(0).max(1),
    "face.uncertainThreshold": z.coerce.number().min(0).max(1),
    "face.deleteRawPhotosAfterEnrollment": checkboxField(),
    "auth.maxFailedAttempts": z.coerce.number().int().min(3).max(20),
    "auth.lockoutMinutes": z.coerce.number().int().min(1).max(1440),
  })
  .refine((s) => s["face.uncertainThreshold"] < s["face.matchThreshold"], {
    path: ["face.uncertainThreshold"],
    message: "Must be lower than the match threshold",
  });

export type GradeBandInput = {
  letter: string;
  minPercent: number;
  gradePoint: number;
  isPass: boolean;
};

/** Grade bands arrive as numbered fields: letter:0, min:0, gp:0, pass:0, letter:1, … (blank rows ignored). */
export function parseGradeBands(fields: Record<string, string>): {
  bands: GradeBandInput[];
  errors: string[];
} {
  const indexes = [
    ...new Set(
      Object.keys(fields)
        .filter((k) => k.startsWith("letter:"))
        .map((k) => k.slice(7)),
    ),
  ];
  const bands: GradeBandInput[] = [];
  const errors: string[] = [];
  for (const i of indexes) {
    const letter = (fields[`letter:${i}`] ?? "").trim();
    if (!letter) continue;
    const minPercent = Number(fields[`min:${i}`]);
    const gradePoint = Number(fields[`gp:${i}`]);
    if (letter.length > 3) errors.push(`"${letter}": letters are at most 3 characters`);
    if (!Number.isFinite(minPercent) || minPercent < 0 || minPercent > 100)
      errors.push(`${letter}: minimum % must be 0–100`);
    if (!Number.isFinite(gradePoint) || gradePoint < 0 || gradePoint > 10)
      errors.push(`${letter}: grade point must be 0–10`);
    bands.push({ letter, minPercent, gradePoint, isPass: fields[`pass:${i}`] === "on" });
  }
  if (bands.length < 2) errors.push("Define at least two grades");
  if (new Set(bands.map((b) => b.letter.toUpperCase())).size !== bands.length)
    errors.push("Grade letters must be unique");
  if (new Set(bands.map((b) => b.minPercent)).size !== bands.length)
    errors.push("Minimum percentages must be unique");
  if (!bands.some((b) => b.minPercent === 0))
    errors.push("One grade must start at 0% so every score gets a grade");
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  if (sorted.some((b, i) => i > 0 && b.gradePoint > sorted[i - 1].gradePoint)) {
    errors.push("Higher grades must not have fewer grade points");
  }
  return { bands: sorted, errors };
}
