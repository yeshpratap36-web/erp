/**
 * Grading math (pure). Conventions:
 * - Each exam contributes (obtained / max) × weightage points; weightages of a course's
 *   exams sum to 100 when the course is fully assessed.
 * - "Absent" scores 0. A mark not yet entered is left out (the course is in progress).
 * - SGPA/CGPA are credit-weighted grade-point averages over every attempted course; failed
 *   courses count in the denominator (0 points) and earn no credits.
 */

export type ExamInfo = { id: string; maxMarks: number; weightage: number };
export type MarkInfo = { examId: string; marksObtained: number | null; isAbsent: boolean };
export type GradeBandInfo = {
  letter: string;
  minPercent: number;
  gradePoint: number;
  isPass: boolean;
};

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export type CourseProgress = {
  /** Percentage over the exams graded so far (null when nothing is graded yet). */
  percent: number | null;
  /** Total weightage of the graded exams. */
  weightGraded: number;
  /** Every exam has a mark and the weightages add up to 100. */
  complete: boolean;
};

export function courseProgress(exams: ExamInfo[], marks: MarkInfo[]): CourseProgress {
  const byExam = new Map(marks.map((m) => [m.examId, m]));
  let points = 0;
  let weightGraded = 0;
  for (const exam of exams) {
    const mark = byExam.get(exam.id);
    if (!mark || (!mark.isAbsent && mark.marksObtained === null)) continue;
    const obtained = mark.isAbsent ? 0 : mark.marksObtained!;
    points += (obtained / exam.maxMarks) * exam.weightage;
    weightGraded += exam.weightage;
  }
  const totalWeight = exams.reduce((s, e) => s + e.weightage, 0);
  return {
    percent: weightGraded > 0 ? round((points / weightGraded) * 100) : null,
    weightGraded: round(weightGraded),
    complete:
      exams.length > 0 && weightGraded === totalWeight && Math.abs(totalWeight - 100) < 1e-6,
  };
}

/** The band whose minimum is the highest one at or below `percent`. */
export function gradeFor(percent: number, bands: GradeBandInfo[]): GradeBandInfo {
  if (bands.length === 0) throw new Error("Grade scale has no bands");
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percent >= b.minPercent) ?? sorted[sorted.length - 1];
}

export type CourseGrade = { credits: number; gradePoint: number; isPass: boolean };

/** Credit-weighted GPA, rounded to 2 decimals; null when no credits were attempted. */
export function gpa(results: CourseGrade[]): number | null {
  const credits = results.reduce((s, r) => s + r.credits, 0);
  if (credits === 0) return null;
  return round(results.reduce((s, r) => s + r.credits * r.gradePoint, 0) / credits);
}

export const creditsEarned = (results: CourseGrade[]) =>
  results.reduce((s, r) => s + (r.isPass ? r.credits : 0), 0);

/** Count of each letter, in the scale's order (best first), including zero counts. */
export function distribution(letters: string[], bands: GradeBandInfo[]) {
  const counts = new Map<string, number>();
  for (const l of letters) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...bands]
    .sort((a, b) => b.minPercent - a.minPercent)
    .map((b) => ({ letter: b.letter, count: counts.get(b.letter) ?? 0 }));
}

export function summarize(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: values.length,
    average: round(values.reduce((s, v) => s + v, 0) / values.length),
    median: round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}
