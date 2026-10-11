import { describe, expect, it } from "vitest";
import { matchFaces, proposeAttendance, type Candidate } from "@/lib/attendance/matching";

/** Unit vector in 4-D at the given angle mixes, so dot products are easy to reason about. */
const v = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};
const t = { match: 0.8, uncertain: 0.5 };

const alice: Candidate = { studentId: "alice", samples: [v(1, 0, 0, 0), v(0.9, 0.1, 0, 0)] };
const bob: Candidate = { studentId: "bob", samples: [v(0, 1, 0, 0)] };
const carol: Candidate = { studentId: "carol", samples: [v(0, 0, 1, 0)] };

describe("matchFaces", () => {
  it("matches confidently, flags uncertain, and leaves strangers unmatched", () => {
    const result = matchFaces(
      [v(1, 0.05, 0, 0), v(0.6, 0.8, 0, 0.3), v(0, 0, 0, 1)],
      [alice, bob, carol],
      t,
    );
    expect(result[0]).toMatchObject({ studentId: "alice", status: "MATCHED" });
    expect(result[1]).toMatchObject({ studentId: "bob", status: "UNCERTAIN" });
    expect(result[2]).toMatchObject({ studentId: null, status: "UNMATCHED" });
    // The stranger's best score is kept for calibration.
    expect(result[2].similarity).toBeCloseTo(0, 5);
  });

  it("uses each student's best sample", () => {
    const [r] = matchFaces([v(0.9, 0.1, 0, 0)], [alice], t);
    expect(r.similarity).toBeCloseTo(1, 5);
  });

  it("never assigns one student to two faces in the same photo", () => {
    // Both faces resemble Alice; the closer one wins, the other stays unmatched.
    const result = matchFaces([v(1, 0.3, 0, 0), v(1, 0, 0, 0)], [alice], t);
    expect(result.filter((r) => r.studentId === "alice")).toHaveLength(1);
    expect(result[1]).toMatchObject({ studentId: "alice", status: "MATCHED" });
    expect(result[0].status).toBe("UNMATCHED");
  });

  it("prefers the globally best pairing over input order", () => {
    // Face 0 is a weak Alice/Bob blend; face 1 is clearly Alice. Alice should go to face 1,
    // leaving face 0 to Bob.
    const result = matchFaces([v(0.7, 0.71, 0, 0), v(1, 0, 0, 0)], [alice, bob], t);
    expect(result[1].studentId).toBe("alice");
    expect(result[0].studentId).toBe("bob");
  });

  it("handles no candidates and no faces", () => {
    expect(matchFaces([v(1, 0, 0, 0)], [], t)[0]).toMatchObject({
      status: "UNMATCHED",
      similarity: null,
    });
    expect(matchFaces([], [alice], t)).toEqual([]);
  });
});

describe("proposeAttendance", () => {
  it("suggests present for matches, asks for uncertain, absent otherwise", () => {
    const p = proposeAttendance(
      ["alice", "bob", "carol"],
      [
        { studentId: "alice", similarity: 0.9, status: "MATCHED" },
        { studentId: "bob", similarity: 0.6, status: "UNCERTAIN" },
        { studentId: null, similarity: 0.2, status: "UNMATCHED" },
      ],
    );
    expect(p.get("alice")).toEqual({ source: "FACE", similarity: 0.9, suggested: "PRESENT" });
    expect(p.get("bob")).toEqual({ source: "UNCERTAIN", similarity: 0.6, suggested: null });
    expect(p.get("carol")).toEqual({ source: "NONE", similarity: null, suggested: "ABSENT" });
  });

  it("takes the strongest result across photos", () => {
    const p = proposeAttendance(
      ["bob"],
      [
        { studentId: "bob", similarity: 0.65, status: "UNCERTAIN" },
        { studentId: "bob", similarity: 0.82, status: "MATCHED" },
        { studentId: "bob", similarity: 0.7, status: "UNCERTAIN" },
      ],
    );
    expect(p.get("bob")).toMatchObject({ source: "FACE", similarity: 0.82 });
  });
});
