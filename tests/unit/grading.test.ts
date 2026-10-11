import { describe, expect, it } from "vitest";
import {
  courseProgress,
  creditsEarned,
  distribution,
  gpa,
  gradeFor,
  summarize,
} from "@/lib/academics/grading";

const bands = [
  { letter: "O", minPercent: 90, gradePoint: 10, isPass: true },
  { letter: "A+", minPercent: 80, gradePoint: 9, isPass: true },
  { letter: "A", minPercent: 70, gradePoint: 8, isPass: true },
  { letter: "B", minPercent: 50, gradePoint: 6, isPass: true },
  { letter: "P", minPercent: 40, gradePoint: 4, isPass: true },
  { letter: "F", minPercent: 0, gradePoint: 0, isPass: false },
];

const exams = [
  { id: "quiz", maxMarks: 20, weightage: 20 },
  { id: "mid", maxMarks: 50, weightage: 30 },
  { id: "end", maxMarks: 100, weightage: 50 },
];

describe("courseProgress", () => {
  it("weights each exam and reports completion", () => {
    const p = courseProgress(exams, [
      { examId: "quiz", marksObtained: 16, isAbsent: false }, // 16 pts of 20
      { examId: "mid", marksObtained: 40, isAbsent: false }, // 24 pts of 30
      { examId: "end", marksObtained: 70, isAbsent: false }, // 35 pts of 50
    ]);
    expect(p).toEqual({ percent: 75, weightGraded: 100, complete: true });
  });

  it("normalizes over the exams graded so far", () => {
    const p = courseProgress(exams, [
      { examId: "quiz", marksObtained: 10, isAbsent: false }, // 10 of 20
      { examId: "mid", marksObtained: 50, isAbsent: false }, // 30 of 30
    ]);
    expect(p).toEqual({ percent: 80, weightGraded: 50, complete: false });
  });

  it("scores absence as zero but skips marks not yet entered", () => {
    const p = courseProgress(exams, [
      { examId: "quiz", marksObtained: null, isAbsent: true },
      { examId: "mid", marksObtained: null, isAbsent: false },
    ]);
    expect(p).toEqual({ percent: 0, weightGraded: 20, complete: false });
  });

  it("is incomplete when weightages don't add up to 100", () => {
    const p = courseProgress(
      [{ id: "q", maxMarks: 10, weightage: 40 }],
      [{ examId: "q", marksObtained: 5, isAbsent: false }],
    );
    expect(p.complete).toBe(false);
    expect(courseProgress([], []).percent).toBeNull();
  });
});

describe("gradeFor", () => {
  it.each([
    [100, "O"],
    [90, "O"],
    [89.99, "A+"],
    [50, "B"],
    [39.99, "F"],
    [0, "F"],
  ])("%s%% → %s", (pct, letter) => expect(gradeFor(pct, bands).letter).toBe(letter));
});

describe("gpa / credits", () => {
  const results = [
    { credits: 4, gradePoint: 10, isPass: true },
    { credits: 3, gradePoint: 8, isPass: true },
    { credits: 3, gradePoint: 0, isPass: false },
  ];
  it("is credit-weighted, failures counting as zero", () => {
    // (40 + 24 + 0) / 10 = 6.4
    expect(gpa(results)).toBe(6.4);
    expect(creditsEarned(results)).toBe(7);
  });
  it("is null with no credits", () => expect(gpa([])).toBeNull());
});

describe("distribution & summarize", () => {
  it("lists every band in order with zero counts", () => {
    expect(distribution(["A", "O", "A", "F"], bands)).toEqual([
      { letter: "O", count: 1 },
      { letter: "A+", count: 0 },
      { letter: "A", count: 2 },
      { letter: "B", count: 0 },
      { letter: "P", count: 0 },
      { letter: "F", count: 1 },
    ]);
  });
  it("summarizes", () => {
    expect(summarize([3, 1, 2, 10])).toEqual({
      count: 4,
      average: 4,
      median: 2.5,
      min: 1,
      max: 10,
    });
    expect(summarize([])).toBeNull();
  });
});
