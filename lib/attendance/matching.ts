/**
 * Face → student matching for one classroom photo, and the attendance proposal built from
 * all of a session's photos. Pure functions: easy to test and to calibrate.
 */

export type MatchStatus = "MATCHED" | "UNCERTAIN" | "UNMATCHED";
export type Thresholds = { match: number; uncertain: number };

export type Candidate = { studentId: string; samples: number[][] };
export type FaceMatch = {
  /** Index of the face in the input array. */
  index: number;
  studentId: string | null;
  /** Assigned similarity, or the best similarity seen for an unmatched face (calibration data). */
  similarity: number | null;
  status: MatchStatus;
};

/** Cosine similarity of L2-normalized vectors. */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Best similarity of a face against any of a student's enrollment samples. */
export const studentScore = (face: number[], c: Candidate) =>
  c.samples.reduce((best, s) => Math.max(best, dot(face, s)), Number.NEGATIVE_INFINITY);

/**
 * Greedy one-to-one assignment within a photo: highest-scoring (face, student) pairs first,
 * each face and each student used at most once, pairs below `uncertain` never assigned.
 */
export function matchFaces(faces: number[][], candidates: Candidate[], t: Thresholds): FaceMatch[] {
  const pairs: { face: number; student: number; score: number }[] = [];
  const bestPerFace = faces.map(() => Number.NEGATIVE_INFINITY);
  faces.forEach((f, fi) =>
    candidates.forEach((c, ci) => {
      const score = studentScore(f, c);
      bestPerFace[fi] = Math.max(bestPerFace[fi], score);
      if (score >= t.uncertain) pairs.push({ face: fi, student: ci, score });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);

  const result: FaceMatch[] = faces.map((_, index) => ({
    index,
    studentId: null,
    similarity: Number.isFinite(bestPerFace[index]) ? bestPerFace[index] : null,
    status: "UNMATCHED",
  }));
  const usedStudents = new Set<number>();
  for (const p of pairs) {
    if (result[p.face].status !== "UNMATCHED" || usedStudents.has(p.student)) continue;
    usedStudents.add(p.student);
    result[p.face] = {
      index: p.face,
      studentId: candidates[p.student].studentId,
      similarity: p.score,
      status: p.score >= t.match ? "MATCHED" : "UNCERTAIN",
    };
  }
  return result;
}

export type ProposalSource = "FACE" | "UNCERTAIN" | "NONE";
export type Proposal = {
  source: ProposalSource;
  similarity: number | null;
  /** Suggested status; null means the faculty member must decide (uncertain match). */
  suggested: "PRESENT" | "ABSENT" | null;
};

/**
 * Per-student proposal across all photos of a session: the strongest detection wins
 * (a confident match anywhere beats an uncertain one elsewhere).
 */
export function proposeAttendance(
  studentIds: string[],
  detections: { studentId: string | null; similarity: number | null; status: MatchStatus }[],
): Map<string, Proposal> {
  const best = new Map<string, { status: MatchStatus; similarity: number }>();
  for (const d of detections) {
    if (!d.studentId || d.status === "UNMATCHED") continue;
    const current = best.get(d.studentId);
    const rank = (s: MatchStatus) => (s === "MATCHED" ? 2 : 1);
    const sim = d.similarity ?? 0;
    if (
      !current ||
      rank(d.status) > rank(current.status) ||
      (rank(d.status) === rank(current.status) && sim > current.similarity)
    ) {
      best.set(d.studentId, { status: d.status, similarity: sim });
    }
  }
  return new Map<string, Proposal>(
    studentIds.map((id): [string, Proposal] => {
      const b = best.get(id);
      if (!b) return [id, { source: "NONE", similarity: null, suggested: "ABSENT" }];
      return b.status === "MATCHED"
        ? [id, { source: "FACE", similarity: b.similarity, suggested: "PRESENT" }]
        : [id, { source: "UNCERTAIN", similarity: b.similarity, suggested: null }];
    }),
  );
}
