import { describe, expect, it } from "vitest";
import {
  correctionProblem,
  dateRangesOverlap,
  isVisibleTo,
  leaveDateProblems,
  type AnnouncementTarget,
  type Viewer,
} from "@/lib/communication/rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const now = new Date("2026-10-12T10:00:00Z");
const base: AnnouncementTarget = {
  audience: "ALL",
  targetRole: null,
  departmentId: null,
  sectionId: null,
  publishedAt: d("2026-10-01"),
  expiresAt: null,
};
const student: Viewer = { role: "STUDENT", departmentId: "cse", sectionIds: ["secA"] };
const faculty: Viewer = { role: "FACULTY", departmentId: "cse", sectionIds: ["secA", "secB"] };
const admin: Viewer = { role: "SUPER_ADMIN", departmentId: null, sectionIds: [] };

describe("isVisibleTo", () => {
  it("respects audience", () => {
    expect(isVisibleTo(base, student, now)).toBe(true);
    expect(isVisibleTo({ ...base, audience: "ROLE", targetRole: "FACULTY" }, student, now)).toBe(
      false,
    );
    expect(isVisibleTo({ ...base, audience: "ROLE", targetRole: "FACULTY" }, faculty, now)).toBe(
      true,
    );
    expect(
      isVisibleTo({ ...base, audience: "DEPARTMENT", departmentId: "ece" }, student, now),
    ).toBe(false);
    expect(
      isVisibleTo({ ...base, audience: "DEPARTMENT", departmentId: "cse" }, student, now),
    ).toBe(true);
    expect(isVisibleTo({ ...base, audience: "SECTION", sectionId: "secB" }, student, now)).toBe(
      false,
    );
    expect(isVisibleTo({ ...base, audience: "SECTION", sectionId: "secB" }, faculty, now)).toBe(
      true,
    );
  });

  it("hides expired and scheduled announcements from everyone", () => {
    expect(isVisibleTo({ ...base, expiresAt: d("2026-10-10") }, admin, now)).toBe(false);
    expect(isVisibleTo({ ...base, publishedAt: d("2026-10-20") }, admin, now)).toBe(false);
    expect(isVisibleTo({ ...base, audience: "SECTION", sectionId: "x" }, admin, now)).toBe(true);
  });
});

describe("leave rules", () => {
  const today = d("2026-10-12");
  it("accepts a normal request", () =>
    expect(leaveDateProblems(d("2026-10-14"), d("2026-10-16"), today)).toEqual([]));
  it("rejects reversed, too long and too old ranges", () => {
    expect(leaveDateProblems(d("2026-10-16"), d("2026-10-14"), today)).toContain(
      "The end date must be on or after the start date",
    );
    expect(leaveDateProblems(d("2026-10-12"), d("2026-11-30"), today)).toContain(
      "Leave can be at most 30 days",
    );
    expect(leaveDateProblems(d("2026-09-01"), d("2026-09-02"), today)).toContain(
      "Leave can start at most 7 days ago",
    );
  });
  it("detects overlap inclusively", () => {
    expect(
      dateRangesOverlap(d("2026-10-01"), d("2026-10-05"), d("2026-10-05"), d("2026-10-09")),
    ).toBe(true);
    expect(
      dateRangesOverlap(d("2026-10-01"), d("2026-10-04"), d("2026-10-05"), d("2026-10-09")),
    ).toBe(false);
  });
});

describe("correctionProblem", () => {
  const today = d("2026-10-12");
  const rec = { status: "ABSENT" as const, sessionDate: d("2026-10-05"), finalized: true };
  it("allows a recent absence to be disputed", () =>
    expect(correctionProblem(rec, "PRESENT", today)).toBeNull());
  it("blocks no-ops, self-absence, unconfirmed and stale classes", () => {
    expect(correctionProblem({ ...rec, status: "PRESENT" }, "PRESENT", today)).toMatch(/already/);
    expect(correctionProblem({ ...rec, status: "PRESENT" }, "ABSENT", today)).toMatch(/absent/);
    expect(correctionProblem({ ...rec, finalized: false }, "PRESENT", today)).toMatch(/confirmed/);
    expect(correctionProblem({ ...rec, sessionDate: d("2026-08-01") }, "PRESENT", today)).toMatch(
      /30 days/,
    );
  });
});
