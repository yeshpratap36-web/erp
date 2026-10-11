import { describe, expect, it } from "vitest";
import { parseGradeBands, settingsFormSchema } from "@/lib/validators/settings";

describe("parseGradeBands", () => {
  const ok = {
    "letter:0": "A",
    "min:0": "60",
    "gp:0": "9",
    "pass:0": "on",
    "letter:1": "F",
    "min:1": "0",
    "gp:1": "0",
    "letter:2": "",
    "min:2": "",
    "gp:2": "",
  };

  it("parses rows, ignores blank ones and sorts best first", () => {
    const { bands, errors } = parseGradeBands(ok);
    expect(errors).toEqual([]);
    expect(bands).toEqual([
      { letter: "A", minPercent: 60, gradePoint: 9, isPass: true },
      { letter: "F", minPercent: 0, gradePoint: 0, isPass: false },
    ]);
  });

  it("requires a 0% floor, unique letters/minimums and ordered points", () => {
    expect(parseGradeBands({ ...ok, "min:1": "10" }).errors).toContain(
      "One grade must start at 0% so every score gets a grade",
    );
    expect(parseGradeBands({ ...ok, "letter:1": "a" }).errors).toContain(
      "Grade letters must be unique",
    );
    expect(parseGradeBands({ ...ok, "gp:1": "10" }).errors).toContain(
      "Higher grades must not have fewer grade points",
    );
  });
});

describe("settingsFormSchema", () => {
  const base = {
    "attendance.threshold": "75",
    "face.matchThreshold": "0.42",
    "face.uncertainThreshold": "0.33",
    "auth.maxFailedAttempts": "5",
    "auth.lockoutMinutes": "15",
  };
  it("coerces form strings and the checkbox", () => {
    const r = settingsFormSchema.parse({ ...base, "face.deleteRawPhotosAfterEnrollment": "on" });
    expect(r).toMatchObject({
      "attendance.threshold": 75,
      "face.deleteRawPhotosAfterEnrollment": true,
    });
  });
  it("keeps the uncertain threshold below the match threshold", () => {
    expect(
      settingsFormSchema.safeParse({ ...base, "face.uncertainThreshold": "0.5" }).success,
    ).toBe(false);
  });
});
