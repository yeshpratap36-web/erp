import { describe, expect, it } from "vitest";
import { academicYearFor } from "@/lib/academics/calendar";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("academicYearFor", () => {
  it("puts July–December in the odd term of that year", () => {
    const y = academicYearFor(d("2026-10-12"));
    expect(y.name).toBe("2026-27");
    expect(y.currentTerm).toBe("ODD");
    expect(y.odd.endDate.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("puts January–June in the even term of the previous year's academic year", () => {
    const y = academicYearFor(d("2027-03-01"));
    expect(y.name).toBe("2026-27");
    expect(y.currentTerm).toBe("EVEN");
  });

  it("supports earlier years and century wrap-around", () => {
    expect(academicYearFor(d("2026-10-12"), -1).name).toBe("2025-26");
    expect(academicYearFor(d("2099-08-01")).name).toBe("2099-00");
  });
});
