import { describe, expect, it } from "vitest";
import {
  addTallies,
  classesCanMiss,
  classesNeeded,
  percentage,
  tally,
} from "@/lib/attendance/stats";

describe("tally", () => {
  it("counts LATE as attended and excludes EXCUSED", () => {
    expect(tally(["PRESENT", "LATE", "ABSENT", "EXCUSED"])).toEqual({ attended: 2, total: 3 });
  });
});

describe("percentage", () => {
  it("is null before any class and rounds to one decimal", () => {
    expect(percentage({ attended: 0, total: 0 })).toBeNull();
    expect(percentage({ attended: 2, total: 3 })).toBe(66.7);
  });
});

describe("classesNeeded", () => {
  it("is 0 when already at or above the threshold", () => {
    expect(classesNeeded({ attended: 30, total: 40 }, 75)).toBe(0);
  });

  it("solves for the smallest number of consecutive classes", () => {
    // 20/30 = 66.7%; after 10 more: 30/40 = 75%.
    expect(classesNeeded({ attended: 20, total: 30 }, 75)).toBe(10);
    // 0/1 → needs 3: 3/4 = 75%.
    expect(classesNeeded({ attended: 0, total: 1 }, 75)).toBe(3);
  });

  it("is unreachable at a 100% threshold after any absence", () => {
    expect(classesNeeded({ attended: 9, total: 10 }, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("classesCanMiss", () => {
  it("counts the buffer above the threshold", () => {
    // 36/40 = 90%: can miss 8 → 36/48 = 75%.
    expect(classesCanMiss({ attended: 36, total: 40 }, 75)).toBe(8);
    expect(classesCanMiss({ attended: 20, total: 30 }, 75)).toBe(0);
  });
});

it("addTallies sums", () => {
  expect(
    addTallies([
      { attended: 1, total: 2 },
      { attended: 3, total: 4 },
    ]),
  ).toEqual({ attended: 4, total: 6 });
});
